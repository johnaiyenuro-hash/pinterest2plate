import { AISLE_ORDER } from './stores';
import type { ConsolidatedBasket, ConsolidatedItem, Ingredient, Recipe, SupermarketAisle } from './types';

type UnitFamily = 'mass' | 'volume' | 'spoon' | 'count' | 'other';

interface NormalizedQty {
  family: UnitFamily;
  baseValue: number; // g for mass, ml for volume, tsp for spoon, count for count
  canonicalUnit: string;
}

const COUNT_UNIT_ALIASES: Record<string, string> = {
  clove: 'cloves',
  cloves: 'cloves',
  whole: 'whole',
  egg: 'eggs',
  eggs: 'eggs',
  fillet: 'fillets',
  fillets: 'fillets',
  pack: 'packs',
  packs: 'packs',
  tin: 'tins',
  tins: 'tins',
  can: 'tins',
  cans: 'tins',
  jar: 'jars',
  jars: 'jars',
  bottle: 'bottles',
  bottles: 'bottles',
  bag: 'bags',
  bags: 'bags',
  bunch: 'bunches',
  bunches: 'bunches',
  head: 'heads',
  heads: 'heads',
  pouch: 'pouches',
  pouches: 'pouches',
  pot: 'pots',
  pots: 'pots',
  tub: 'tubs',
  tubs: 'tubs',
  loaf: 'loaves',
  loaves: 'loaves',
  cube: 'cubes',
  cubes: 'cubes',
  pod: 'pods',
  pods: 'pods',
  pepper: 'peppers',
  peppers: 'peppers',
  stalk: 'stalks',
  stalks: 'stalks',
  tube: 'tubes',
  tubes: 'tubes',
  box: 'boxes',
  boxes: 'boxes',
  block: 'blocks',
  blocks: 'blocks',
  carton: 'cartons',
  cartons: 'cartons',
  medium: 'medium',
  large: 'large',
  small: 'small',
};

function normalizeUnit(value: number, rawUnit: string | null | undefined): NormalizedQty | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  const u = (rawUnit || '').trim().toLowerCase();
  if (!u) return { family: 'count', baseValue: value, canonicalUnit: 'whole' };

  if (u === 'g' || u === 'gram' || u === 'grams') {
    return { family: 'mass', baseValue: value, canonicalUnit: 'g' };
  }
  if (u === 'kg' || u === 'kilogram' || u === 'kilograms') {
    return { family: 'mass', baseValue: value * 1000, canonicalUnit: 'g' };
  }
  if (u === 'ml' || u === 'millilitre' || u === 'millilitres') {
    return { family: 'volume', baseValue: value, canonicalUnit: 'ml' };
  }
  if (u === 'l' || u === 'litre' || u === 'litres' || u === 'liter' || u === 'liters') {
    return { family: 'volume', baseValue: value * 1000, canonicalUnit: 'ml' };
  }
  if (u === 'tsp' || u === 'teaspoon' || u === 'teaspoons') {
    return { family: 'spoon', baseValue: value, canonicalUnit: 'tsp' };
  }
  if (u === 'tbsp' || u === 'tablespoon' || u === 'tablespoons') {
    return { family: 'spoon', baseValue: value * 3, canonicalUnit: 'tsp' };
  }

  const countUnit = COUNT_UNIT_ALIASES[u];
  if (countUnit) {
    return { family: 'count', baseValue: value, canonicalUnit: countUnit };
  }

  return { family: 'other', baseValue: value, canonicalUnit: u };
}

export function formatNumber(n: number): string {
  if (Math.abs(n - Math.round(n)) < 0.01) return String(Math.round(n));
  const rounded = Math.round(n * 100) / 100;
  if (Math.abs(rounded - 0.25) < 0.02) return '¼';
  if (Math.abs(rounded - 0.5) < 0.02) return '½';
  if (Math.abs(rounded - 0.75) < 0.02) return '¾';
  if (Math.abs(rounded - 1.5) < 0.02) return '1½';
  if (Math.abs(rounded - 2.5) < 0.02) return '2½';
  return Number(rounded.toFixed(1)).toString();
}

function singularize(unit: string): string {
  if (unit === 'bunches') return 'bunch';
  if (unit === 'pouches') return 'pouch';
  if (unit === 'boxes') return 'box';
  if (unit === 'loaves') return 'loaf';
  if (unit.endsWith('s') && unit.length > 2) return unit.slice(0, -1);
  return unit;
}

const WHOLE_PACKAGE_UNITS = new Set([
  'packs',
  'tins',
  'jars',
  'bottles',
  'bags',
  'pouches',
  'pots',
  'tubs',
  'loaves',
  'boxes',
  'blocks',
  'cartons',
  'tubes',
]);

export function formatNormalizedQty(qty: NormalizedQty): string {
  const { family, baseValue, canonicalUnit } = qty;
  if (family === 'mass') {
    if (baseValue >= 1000) {
      return `${formatNumber(baseValue / 1000)}kg`;
    }
    return `${formatNumber(baseValue)}g`;
  }
  if (family === 'volume') {
    if (baseValue >= 1000) {
      return `${formatNumber(baseValue / 1000)}L`;
    }
    return `${formatNumber(baseValue)}ml`;
  }
  if (family === 'spoon') {
    if (baseValue >= 3 && baseValue % 3 === 0) {
      return `${formatNumber(baseValue / 3)} tbsp`;
    }
    if (baseValue >= 3) {
      const tbsp = Math.floor(baseValue / 3);
      const remTsp = baseValue - tbsp * 3;
      if (remTsp < 0.1) return `${tbsp} tbsp`;
      return `${tbsp} tbsp + ${formatNumber(remTsp)} tsp`;
    }
    return `${formatNumber(baseValue)} tsp`;
  }
  if (family === 'count') {
    const displayVal = WHOLE_PACKAGE_UNITS.has(canonicalUnit)
      ? Math.max(1, Math.ceil(baseValue - 0.01))
      : baseValue;
    const label = Math.abs(displayVal - 1) < 0.01 ? singularize(canonicalUnit) : canonicalUnit;
    return `${formatNumber(displayVal)} ${label}`;
  }
  return `${formatNumber(baseValue)} ${canonicalUnit}`.trim();
}

export function formatScaledIngredientQty(ing: Ingredient, scale: number): string {
  if (Math.abs(scale - 1) < 0.001) return ing.qtyDisplay;
  if (ing.qtyNumber != null && Number.isFinite(ing.qtyNumber) && ing.qtyNumber > 0) {
    const normalized = normalizeUnit(ing.qtyNumber * scale, ing.qtyUnit);
    if (normalized) return formatNormalizedQty(normalized);
  }
  return ing.qtyDisplay;
}

function canonicalSearchKey(ing: Ingredient): string {
  return ing.ukSearchQuery
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || ing.name.toLowerCase().trim();
}

interface Bucket {
  key: string;
  name: string;
  ukSearchQuery: string;
  aisle: SupermarketAisle;
  pantry: boolean;
  fromRecipes: Set<string>;
  prepNotes: Set<string>;
  unitTotals: Map<string, NormalizedQty>;
  fallbackDisplays: string[];
}

export function consolidateBasket(
  recipes: Recipe[],
  selectedRecipeIds: string[],
  servingsOverride?: Record<string, number>,
): ConsolidatedBasket {
  const idSet = new Set(selectedRecipeIds);
  const selectedRecipes = recipes.filter((r) => idSet.has(r.id) && r.status === 'ready');
  const buckets = new Map<string, Bucket>();

  for (const recipe of selectedRecipes) {
    const targetServings = servingsOverride?.[recipe.id] ?? recipe.servings;
    const scale = recipe.servings > 0 ? targetServings / recipe.servings : 1;

    for (const ing of recipe.ingredients) {
      const key = canonicalSearchKey(ing);
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = {
          key,
          name: ing.name,
          ukSearchQuery: ing.ukSearchQuery,
          aisle: ing.aisle,
          pantry: ing.pantry,
          fromRecipes: new Set(),
          prepNotes: new Set(),
          unitTotals: new Map(),
          fallbackDisplays: [],
        };
        buckets.set(key, bucket);
      }

      bucket.fromRecipes.add(recipe.title);
      if (ing.prepNote) bucket.prepNotes.add(ing.prepNote);
      // If any recipe marks it as non-pantry (e.g. main bulk ingredient), treat as non-pantry unless all pantry
      bucket.pantry = bucket.pantry && ing.pantry;

      const scaledNum = ing.qtyNumber != null ? ing.qtyNumber * scale : null;
      const normalized = scaledNum != null ? normalizeUnit(scaledNum, ing.qtyUnit) : null;

      if (normalized) {
        const unitKey = `${normalized.family}:${normalized.canonicalUnit}`;
        const existing = bucket.unitTotals.get(unitKey);
        if (existing) {
          existing.baseValue += normalized.baseValue;
        } else {
          bucket.unitTotals.set(unitKey, { ...normalized });
        }
      } else {
        const display = formatScaledIngredientQty(ing, scale);
        if (!bucket.fallbackDisplays.includes(display)) {
          bucket.fallbackDisplays.push(display);
        }
      }
    }
  }

  const aislesRaw: Record<string, ConsolidatedItem[]> = {};
  let pantryCount = 0;

  for (const bucket of buckets.values()) {
    const parts: string[] = [];
    for (const qty of bucket.unitTotals.values()) {
      parts.push(formatNormalizedQty(qty));
    }
    for (const fb of bucket.fallbackDisplays) {
      parts.push(fb);
    }

    const combinedQty = parts.join(' + ') || 'As needed';
    if (bucket.pantry) pantryCount++;

    const item: ConsolidatedItem = {
      key: bucket.key,
      name: bucket.name,
      ukSearchQuery: bucket.ukSearchQuery,
      aisle: bucket.aisle,
      combinedQty,
      isPantry: bucket.pantry,
      fromRecipes: Array.from(bucket.fromRecipes),
      prepNotes: Array.from(bucket.prepNotes),
    };

    if (!aislesRaw[bucket.aisle]) aislesRaw[bucket.aisle] = [];
    aislesRaw[bucket.aisle].push(item);
  }

  // Sort aisles in canonical supermarket shopping order
  const aisles: Record<string, ConsolidatedItem[]> = {};
  for (const aisleName of AISLE_ORDER) {
    if (aislesRaw[aisleName] && aislesRaw[aisleName].length > 0) {
      aisles[aisleName] = aislesRaw[aisleName].sort((a, b) => a.name.localeCompare(b.name));
    }
  }
  for (const [aisleName, items] of Object.entries(aislesRaw)) {
    if (!aisles[aisleName] && items.length > 0) {
      aisles[aisleName] = items.sort((a, b) => a.name.localeCompare(b.name));
    }
  }

  return {
    recipesCount: selectedRecipes.length,
    totalIngredients: buckets.size,
    pantryCount,
    aisles,
  };
}

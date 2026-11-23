import { z } from 'zod';

export const RECIPE_CATEGORIES = [
  'Quick & Easy',
  'Comfort Food',
  'Healthy & Veggie',
  'Soups & Stews',
  'Appetizers & Bites',
  'Baking & Sweet',
] as const;

export const SUPERMARKET_AISLES = [
  'Fresh Produce',
  'Meat & Poultry',
  'Fish & Seafood',
  'Dairy & Chilled',
  'Bakery',
  'Food Cupboard',
  'Pantry & World Food',
  'Frozen',
] as const;

export const SOURCE_TYPES = ['video', 'image', 'carousel', 'blog', 'curated'] as const;
export const RECIPE_STATUSES = ['ready', 'queued', 'extracting', 'skipped_non_recipe', 'failed'] as const;
export const DIFFICULTIES = ['Easy', 'Medium', 'Project'] as const;

export const IngredientSchema = z.object({
  name: z.string().min(1),
  qtyNumber: z.number().nullable().optional().default(null),
  qtyUnit: z.string().nullable().optional().default(null),
  qtyDisplay: z.string().min(1),
  prepNote: z.string().nullable().optional().transform((v) => v ?? undefined),
  aisle: z.enum(SUPERMARKET_AISLES).catch('Food Cupboard'),
  pantry: z.boolean().default(false),
  ukSearchQuery: z.string().min(1),
});

export const CookingStepSchema = z.object({
  stepNumber: z.number().int().positive(),
  title: z.string().min(1),
  instruction: z.string().min(1),
  durationMinutes: z.number().positive().nullable().optional(),
  temperature: z.string().nullable().optional(),
  videoTimestamp: z.string().nullable().optional(),
  tip: z.string().nullable().optional(),
});

export const RecipeSchema = z.object({
  id: z.string().min(1),
  boardId: z.string().min(1).default('curated_starter'),
  status: z.enum(RECIPE_STATUSES).default('ready'),
  sourceType: z.enum(SOURCE_TYPES).default('curated'),
  sourcePinUrl: z.string().default(''),
  outboundUrl: z.string().optional(),
  videoUrl: z.string().optional(),
  imageUrl: z.string().default(''),
  title: z.string().min(1),
  summary: z.string().default(''),
  creator: z.string().default('Pinterest Creator'),
  category: z.enum(RECIPE_CATEGORIES).catch('Comfort Food'),
  tags: z.array(z.string()).default([]),
  prepMinutes: z.number().int().nonnegative().default(15),
  cookMinutes: z.number().int().nonnegative().default(15),
  servings: z.number().int().positive().default(4),
  difficulty: z.enum(DIFFICULTIES).catch('Easy'),
  ingredients: z.array(IngredientSchema).default([]),
  steps: z.array(CookingStepSchema).default([]),
  confidence: z.number().min(0).max(1).default(0.95),
  extractionNotes: z.string().optional(),
  rawCaption: z.string().optional(),
  extractedAt: z.string().default(() => new Date().toISOString()),
});

export const BoardSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  handle: z.string().optional(),
  url: z.string().default(''),
  source: z.enum(['public', 'oauth', 'curated']).default('public'),
  pinCount: z.number().int().nonnegative().default(0),
  lastSyncedAt: z.string().default(() => new Date().toISOString()),
});

export type RecipeCategory = (typeof RECIPE_CATEGORIES)[number];
export type SupermarketAisle = (typeof SUPERMARKET_AISLES)[number];
export type SourceType = (typeof SOURCE_TYPES)[number];
export type RecipeStatus = (typeof RECIPE_STATUSES)[number];
export type Difficulty = (typeof DIFFICULTIES)[number];
export type Ingredient = z.infer<typeof IngredientSchema>;
export type CookingStep = z.infer<typeof CookingStepSchema>;
export type Recipe = z.infer<typeof RecipeSchema>;
export type Board = z.infer<typeof BoardSchema>;

export interface RawPin {
  pinId: string;
  boardId: string;
  title: string;
  description: string;
  pinUrl: string;
  outboundUrl?: string;
  mediaType: 'video' | 'image' | 'carousel' | 'blog';
  imageUrl: string;
  carouselImageUrls?: string[];
  videoUrl?: string;
  durationSec?: number;
  creator: string;
}

export type SupermarketKey = 'tesco' | 'sainsburys' | 'ocado' | 'asda' | 'aldi' | 'lidl';

export interface ConsolidatedItem {
  key: string;
  name: string;
  ukSearchQuery: string;
  aisle: SupermarketAisle;
  combinedQty: string;
  isPantry: boolean;
  fromRecipes: string[];
  prepNotes: string[];
}

export interface ConsolidatedBasket {
  recipesCount: number;
  totalIngredients: number;
  pantryCount: number;
  aisles: Record<string, ConsolidatedItem[]>;
}

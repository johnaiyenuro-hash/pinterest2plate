import type { Recipe } from './types';

export interface FoodTagDefinition {
  id: string;
  label: string;
  matches: (recipe: Recipe) => boolean;
}

function recipeSearchText(recipe: Recipe): string {
  const ingText = recipe.ingredients.map((i) => `${i.name} ${i.ukSearchQuery}`).join(' ');
  return `${recipe.title} ${recipe.summary} ${recipe.tags.join(' ')} ${ingText}`.toLowerCase();
}

function hasAnyWord(text: string, words: string[]): boolean {
  return words.some((w) => new RegExp(`\\b${w}`, 'i').test(text));
}

const MEAT_OR_FISH_WORDS = [
  'chicken',
  'beef',
  'steak',
  'goat',
  'lamb',
  'pork',
  'bacon',
  'sausage',
  'ham',
  'turkey',
  'duck',
  'salmon',
  'tuna',
  'prawn',
  'shrimp',
  'crab',
  'cod',
  'fish',
  'seafood',
  'anchov',
];

export const FOOD_TABS: FoodTagDefinition[] = [
  {
    id: 'chicken',
    label: 'Chicken',
    matches: (r) => hasAnyWord(recipeSearchText(r), ['chicken', 'turkey']),
  },
  {
    id: 'beef',
    label: 'Beef & Meat',
    matches: (r) => hasAnyWord(recipeSearchText(r), ['beef', 'steak', 'goat', 'lamb', 'brisket', 'veal']),
  },
  {
    id: 'pork',
    label: 'Pork',
    matches: (r) => hasAnyWord(recipeSearchText(r), ['pork', 'bacon', 'pancetta', 'chorizo', 'ham', 'sausage']),
  },
  {
    id: 'seafood',
    label: 'Fish & Seafood',
    matches: (r) =>
      hasAnyWord(recipeSearchText(r), ['salmon', 'tuna', 'prawn', 'shrimp', 'crab', 'cod', 'haddock', 'mackerel', 'seafood', 'fish']),
  },
  {
    id: 'pasta',
    label: 'Pasta & Noodles',
    matches: (r) =>
      hasAnyWord(recipeSearchText(r), [
        'pasta',
        'tortellini',
        'noodle',
        'ramen',
        'udon',
        'spaghetti',
        'penne',
        'rigatoni',
        'lasagn',
        'macaroni',
        'gnocchi',
        'conchiglioni',
        'orzo',
        'fettuccine',
        'linguine',
      ]),
  },
  {
    id: 'rice',
    label: 'Rice & Grains',
    matches: (r) =>
      hasAnyWord(recipeSearchText(r), ['rice', 'jollof', 'onigiri', 'sushi', 'risotto', 'biryani', 'couscous', 'quinoa']),
  },
  {
    id: 'veggie',
    label: 'Veggie & Tofu',
    matches: (r) => {
      const text = recipeSearchText(r);
      if (hasAnyWord(text, ['tofu', 'tempeh', 'paneer', 'halloumi', 'vegan', 'vegetarian'])) return true;
      return !hasAnyWord(text, MEAT_OR_FISH_WORDS);
    },
  },
  {
    id: 'eggs_cheese',
    label: 'Eggs & Cheese',
    matches: (r) =>
      hasAnyWord(recipeSearchText(r), ['egg', 'mozzarella', 'cheddar', 'parmesan', 'ricotta', 'feta', 'halloumi', 'burrata']),
  },
];

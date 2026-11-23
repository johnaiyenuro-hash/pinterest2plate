import { NextRequest, NextResponse } from 'next/server';
import { consolidateBasket } from '@/lib/consolidate';
import { getAllRecipes } from '@/lib/storage';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      recipeIds?: string[];
      servingsOverride?: Record<string, number>;
    };
    const recipes = await getAllRecipes();
    const basket = consolidateBasket(recipes, body.recipeIds || [], body.servingsOverride);
    return NextResponse.json(basket);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to consolidate basket' },
      { status: 400 },
    );
  }
}

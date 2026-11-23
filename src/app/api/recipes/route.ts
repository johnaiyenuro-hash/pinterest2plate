import { NextRequest, NextResponse } from 'next/server';
import { getAllBoards, getAllRecipes, upsertRecipe } from '@/lib/storage';
import { RecipeSchema } from '@/lib/types';

export async function GET(req: NextRequest) {
  try {
    const boardId = req.nextUrl.searchParams.get('boardId') || undefined;
    const [boards, recipes] = await Promise.all([getAllBoards(), getAllRecipes(boardId)]);
    return NextResponse.json({ boards, recipes });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load recipes' },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = RecipeSchema.parse(body);
    const saved = await upsertRecipe(parsed);
    return NextResponse.json({ recipe: saved }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Invalid recipe payload' },
      { status: 400 },
    );
  }
}

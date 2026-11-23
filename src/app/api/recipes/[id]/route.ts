import { NextRequest, NextResponse } from 'next/server';
import { deleteRecipe, getRecipeById, upsertRecipe } from '@/lib/storage';
import { RecipeSchema } from '@/lib/types';

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const existing = await getRecipeById(id);
    const body = await req.json();
    const merged = RecipeSchema.parse({
      ...(existing || {}),
      ...body,
      id,
    });
    const saved = await upsertRecipe(merged);
    return NextResponse.json({ recipe: saved });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update recipe' },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const deleted = await deleteRecipe(id);
    return NextResponse.json({ deleted });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete recipe' },
      { status: 500 },
    );
  }
}

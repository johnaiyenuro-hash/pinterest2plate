import { NextRequest, NextResponse } from 'next/server';
import { getStorageMode, getUserState, saveUserState, upsertBoard, upsertRecipe } from '@/lib/storage';
import { BoardSchema, RecipeSchema, type SupermarketKey } from '@/lib/types';

export async function GET() {
  try {
    const state = await getUserState();
    return NextResponse.json({ state, storageMode: getStorageMode() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load user state' },
      { status: 500 },
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      selectedIds?: string[];
      servingsOverride?: Record<string, number>;
      madeItIds?: string[];
      checkedKeys?: string[];
      currentStore?: SupermarketKey;
      hidePantry?: boolean;
      syncBoards?: unknown[];
      syncRecipes?: unknown[];
    };

    // Optional one-time cloud migration for recipes/boards previously stored only in localStorage
    if (Array.isArray(body.syncBoards)) {
      for (const rawBoard of body.syncBoards) {
        const parsed = BoardSchema.safeParse(rawBoard);
        if (parsed.success) await upsertBoard(parsed.data);
      }
    }
    if (Array.isArray(body.syncRecipes)) {
      for (const rawRecipe of body.syncRecipes) {
        const parsed = RecipeSchema.safeParse(rawRecipe);
        if (parsed.success) await upsertRecipe(parsed.data);
      }
    }

    const saved = await saveUserState({
      ...(Array.isArray(body.selectedIds) ? { selectedIds: body.selectedIds } : {}),
      ...(body.servingsOverride ? { servingsOverride: body.servingsOverride } : {}),
      ...(Array.isArray(body.madeItIds) ? { madeItIds: body.madeItIds } : {}),
      ...(Array.isArray(body.checkedKeys) ? { checkedKeys: body.checkedKeys } : {}),
      ...(body.currentStore ? { currentStore: body.currentStore } : {}),
      ...(typeof body.hidePantry === 'boolean' ? { hidePantry: body.hidePantry } : {}),
    });

    return NextResponse.json({ state: saved, storageMode: getStorageMode() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save user state' },
      { status: 400 },
    );
  }
}

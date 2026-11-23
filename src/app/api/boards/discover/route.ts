import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { decryptToken, fetchPinterestBoardPinsV5, PINTEREST_COOKIE_NAME } from '@/lib/pinterestOAuth';
import { discoverPublicBoardPins, parseImportTarget, resolveShortUrl } from '@/lib/pinterestResolver';
import { getAllRecipes, upsertBoard } from '@/lib/storage';
import type { Board, RawPin, Recipe } from '@/lib/types';

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      url?: string;
      oauthBoardId?: string;
      boardName?: string;
      maxPins?: number;
      forceRefresh?: boolean;
    };

    const maxPins = Math.min(Math.max(Number(body.maxPins || 18), 1), 50);
    let board: Board;
    let discoveredPins: RawPin[] = [];

    if (body.oauthBoardId) {
      const cookieStore = await cookies();
      const rawCookie = cookieStore.get(PINTEREST_COOKIE_NAME)?.value;
      const accessToken = rawCookie ? decryptToken(rawCookie) : null;
      if (!accessToken) {
        return NextResponse.json(
          { error: 'Pinterest session expired. Please reconnect your Pinterest account.' },
          { status: 401 },
        );
      }
      const pinterestBoardId = body.oauthBoardId.replace(/^v5_/, '');
      const internalBoardId = `v5_${pinterestBoardId}`;
      discoveredPins = await fetchPinterestBoardPinsV5(accessToken, pinterestBoardId, internalBoardId, maxPins);
      board = {
        id: internalBoardId,
        name: body.boardName || 'Pinterest Board',
        handle: body.boardName || 'Connected Pinterest',
        url: `https://www.pinterest.com/board/${pinterestBoardId}`,
        source: 'oauth',
        pinCount: discoveredPins.length,
        lastSyncedAt: new Date().toISOString(),
      };
    } else {
      const rawUrl = (body.url || '').trim();
      if (!rawUrl) {
        return NextResponse.json({ error: 'Please paste a Pinterest board URL, pin URL, or recipe link.' }, { status: 400 });
      }
      const expandedUrl = await resolveShortUrl(rawUrl);
      const target = parseImportTarget(expandedUrl);
      discoveredPins = await discoverPublicBoardPins(target, maxPins);
      board = {
        id: target.boardId,
        name: target.boardName,
        handle: target.boardHandle || target.boardName,
        url: target.normalizedUrl,
        source: 'public',
        pinCount: discoveredPins.length,
        lastSyncedAt: new Date().toISOString(),
      };
    }

    await upsertBoard(board);

    const existingRecipes = await getAllRecipes();
    const existingById = new Map<string, Recipe>(existingRecipes.map((r) => [r.id, r]));

    const cachedRecipes: Recipe[] = [];
    const pendingPins: RawPin[] = [];

    for (const pin of discoveredPins) {
      const canonicalId = pin.pinId.startsWith('pin_') || pin.pinId.startsWith('url_') ? pin.pinId : `pin_${pin.pinId}`;
      const existing = existingById.get(canonicalId);
      if (existing && !body.forceRefresh && (existing.status === 'ready' || existing.status === 'skipped_non_recipe')) {
        cachedRecipes.push(existing);
      } else {
        pendingPins.push(pin);
      }
    }

    return NextResponse.json({
      board,
      totalDiscovered: discoveredPins.length,
      cachedRecipes,
      pendingPins,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to discover pins from board' },
      { status: 400 },
    );
  }
}

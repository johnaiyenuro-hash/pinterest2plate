import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { decryptToken, fetchPinterestBoardPinsV5, PINTEREST_COOKIE_NAME } from '@/lib/pinterestOAuth';
import { discoverPublicBoardPins, parseImportTarget, resolveShortUrl } from '@/lib/pinterestResolver';
import { getAllRecipes, upsertBoard } from '@/lib/storage';
import type { Board, RawPin, Recipe } from '@/lib/types';

export const maxDuration = 30;

function shuffleArray<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      url?: string;
      urls?: string[];
      oauthBoardId?: string;
      boardName?: string;
      maxPins?: number;
      samplingMode?: 'latest' | 'diverse';
      forceRefresh?: boolean;
      excludeIds?: string[];
    };

    const maxPins = Math.min(Math.max(Number(body.maxPins || 12), 1), 50);
    const samplingMode = body.samplingMode === 'diverse' ? 'diverse' : 'latest';
    let board: Board;
    let discoveredPins: RawPin[] = [];
    let totalBoardPins: number | null = null;
    let cappedByPublicFeed = false;

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
      // Fetch full board index (up to 750 pins) so Diverse Shuffle samples across ALL pins!
      discoveredPins = await fetchPinterestBoardPinsV5(accessToken, pinterestBoardId, internalBoardId, 750);
      totalBoardPins = discoveredPins.length;
      board = {
        id: internalBoardId,
        name: body.boardName || 'Pinterest Board',
        handle: body.boardName || 'Connected Pinterest',
        url: `https://www.pinterest.com/board/${pinterestBoardId}`,
        source: 'oauth',
        pinCount: discoveredPins.length,
        lastSyncedAt: new Date().toISOString(),
      };
    } else if (Array.isArray(body.urls) && body.urls.length > 0) {
      // Multi-URL / Scrolled Board Clipper batch import
      const uniqueUrls = Array.from(
        new Set(body.urls.map((u) => u.trim()).filter((u) => /^https?:\/\//i.test(u))),
      ).slice(0, 120);

      if (uniqueUrls.length === 0) {
        return NextResponse.json({ error: 'No valid pin or recipe URLs were provided.' }, { status: 400 });
      }

      const boardName = body.boardName || 'Clipped Board Selection';
      const boardId = `clipped_${boardName.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 32)}`;

      board = {
        id: boardId,
        name: boardName,
        handle: `${uniqueUrls.length} clipped pins`,
        url: uniqueUrls[0],
        source: 'public',
        pinCount: uniqueUrls.length,
        lastSyncedAt: new Date().toISOString(),
      };

      for (const rawLink of uniqueUrls) {
        try {
          const target = parseImportTarget(rawLink);
          if (target.kind === 'pin' && target.pinId) {
            discoveredPins.push({
              pinId: target.pinId,
              boardId,
              title: 'Clipped Pinterest Pin',
              description: '',
              pinUrl: target.normalizedUrl,
              mediaType: 'image',
              imageUrl: '',
              creator: 'Pinterest Clip',
            });
          } else {
            const { pins } = await discoverPublicBoardPins(target, 1);
            for (const p of pins) discoveredPins.push({ ...p, boardId });
          }
        } catch {
          // Skip malformed lines
        }
      }
      totalBoardPins = discoveredPins.length;
    } else {
      const rawInput = (body.url || '').trim();
      if (!rawInput) {
        return NextResponse.json(
          { error: 'Please paste a Pinterest board URL, pin URL(s), or recipe link.' },
          { status: 400 },
        );
      }

      // Support pasting multiple pin URLs separated by newlines directly into the input!
      const multiLines = rawInput
        .split(/[\r\n]+/)
        .map((l) => l.trim())
        .filter((l) => /^https?:\/\//i.test(l));

      if (multiLines.length > 1) {
        const boardId = 'clipped_batch';
        board = {
          id: boardId,
          name: 'Pasted Pin Batch',
          handle: `${multiLines.length} links`,
          url: multiLines[0],
          source: 'public',
          pinCount: multiLines.length,
          lastSyncedAt: new Date().toISOString(),
        };
        for (const line of multiLines.slice(0, 80)) {
          try {
            const expanded = await resolveShortUrl(line);
            const target = parseImportTarget(expanded);
            if (target.kind === 'pin' && target.pinId) {
              discoveredPins.push({
                pinId: target.pinId,
                boardId,
                title: 'Pasted Pinterest Pin',
                description: '',
                pinUrl: target.normalizedUrl,
                mediaType: 'image',
                imageUrl: '',
                creator: 'Pinterest Saved',
              });
            } else {
              const { pins } = await discoverPublicBoardPins(target, 1);
              for (const p of pins) discoveredPins.push({ ...p, boardId });
            }
          } catch {
            // Skip invalid URL
          }
        }
        totalBoardPins = discoveredPins.length;
      } else {
        const expandedUrl = await resolveShortUrl(rawInput);
        const target = parseImportTarget(expandedUrl);
        // Fetch all available pins from public RSS (~25) so Diverse Shuffle & already-imported skipping work across the full public window
        const discovered = await discoverPublicBoardPins(target, 50);
        discoveredPins = discovered.pins;
        totalBoardPins = discovered.totalBoardPins ?? discoveredPins.length;
        cappedByPublicFeed =
          target.kind === 'board' && totalBoardPins !== null && totalBoardPins > discoveredPins.length;

        board = {
          id: target.boardId,
          name: target.boardName,
          handle: target.boardHandle || target.boardName,
          url: target.normalizedUrl,
          source: 'public',
          pinCount: totalBoardPins ?? discoveredPins.length,
          lastSyncedAt: new Date().toISOString(),
        };
      }
    }

    await upsertBoard(board);

    const existingRecipes = await getAllRecipes();
    const existingById = new Map<string, Recipe>(existingRecipes.map((r) => [r.id, r]));
    const clientExcluded = new Set(body.excludeIds || []);

    const cachedRecipes: Recipe[] = [];
    const unimportedPool: RawPin[] = [];

    for (const pin of discoveredPins) {
      const canonicalId =
        pin.pinId.startsWith('pin_') || pin.pinId.startsWith('url_') || pin.pinId.startsWith('vid_')
          ? pin.pinId
          : `pin_${pin.pinId}`;
      const existing = existingById.get(canonicalId);
      const alreadyKnown =
        clientExcluded.has(canonicalId) ||
        (existing && (existing.status === 'ready' || existing.status === 'skipped_non_recipe'));

      if (alreadyKnown && !body.forceRefresh) {
        if (existing) cachedRecipes.push(existing);
      } else {
        unimportedPool.push(pin);
      }
    }

    const orderedPool = samplingMode === 'diverse' ? shuffleArray(unimportedPool) : unimportedPool;
    const pendingPins = orderedPool.slice(0, maxPins);

    return NextResponse.json({
      board,
      totalDiscovered: discoveredPins.length,
      totalBoardPins: totalBoardPins ?? discoveredPins.length,
      cappedByPublicFeed,
      unimportedAvailable: unimportedPool.length,
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

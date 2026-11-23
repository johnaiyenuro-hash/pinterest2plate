import { NextRequest, NextResponse } from 'next/server';
import { extractRecipeFromPin, isGeminiConfigured } from '@/lib/recipeExtractor';
import { upsertRecipe } from '@/lib/storage';
import type { RawPin } from '@/lib/types';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    if (!isGeminiConfigured()) {
      return NextResponse.json(
        {
          error:
            'GEMINI_API_KEY is not set on the server. Add GEMINI_API_KEY to .env.local (or Vercel Environment Variables) to read video and image pins.',
          code: 'MISSING_GEMINI_KEY',
        },
        { status: 503 },
      );
    }

    const body = (await req.json()) as {
      pin?: RawPin;
      forceExtract?: boolean;
      skipEnrich?: boolean;
    };

    if (!body.pin || !body.pin.pinUrl) {
      return NextResponse.json({ error: 'A valid pin payload is required.' }, { status: 400 });
    }

    const recipe = await extractRecipeFromPin(body.pin, {
      forceExtract: Boolean(body.forceExtract),
      skipEnrich: Boolean(body.skipEnrich),
    });

    const saved = await upsertRecipe(recipe);
    return NextResponse.json({ recipe: saved });
  } catch (err) {
    console.error('[api/pins/extract] Extraction error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to extract recipe from pin' },
      { status: 500 },
    );
  }
}

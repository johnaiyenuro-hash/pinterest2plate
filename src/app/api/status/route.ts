import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { decryptToken, isPinterestOAuthConfigured, PINTEREST_COOKIE_NAME } from '@/lib/pinterestOAuth';
import { isGeminiConfigured } from '@/lib/recipeExtractor';
import { getStorageMode } from '@/lib/storage';

export async function GET() {
  const cookieStore = await cookies();
  const rawCookie = cookieStore.get(PINTEREST_COOKIE_NAME)?.value;
  const pinterestConnected = Boolean(rawCookie && decryptToken(rawCookie));

  return NextResponse.json({
    geminiConfigured: isGeminiConfigured(),
    pinterestOAuthConfigured: isPinterestOAuthConfigured(),
    pinterestConnected,
    storageMode: getStorageMode(),
  });
}

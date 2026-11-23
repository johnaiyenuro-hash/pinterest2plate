import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { decryptToken, fetchPinterestBoardsV5, PINTEREST_COOKIE_NAME } from '@/lib/pinterestOAuth';

export async function GET() {
  const cookieStore = await cookies();
  const rawCookie = cookieStore.get(PINTEREST_COOKIE_NAME)?.value;
  const accessToken = rawCookie ? decryptToken(rawCookie) : null;

  if (!accessToken) {
    return NextResponse.json({ connected: false, boards: [] }, { status: 401 });
  }

  try {
    const boards = await fetchPinterestBoardsV5(accessToken);
    return NextResponse.json({ connected: true, boards });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to list Pinterest boards' },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  const res = NextResponse.json({ disconnected: true });
  res.cookies.delete(PINTEREST_COOKIE_NAME);
  return res;
}

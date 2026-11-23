import { NextRequest, NextResponse } from 'next/server';
import { encryptToken, exchangePinterestCode, PINTEREST_COOKIE_NAME } from '@/lib/pinterestOAuth';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const error = req.nextUrl.searchParams.get('error');
  const expectedState = req.cookies.get('p2p_oauth_state')?.value;

  if (error || !code) {
    return NextResponse.redirect(
      new URL(`/?pinterest=error&reason=${encodeURIComponent(error || 'missing_code')}`, req.nextUrl.origin),
    );
  }

  if (expectedState && state !== expectedState) {
    return NextResponse.redirect(new URL('/?pinterest=error&reason=invalid_state', req.nextUrl.origin));
  }

  try {
    const accessToken = await exchangePinterestCode(code, req.nextUrl.origin);
    const res = NextResponse.redirect(new URL('/?pinterest=connected', req.nextUrl.origin));
    res.cookies.set(PINTEREST_COOKIE_NAME, encryptToken(accessToken), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
    });
    res.cookies.delete('p2p_oauth_state');
    return res;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'token_exchange_failed';
    return NextResponse.redirect(
      new URL(`/?pinterest=error&reason=${encodeURIComponent(msg)}`, req.nextUrl.origin),
    );
  }
}

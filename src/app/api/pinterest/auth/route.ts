import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { buildPinterestAuthorizeUrl, isPinterestOAuthConfigured } from '@/lib/pinterestOAuth';

export async function GET(req: NextRequest) {
  if (!isPinterestOAuthConfigured()) {
    return NextResponse.redirect(new URL('/?pinterest=unconfigured', req.nextUrl.origin));
  }

  const state = crypto.randomBytes(16).toString('hex');
  const authUrl = buildPinterestAuthorizeUrl(req.nextUrl.origin, state);
  const res = NextResponse.redirect(authUrl);
  res.cookies.set('p2p_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 600,
    path: '/',
  });
  return res;
}

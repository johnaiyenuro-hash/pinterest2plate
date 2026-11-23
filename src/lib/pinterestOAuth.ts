import crypto from 'node:crypto';
import { mapPinterestV5Pin } from './pinterestResolver';
import type { Board, RawPin } from './types';

export const PINTEREST_COOKIE_NAME = 'p2p_pinterest_session';

export function isPinterestOAuthConfigured(): boolean {
  return Boolean(process.env.PINTEREST_APP_ID && process.env.PINTEREST_APP_SECRET);
}

function getSessionSecret(): string {
  return process.env.SESSION_SECRET || process.env.PINTEREST_APP_SECRET || 'p2p-local-dev-secret-change-me';
}

export function encryptToken(accessToken: string): string {
  const key = crypto.createHash('sha256').update(getSessionSecret()).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(accessToken, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64url');
}

export function decryptToken(payload: string): string | null {
  try {
    const buf = Buffer.from(payload, 'base64url');
    if (buf.length < 28) return null;
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const encrypted = buf.subarray(28);
    const key = crypto.createHash('sha256').update(getSessionSecret()).digest();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

export function buildPinterestAuthorizeUrl(origin: string, state: string): string {
  const appId = process.env.PINTEREST_APP_ID;
  if (!appId) throw new Error('PINTEREST_APP_ID is not configured.');
  const redirectUri = process.env.PINTEREST_REDIRECT_URI || `${origin}/api/pinterest/callback`;
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'boards:read,pins:read,user_accounts:read',
    state,
  });
  return `https://www.pinterest.com/oauth/?${params.toString()}`;
}

export async function exchangePinterestCode(code: string, origin: string): Promise<string> {
  const appId = process.env.PINTEREST_APP_ID;
  const appSecret = process.env.PINTEREST_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error('Pinterest OAuth credentials are not configured.');
  }

  const redirectUri = process.env.PINTEREST_REDIRECT_URI || `${origin}/api/pinterest/callback`;
  const basicAuth = Buffer.from(`${appId}:${appSecret}`).toString('base64');

  const res = await fetch('https://api.pinterest.com/v5/oauth/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  });

  const data = (await res.json()) as { access_token?: string; message?: string };
  if (!res.ok || !data.access_token) {
    throw new Error(data.message || `Pinterest token exchange failed (HTTP ${res.status})`);
  }
  return data.access_token;
}

export async function fetchPinterestBoardsV5(accessToken: string): Promise<Board[]> {
  const res = await fetch('https://api.pinterest.com/v5/boards?page_size=50', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });
  const data = (await res.json()) as {
    items?: Array<{ id: string; name: string; pin_count?: number; owner?: { username?: string } }>;
    message?: string;
  };
  if (!res.ok) {
    throw new Error(data.message || `Pinterest boards fetch failed (HTTP ${res.status})`);
  }
  return (data.items || []).map((b) => ({
    id: `v5_${b.id}`,
    name: b.name,
    handle: b.owner?.username ? `@${b.owner.username} / ${b.name}` : b.name,
    url: `https://www.pinterest.com/board/${b.id}`,
    source: 'oauth' as const,
    pinCount: b.pin_count ?? 0,
    lastSyncedAt: new Date().toISOString(),
  }));
}

export async function fetchPinterestBoardPinsV5(
  accessToken: string,
  pinterestBoardId: string,
  internalBoardId: string,
  maxPins = 50,
): Promise<RawPin[]> {
  const allPins: RawPin[] = [];
  let bookmark: string | undefined;
  let pages = 0;

  while (allPins.length < maxPins && pages < 4) {
    pages++;
    const pageSize = Math.min(100, maxPins - allPins.length);
    const url = new URL(`https://api.pinterest.com/v5/boards/${pinterestBoardId}/pins`);
    url.searchParams.set('page_size', String(pageSize));
    if (bookmark) url.searchParams.set('bookmark', bookmark);

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    const data = (await res.json()) as {
      items?: Array<Record<string, unknown>>;
      bookmark?: string;
      message?: string;
    };
    if (!res.ok) {
      throw new Error(data.message || `Pinterest pins fetch failed (HTTP ${res.status})`);
    }
    for (const pin of data.items || []) {
      allPins.push(mapPinterestV5Pin(pin, internalBoardId));
    }
    bookmark = data.bookmark;
    if (!bookmark) break;
  }

  return allPins.slice(0, maxPins);
}

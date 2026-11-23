import crypto from 'node:crypto';
import type { RawPin } from './types';

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-GB,en;q=0.9',
};

export interface ParsedImportTarget {
  kind: 'board' | 'pin' | 'blog' | 'video';
  normalizedUrl: string;
  boardHandle?: string;
  boardSlug?: string;
  boardId: string;
  boardName: string;
  pinId?: string;
}

export interface JsonLdRecipeData {
  name: string;
  description: string;
  imageUrl?: string;
  author?: string;
  prepTimeIso?: string;
  cookTimeIso?: string;
  servings?: string;
  ingredients: string[];
  instructions: string[];
  sourceUrl: string;
}

function hashId(str: string): string {
  return crypto.createHash('sha256').update(str).digest('hex').slice(0, 12);
}

export function decodeHtmlEntities(str = ''): string {
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

export function upgradePinImageUrl(url = ''): string {
  if (!url) return '';
  if (url.includes('/236x/')) return url.replace('/236x/', '/736x/');
  if (url.includes('/474x/')) return url.replace('/474x/', '/736x/');
  return url;
}

export async function resolveShortUrl(inputUrl: string): Promise<string> {
  try {
    const u = new URL(inputUrl);
    if (!u.hostname.endsWith('pin.it')) return inputUrl;
    const res = await fetch(inputUrl, {
      method: 'GET',
      redirect: 'follow',
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(10000),
    });
    return res.url || inputUrl;
  } catch {
    return inputUrl;
  }
}

export function parseImportTarget(rawInput: string): ParsedImportTarget {
  let cleaned = rawInput.trim();
  if (!cleaned) {
    throw new Error('Please provide a Pinterest board URL, pin URL, or recipe link.');
  }

  // Allow shorthand like "shalom_x/food" or "@shalom_x/food"
  if (!/^https?:\/\//i.test(cleaned)) {
    const bare = cleaned.replace(/^@/, '').replace(/^\/+|\/+$/g, '');
    if (/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(bare)) {
      cleaned = `https://uk.pinterest.com/${bare}/`;
    } else {
      cleaned = `https://${cleaned}`;
    }
  }

  const parsed = new URL(cleaned);
  const host = parsed.hostname.toLowerCase();
  const segments = parsed.pathname
    .replace(/\.rss$/i, '')
    .split('/')
    .filter(Boolean);

  if (host.includes('pinterest.')) {
    if (segments[0] === 'pin' && segments[1]) {
      const pinId = segments[1].replace(/[^0-9a-zA-Z_-]/g, '');
      return {
        kind: 'pin',
        normalizedUrl: `https://www.pinterest.com/pin/${pinId}/`,
        boardId: 'single_pins',
        boardName: 'Imported Single Pins',
        pinId,
      };
    }

    if (segments.length >= 2) {
      const user = segments[0];
      const board = segments[1];
      const prettyBoard = board
        .replace(/[-_]+/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
      return {
        kind: 'board',
        normalizedUrl: `https://${host}/${user}/${board}/`,
        boardHandle: `@${user} / ${prettyBoard}`,
        boardSlug: `${user}/${board}`,
        boardId: `board_${user}_${board}`.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
        boardName: `${prettyBoard} (@${user})`,
      };
    }
  }

  const hostnameLabel = host.replace(/^www\./, '');
  if (/\.(m3u8|mp4|mov|webm)(\?|$)/i.test(parsed.pathname) || parsed.pathname.includes('/videos/')) {
    return {
      kind: 'video',
      normalizedUrl: parsed.href,
      boardId: 'video_imports',
      boardName: 'Imported Cooking Videos',
      boardHandle: hostnameLabel,
    };
  }

  return {
    kind: 'blog',
    normalizedUrl: parsed.href,
    boardId: 'web_recipes',
    boardName: 'Imported Web Recipes',
    boardHandle: hostnameLabel,
  };
}

async function fetchTextWithTimeout(targetUrl: string, timeoutMs = 12000): Promise<{ status: number; body: string; finalUrl: string }> {
  const res = await fetch(targetUrl, {
    method: 'GET',
    redirect: 'follow',
    headers: BROWSER_HEADERS,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await res.text();
  return { status: res.status, body, finalUrl: res.url || targetUrl };
}

function parseRssItems(xml: string, boardId: string, defaultCreator: string): RawPin[] {
  const items: RawPin[] = [];
  const matches = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];

  for (const itemXml of matches) {
    const rawTitle = decodeHtmlEntities((itemXml.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '');
    const link = decodeHtmlEntities((itemXml.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '').trim();
    const rawDesc = decodeHtmlEntities((itemXml.match(/<description>([\s\S]*?)<\/description>/) || [])[1] || '');

    const imgMatch = rawDesc.match(/<img[^>]+src=["']([^"']+)["']/i);
    const imageUrl = upgradePinImageUrl(imgMatch ? imgMatch[1] : '');
    const textDesc = rawDesc.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    const pinIdMatch = link.match(/\/pin\/(\d+)/);
    const pinId = pinIdMatch ? pinIdMatch[1] : hashId(link || rawTitle || imageUrl);

    items.push({
      pinId,
      boardId,
      title: rawTitle.trim() || textDesc.slice(0, 80) || 'Pinterest Pin',
      description: textDesc,
      pinUrl: link || `https://www.pinterest.com/pin/${pinId}/`,
      mediaType: 'image',
      imageUrl,
      creator: defaultCreator,
    });
  }

  return items;
}

function extractVideoUrlFromObject(obj: unknown): { videoUrl?: string; durationSec?: number } {
  const candidates: Array<{ url: string; priority: number; duration?: number }> = [];
  const seen = new Set<unknown>();

  function walk(node: unknown, depth: number): void {
    if (!node || typeof node !== 'object' || depth > 14 || seen.has(node)) return;
    seen.add(node);

    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }

    const record = node as Record<string, unknown>;
    const videoListObj =
      (record.video_list && typeof record.video_list === 'object' ? record.video_list : null) ||
      (record.videoList && typeof record.videoList === 'object' ? record.videoList : null);

    if (videoListObj) {
      const vl = videoListObj as Record<string, Record<string, unknown>>;
      for (const [variant, meta] of Object.entries(vl)) {
        const url = typeof meta?.url === 'string' ? meta.url : '';
        if (!url) continue;
        const durationMs = typeof meta?.duration === 'number' ? meta.duration : undefined;
        const durationSec = durationMs ? Math.round(durationMs / 1000) : undefined;
        const upperVar = variant.toUpperCase();
        let priority = 1;
        if (/\.mp4(\?|$)/i.test(url)) {
          if (upperVar.includes('720')) priority = 100;
          else if (upperVar.includes('480') || upperVar.includes('EXP7')) priority = 90;
          else priority = 80;
        } else if (/\.m3u8(\?|$)/i.test(url)) {
          if (upperVar.includes('HLSV4') || upperVar.includes('WEB')) priority = 60;
          else priority = 40;
        }
        candidates.push({ url, priority, duration: durationSec });
      }
    }

    if (typeof record.contentUrl === 'string' && /\.(mp4|m3u8|mov|webm)(\?|$)/i.test(record.contentUrl)) {
      candidates.push({ url: record.contentUrl, priority: /\.m3u8/i.test(record.contentUrl) ? 55 : 85 });
    }

    for (const val of Object.values(record)) {
      if (val && typeof val === 'object') walk(val, depth + 1);
    }
  }

  walk(obj, 0);
  candidates.sort((a, b) => b.priority - a.priority);
  const best = candidates[0];
  return best ? { videoUrl: best.url, durationSec: best.duration } : {};
}

function extractCarouselImagesFromObject(obj: unknown): string[] {
  const urls = new Set<string>();
  const seen = new Set<unknown>();

  function walk(node: unknown, depth: number): void {
    if (!node || typeof node !== 'object' || depth > 14 || seen.has(node)) return;
    seen.add(node);

    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }

    const record = node as Record<string, unknown>;
    // Story Pin / Idea Pin pages or carousel_slots
    if (Array.isArray(record.pages) || Array.isArray(record.carousel_slots)) {
      const list = (record.pages || record.carousel_slots) as unknown[];
      for (const slide of list) {
        if (slide && typeof slide === 'object') {
          const s = slide as Record<string, unknown>;
          const imgs = s.images as Record<string, { url?: string }> | undefined;
          const img = imgs?.orig?.url || imgs?.['736x']?.url || imgs?.['1200x']?.url;
          if (img && img.includes('pinimg.com')) urls.add(upgradePinImageUrl(img));
          const imageObj = s.image as Record<string, Record<string, { url?: string }>> | undefined;
          const nested = imageObj?.images?.orig?.url || imageObj?.images?.['736x']?.url;
          if (nested && nested.includes('pinimg.com')) urls.add(upgradePinImageUrl(nested));
        }
      }
    }

    for (const val of Object.values(record)) {
      if (val && typeof val === 'object') walk(val, depth + 1);
    }
  }

  walk(obj, 0);
  return Array.from(urls).slice(0, 8);
}

function extractPinMetadataFromObject(obj: unknown): {
  title?: string;
  description?: string;
  outboundUrl?: string;
  imageUrl?: string;
  creator?: string;
} {
  const result: {
    title?: string;
    description?: string;
    outboundUrl?: string;
    imageUrl?: string;
    creator?: string;
  } = {};
  const seen = new Set<unknown>();

  function walk(node: unknown, depth: number): void {
    if (!node || typeof node !== 'object' || depth > 12 || seen.has(node)) return;
    seen.add(node);

    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }

    const r = node as Record<string, unknown>;

    if (!result.title && typeof r.grid_title === 'string' && r.grid_title.trim()) {
      result.title = r.grid_title.trim();
    }
    if (!result.title && typeof r.title === 'string' && r.title.trim().length > 2) {
      result.title = r.title.trim();
    }
    if (!result.description && typeof r.closeup_unified_description === 'string' && r.closeup_unified_description.trim()) {
      result.description = r.closeup_unified_description.trim();
    }
    if (!result.description && typeof r.description === 'string' && r.description.trim().length > 5) {
      result.description = r.description.trim();
    }
    if (!result.outboundUrl && typeof r.link === 'string' && /^https?:\/\//i.test(r.link) && !r.link.includes('pinterest.')) {
      result.outboundUrl = r.link;
    }
    if (!result.creator && r.native_creator && typeof r.native_creator === 'object') {
      const nc = r.native_creator as Record<string, unknown>;
      if (typeof nc.username === 'string' && nc.username) result.creator = `@${nc.username}`;
    }
    if (!result.creator && r.pinner && typeof r.pinner === 'object') {
      const p = r.pinner as Record<string, unknown>;
      if (typeof p.username === 'string' && p.username) result.creator = `@${p.username}`;
    }
    if (!result.imageUrl && r.images && typeof r.images === 'object') {
      const imgs = r.images as Record<string, { url?: string }>;
      const bestImg = imgs.orig?.url || imgs['1200x']?.url || imgs['736x']?.url;
      if (bestImg && bestImg.includes('pinimg.com')) {
        result.imageUrl = bestImg;
      }
    }

    for (const val of Object.values(r)) {
      if (val && typeof val === 'object') walk(val, depth + 1);
    }
  }

  walk(obj, 0);
  return result;
}

function extractMetaTag(html: string, attrName: string): string | undefined {
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${attrName}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${attrName}["']`, 'i'),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return decodeHtmlEntities(m[1]).trim();
  }
  return undefined;
}

function parseAllJsonScripts(html: string): unknown[] {
  const results: unknown[] = [];
  const scriptRegex = /<script[^>]*type=["']application\/(?:ld\+)?json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = scriptRegex.exec(html)) !== null) {
    const raw = match[1].trim();
    if (!raw) continue;
    try {
      results.push(JSON.parse(raw));
    } catch {
      // Ignore malformed JSON script tags
    }
  }
  return results;
}

export async function enrichSinglePin(
  pinUrl: string,
  boardId: string,
  seed?: Partial<RawPin>,
): Promise<RawPin> {
  const resolvedUrl = await resolveShortUrl(pinUrl);
  const pinIdMatch = resolvedUrl.match(/\/pin\/(\d+)/);
  const pinId = seed?.pinId || (pinIdMatch ? pinIdMatch[1] : hashId(resolvedUrl));

  let title = seed?.title || '';
  let description = seed?.description || '';
  let imageUrl = upgradePinImageUrl(seed?.imageUrl || '');
  let outboundUrl = seed?.outboundUrl;
  let videoUrl = seed?.videoUrl;
  let durationSec = seed?.durationSec;
  let carouselImageUrls = seed?.carouselImageUrls || [];
  let creator = seed?.creator || 'Pinterest Creator';

  try {
    const { status, body } = await fetchTextWithTimeout(resolvedUrl, 12000);
    if (status === 200 && body) {
      const jsonBlocks = parseAllJsonScripts(body);
      for (const block of jsonBlocks) {
        const vid = extractVideoUrlFromObject(block);
        if (vid.videoUrl && (!videoUrl || /\.mp4/i.test(vid.videoUrl))) {
          videoUrl = vid.videoUrl;
          durationSec = vid.durationSec ?? durationSec;
        }
        const slides = extractCarouselImagesFromObject(block);
        if (slides.length > carouselImageUrls.length) {
          carouselImageUrls = slides;
        }
        const meta = extractPinMetadataFromObject(block);
        if (meta.title && (!title || title === 'Saved Recipe Pin' || title === 'Pinterest Pin')) {
          title = meta.title;
        }
        if (meta.description && meta.description.length > description.length) {
          description = meta.description;
        }
        if (meta.outboundUrl && !outboundUrl) outboundUrl = meta.outboundUrl;
        if (meta.imageUrl && (!imageUrl || meta.imageUrl.includes('/originals/'))) {
          imageUrl = meta.imageUrl;
        }
        if (meta.creator && creator === 'Pinterest Creator') creator = meta.creator;
      }

      // Direct regex fallback for Pinterest MP4 or HLS (.m3u8) video URLs embedded in hydrated HTML/JS
      if (!videoUrl) {
        const unescapedBody = body.replace(/\\u002F/gi, '/').replace(/\\\//g, '/');
        const mp4Match =
          unescapedBody.match(/https:\/\/v\d*\.pinimg\.com\/videos\/mc\/(?:720p|480p|expMp4)\/[^"'\s\\<>]+\.mp4/i) ||
          unescapedBody.match(/https:\/\/v\d*\.pinimg\.com\/videos\/[^"'\s\\<>]+\.mp4/i);
        const hlsMatch =
          unescapedBody.match(/https:\/\/v\d*\.pinimg\.com\/videos\/[^"'\s\\<>]+\.m3u8/i);
        if (mp4Match?.[0]) {
          videoUrl = mp4Match[0];
        } else if (hlsMatch?.[0]) {
          videoUrl = hlsMatch[0];
        }
      }

      // OpenGraph fallbacks
      const ogVideo = extractMetaTag(body, 'og:video:secure_url') || extractMetaTag(body, 'og:video');
      if (!videoUrl && ogVideo && /\.(mp4|m3u8)/i.test(ogVideo)) {
        videoUrl = ogVideo;
      }
      const ogImage = extractMetaTag(body, 'og:image');
      if (!imageUrl && ogImage) imageUrl = upgradePinImageUrl(ogImage);
      const ogTitle = extractMetaTag(body, 'og:title');
      if ((!title || title === 'Saved Recipe Pin' || title === 'Pinterest Pin') && ogTitle) {
        title = ogTitle.replace(/\s*\|\s*Pinterest.*$/i, '').trim();
      }
      const ogDesc = extractMetaTag(body, 'og:description');
      if (ogDesc && ogDesc.length > description.length) {
        description = ogDesc;
      }
    }
  } catch (err) {
    console.warn(`[pinterestResolver] Enrich pin ${pinId} partial fallback:`, err instanceof Error ? err.message : err);
  }

  const mediaType: RawPin['mediaType'] = videoUrl
    ? 'video'
    : carouselImageUrls.length > 1
      ? 'carousel'
      : 'image';

  return {
    pinId,
    boardId,
    title: title || 'Pinterest Recipe Pin',
    description,
    pinUrl: resolvedUrl,
    outboundUrl,
    mediaType,
    imageUrl,
    carouselImageUrls: carouselImageUrls.length > 1 ? carouselImageUrls : undefined,
    videoUrl,
    durationSec,
    creator,
  };
}

export async function fetchPublicBoardPinCount(boardUrl: string): Promise<number | null> {
  try {
    const { status, body } = await fetchTextWithTimeout(boardUrl, 8000);
    if (status !== 200 || !body) return null;
    const match = body.match(/"pin_count"\s*:\s*(\d+)/);
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

export async function discoverPublicBoardPins(
  target: ParsedImportTarget,
  maxPins = 25,
): Promise<{ pins: RawPin[]; totalBoardPins: number | null }> {
  if (target.kind === 'pin') {
    const single = await enrichSinglePin(target.normalizedUrl, target.boardId);
    return { pins: [single], totalBoardPins: 1 };
  }

  if (target.kind === 'video') {
    return {
      pins: [
        {
          pinId: `vid_${hashId(target.normalizedUrl)}`,
          boardId: target.boardId,
          title: 'Imported Cooking Video',
          description: '',
          pinUrl: target.normalizedUrl,
          mediaType: 'video',
          imageUrl: '',
          videoUrl: target.normalizedUrl,
          creator: target.boardHandle || 'Video Recipe',
        },
      ],
      totalBoardPins: 1,
    };
  }

  if (target.kind === 'blog') {
    return {
      pins: [
        {
          pinId: `url_${hashId(target.normalizedUrl)}`,
          boardId: target.boardId,
          title: target.boardHandle || 'Web Recipe',
          description: '',
          pinUrl: target.normalizedUrl,
          outboundUrl: target.normalizedUrl,
          mediaType: 'blog',
          imageUrl: '',
          creator: target.boardHandle || 'Web Recipe',
        },
      ],
      totalBoardPins: 1,
    };
  }

  const rssUrl = target.normalizedUrl.replace(/\/+$/, '') + '.rss';
  const [rssRes, totalBoardPins] = await Promise.all([
    fetchTextWithTimeout(rssUrl, 15000),
    fetchPublicBoardPinCount(target.normalizedUrl),
  ]);
  if (rssRes.status !== 200) {
    throw new Error(
      `Could not load Pinterest board feed (HTTP ${rssRes.status}). Check that the board is public or connect your Pinterest account.`,
    );
  }

  const creatorFallback = target.boardHandle?.split('/')[0]?.trim() || 'Pinterest Board';
  const pins = parseRssItems(rssRes.body, target.boardId, creatorFallback);
  return { pins: pins.slice(0, maxPins), totalBoardPins };
}

export async function extractJsonLdRecipe(blogUrl: string): Promise<JsonLdRecipeData | null> {
  try {
    const { status, body, finalUrl } = await fetchTextWithTimeout(blogUrl, 10000);
    if (status !== 200 || !body) return null;

    const blocks = parseAllJsonScripts(body);
    const findRecipeNode = (node: unknown): Record<string, unknown> | null => {
      if (!node || typeof node !== 'object') return null;
      if (Array.isArray(node)) {
        for (const item of node) {
          const found = findRecipeNode(item);
          if (found) return found;
        }
        return null;
      }
      const r = node as Record<string, unknown>;
      const t = r['@type'];
      const isRecipe =
        t === 'Recipe' ||
        (Array.isArray(t) && t.some((x) => typeof x === 'string' && x.toLowerCase() === 'recipe'));
      if (isRecipe) return r;
      if (Array.isArray(r['@graph'])) return findRecipeNode(r['@graph']);
      return null;
    };

    let recipeNode: Record<string, unknown> | null = null;
    for (const block of blocks) {
      recipeNode = findRecipeNode(block);
      if (recipeNode) break;
    }
    if (!recipeNode) return null;

    const ingredients = Array.isArray(recipeNode.recipeIngredient)
      ? recipeNode.recipeIngredient.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      : [];

    const instructions: string[] = [];
    const rawInst = recipeNode.recipeInstructions;
    const collectInstructions = (node: unknown): void => {
      if (typeof node === 'string' && node.trim()) {
        instructions.push(node.trim());
      } else if (Array.isArray(node)) {
        for (const item of node) collectInstructions(item);
      } else if (node && typeof node === 'object') {
        const obj = node as Record<string, unknown>;
        if (typeof obj.text === 'string' && obj.text.trim()) {
          instructions.push(obj.text.trim());
        } else if (Array.isArray(obj.itemListElement)) {
          collectInstructions(obj.itemListElement);
        }
      }
    };
    collectInstructions(rawInst);

    if (ingredients.length < 2 && instructions.length === 0) return null;

    let imageUrl: string | undefined;
    const rawImage = recipeNode.image;
    if (typeof rawImage === 'string') imageUrl = rawImage;
    else if (Array.isArray(rawImage) && typeof rawImage[0] === 'string') imageUrl = rawImage[0];
    else if (rawImage && typeof rawImage === 'object' && typeof (rawImage as Record<string, unknown>).url === 'string') {
      imageUrl = (rawImage as Record<string, unknown>).url as string;
    }

    let author: string | undefined;
    const rawAuthor = recipeNode.author;
    if (typeof rawAuthor === 'string') author = rawAuthor;
    else if (Array.isArray(rawAuthor) && rawAuthor[0] && typeof (rawAuthor[0] as Record<string, unknown>).name === 'string') {
      author = (rawAuthor[0] as Record<string, unknown>).name as string;
    } else if (rawAuthor && typeof rawAuthor === 'object' && typeof (rawAuthor as Record<string, unknown>).name === 'string') {
      author = (rawAuthor as Record<string, unknown>).name as string;
    }

    return {
      name: typeof recipeNode.name === 'string' ? decodeHtmlEntities(recipeNode.name).trim() : 'Web Recipe',
      description: typeof recipeNode.description === 'string' ? decodeHtmlEntities(recipeNode.description).trim() : '',
      imageUrl,
      author,
      prepTimeIso: typeof recipeNode.prepTime === 'string' ? recipeNode.prepTime : undefined,
      cookTimeIso: typeof recipeNode.cookTime === 'string' ? recipeNode.cookTime : undefined,
      servings:
        typeof recipeNode.recipeYield === 'string'
          ? recipeNode.recipeYield
          : Array.isArray(recipeNode.recipeYield)
            ? String(recipeNode.recipeYield[0] ?? '')
            : undefined,
      ingredients,
      instructions,
      sourceUrl: finalUrl,
    };
  } catch {
    return null;
  }
}

export function mapPinterestV5Pin(pin: Record<string, unknown>, boardId: string): RawPin {
  const id = String(pin.id || hashId(JSON.stringify(pin)));
  const title = typeof pin.title === 'string' && pin.title.trim() ? pin.title.trim() : 'Pinterest Recipe Pin';
  const description = typeof pin.description === 'string' ? pin.description.trim() : '';
  const link = typeof pin.link === 'string' && !pin.link.includes('pinterest.') ? pin.link : undefined;

  const media = (pin.media && typeof pin.media === 'object' ? pin.media : {}) as Record<string, unknown>;
  const v5MediaType = String(media.media_type || '');
  const images = (media.images && typeof media.images === 'object' ? media.images : {}) as Record<string, { url?: string }>;
  const imageUrl =
    images.originals?.url ||
    images['1200x']?.url ||
    images['600x']?.url ||
    images['400x300']?.url ||
    (typeof media.cover_image_url === 'string' ? media.cover_image_url : '') ||
    '';

  let videoUrl: string | undefined;
  let durationSec: number | undefined;
  if (v5MediaType === 'video' || media.video_list || media.video) {
    const vid = extractVideoUrlFromObject(media);
    videoUrl = vid.videoUrl;
    durationSec = vid.durationSec;
  }

  const carouselImageUrls: string[] = [];
  if (Array.isArray(media.items)) {
    for (const item of media.items as Array<Record<string, unknown>>) {
      const itemImgs = item.images as Record<string, { url?: string }> | undefined;
      const u = itemImgs?.originals?.url || itemImgs?.['600x']?.url;
      if (u) carouselImageUrls.push(u);
    }
  }

  const mediaType: RawPin['mediaType'] = videoUrl
    ? 'video'
    : carouselImageUrls.length > 1
      ? 'carousel'
      : 'image';

  let creator = 'Pinterest Saved';
  if (link) {
    try {
      creator = new URL(link).hostname.replace(/^www\./, '');
    } catch {
      // keep default
    }
  }

  return {
    pinId: id,
    boardId,
    title,
    description,
    pinUrl: `https://www.pinterest.com/pin/${id}/`,
    outboundUrl: link,
    mediaType,
    imageUrl: upgradePinImageUrl(imageUrl),
    carouselImageUrls: carouselImageUrls.length > 1 ? carouselImageUrls : undefined,
    videoUrl,
    durationSec,
    creator,
  };
}

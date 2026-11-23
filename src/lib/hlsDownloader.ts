import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const MEDIA_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: '*/*',
  Referer: 'https://www.pinterest.com/',
};

export interface HlsVariant {
  url: string;
  bandwidth: number;
  width?: number;
  height?: number;
  audioGroupId?: string;
}

export interface HlsAudioRendition {
  groupId: string;
  url: string;
  isDefault: boolean;
  name?: string;
}

export interface ParsedMasterPlaylist {
  isMaster: boolean;
  variants: HlsVariant[];
  audioRenditions: HlsAudioRendition[];
}

export interface ParsedMediaPlaylist {
  initSegmentUrl?: string;
  segments: Array<{ url: string; durationSec: number }>;
  totalDurationSec: number;
  format: 'fmp4' | 'mpegts' | 'aac';
}

export interface DownloadedVideoMedia {
  video: { buffer: Buffer; mimeType: string };
  audio?: { buffer: Buffer; mimeType: string };
  method: 'direct-mp4' | 'derived-mp4' | 'hls-ffmpeg' | 'hls-fmp4' | 'hls-ts';
}

let ffmpegAvailableCache: boolean | null = null;

export async function isFfmpegAvailable(): Promise<boolean> {
  if (ffmpegAvailableCache !== null) return ffmpegAvailableCache;
  try {
    await execFileAsync('ffmpeg', ['-version'], { timeout: 4000 });
    ffmpegAvailableCache = true;
  } catch {
    ffmpegAvailableCache = false;
  }
  return ffmpegAvailableCache;
}

function parseAttributes(attrLine: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([A-Z0-9-]+)=("([^"]*)"|([^,]*))/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(attrLine)) !== null) {
    const key = match[1].toUpperCase();
    const val = match[3] !== undefined ? match[3] : match[4];
    attrs[key] = val.trim();
  }
  return attrs;
}

export function parseHlsMasterPlaylist(text: string, baseUrl: string): ParsedMasterPlaylist {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const variants: HlsVariant[] = [];
  const audioRenditions: HlsAudioRendition[] = [];
  let isMaster = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('#EXT-X-MEDIA:')) {
      const attrs = parseAttributes(line.slice('#EXT-X-MEDIA:'.length));
      if (attrs.TYPE === 'AUDIO' && attrs.URI && attrs['GROUP-ID']) {
        audioRenditions.push({
          groupId: attrs['GROUP-ID'],
          url: new URL(attrs.URI, baseUrl).href,
          isDefault: attrs.DEFAULT === 'YES',
          name: attrs.NAME,
        });
      }
    } else if (line.startsWith('#EXT-X-STREAM-INF:')) {
      isMaster = true;
      const attrs = parseAttributes(line.slice('#EXT-X-STREAM-INF:'.length));
      const nextUrl = lines[i + 1];
      if (nextUrl && !nextUrl.startsWith('#')) {
        let width: number | undefined;
        let height: number | undefined;
        if (attrs.RESOLUTION && /^\d+x\d+$/i.test(attrs.RESOLUTION)) {
          const [w, h] = attrs.RESOLUTION.toLowerCase().split('x').map(Number);
          width = w;
          height = h;
        }
        variants.push({
          url: new URL(nextUrl, baseUrl).href,
          bandwidth: Number(attrs.BANDWIDTH || attrs['AVERAGE-BANDWIDTH'] || 0),
          width,
          height,
          audioGroupId: attrs.AUDIO,
        });
        i++;
      }
    }
  }

  return { isMaster, variants, audioRenditions };
}

/**
 * Selects the optimal HLS video variant for multimodal recipe understanding:
 * targets 480p-720p so on-screen ingredient overlays stay crisp while keeping download size compact.
 */
export function selectOptimalHlsVariant(master: ParsedMasterPlaylist): {
  variant?: HlsVariant;
  audioUrl?: string;
} {
  if (master.variants.length === 0) return {};

  const scored = [...master.variants].sort((a, b) => {
    const score = (v: HlsVariant): number => {
      const dim = Math.min(v.width ?? 0, v.height ?? 0) || v.height || 0;
      if (dim >= 480 && dim <= 720) return 1000 - Math.abs(dim - 720);
      if (dim > 720 && dim <= 1080) return 800 - (dim - 720);
      if (dim > 0 && dim < 480) return 500 + dim;
      // Fallback to moderate bandwidth (~1.2 Mbps) when resolution is omitted
      return 600 - Math.abs(v.bandwidth - 1_200_000) / 10_000;
    };
    return score(b) - score(a);
  });

  const chosen = scored[0];
  let audioUrl: string | undefined;
  if (chosen.audioGroupId) {
    const matching = master.audioRenditions.filter((a) => a.groupId === chosen.audioGroupId);
    audioUrl = (matching.find((a) => a.isDefault) || matching[0])?.url;
  } else if (master.audioRenditions.length > 0) {
    audioUrl = (master.audioRenditions.find((a) => a.isDefault) || master.audioRenditions[0])?.url;
  }

  return { variant: chosen, audioUrl };
}

export function parseHlsMediaPlaylist(
  text: string,
  baseUrl: string,
  maxDurationSec = 120,
): ParsedMediaPlaylist {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let initSegmentUrl: string | undefined;
  const segments: Array<{ url: string; durationSec: number }> = [];
  let totalDurationSec = 0;
  let pendingDuration = 4;

  for (const line of lines) {
    if (line.startsWith('#EXT-X-MAP:')) {
      const attrs = parseAttributes(line.slice('#EXT-X-MAP:'.length));
      if (attrs.URI) {
        initSegmentUrl = new URL(attrs.URI, baseUrl).href;
      }
      continue;
    }

    if (line.startsWith('#EXTINF:')) {
      const val = parseFloat(line.slice('#EXTINF:'.length).split(',')[0]);
      if (Number.isFinite(val) && val > 0) pendingDuration = val;
      continue;
    }

    if (line.startsWith('#')) continue;

    if (totalDurationSec >= maxDurationSec && segments.length > 0) break;

    const segUrl = new URL(line, baseUrl).href;
    segments.push({ url: segUrl, durationSec: pendingDuration });
    totalDurationSec += pendingDuration;
    pendingDuration = 4;
  }

  const firstSeg = segments[0]?.url.toLowerCase() || '';
  let format: ParsedMediaPlaylist['format'] = 'mpegts';
  if (initSegmentUrl || /\.(m4s|mp4|cmfv|cmfa)(\?|$)/.test(firstSeg)) {
    format = 'fmp4';
  } else if (/\.aac(\?|$)/.test(firstSeg)) {
    format = 'aac';
  }

  return { initSegmentUrl, segments, totalDurationSec, format };
}

/**
 * Pinterest CDN HLS URLs often have a direct 720p MP4 sibling at the same hash path:
 * e.g. .../videos/mc/hls/aa/bb/cc/hash.m3u8 -> .../videos/mc/720p/aa/bb/cc/hash.mp4
 */
export function derivePinterestMp4Candidates(hlsUrl: string): string[] {
  if (!/pinimg\.com\/videos\//i.test(hlsUrl) || !/\.m3u8(\?|$)/i.test(hlsUrl)) {
    return [];
  }
  const clean = hlsUrl.split('?')[0];
  const baseNoExt = clean.replace(/(?:_\d+[wp])?\.m3u8$/i, '');
  const candidates = new Set<string>();

  if (baseNoExt.includes('/hls/')) {
    candidates.add(baseNoExt.replace('/hls/', '/720p/') + '.mp4');
    candidates.add(baseNoExt.replace('/hls/', '/expMp4/') + '.mp4');
  }
  return Array.from(candidates);
}

async function fetchBinaryWithCap(url: string, maxBytes: number, timeoutMs = 15000): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      headers: MEDIA_HEADERS,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const len = Number(res.headers.get('content-length') || '0');
    if (len > maxBytes) return null;
    const arr = await res.arrayBuffer();
    if (arr.byteLength === 0 || arr.byteLength > maxBytes) return null;
    return Buffer.from(arr);
  } catch {
    return null;
  }
}

async function tryDownloadDerivedPinterestMp4(hlsUrl: string, maxBytes: number): Promise<Buffer | null> {
  const candidates = derivePinterestMp4Candidates(hlsUrl);
  for (const mp4Url of candidates) {
    try {
      const head = await fetch(mp4Url, {
        method: 'HEAD',
        headers: MEDIA_HEADERS,
        signal: AbortSignal.timeout(3500),
      });
      if (!head.ok) continue;
      const contentType = (head.headers.get('content-type') || '').toLowerCase();
      const contentLength = Number(head.headers.get('content-length') || '0');
      if (contentLength > maxBytes) continue;
      if (contentType && !contentType.includes('video') && !contentType.includes('octet-stream')) continue;

      const buf = await fetchBinaryWithCap(mp4Url, maxBytes, 20000);
      if (buf && buf.byteLength > 1024) return buf;
    } catch {
      // try next candidate
    }
  }
  return null;
}

async function remuxHlsWithFfmpeg(hlsUrl: string, maxBytes: number): Promise<Buffer | null> {
  if (!(await isFfmpegAvailable())) return null;

  const tmpOut = path.join(os.tmpdir(), `p2p_hls_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.mp4`);
  try {
    const commonArgs = [
      '-y',
      '-loglevel',
      'error',
      '-headers',
      'Referer: https://www.pinterest.com/\r\nUser-Agent: Mozilla/5.0\r\n',
      '-i',
      hlsUrl,
      '-t',
      '120',
      '-movflags',
      '+faststart',
    ];

    try {
      await execFileAsync(
        'ffmpeg',
        [...commonArgs, '-c', 'copy', '-bsf:a', 'aac_adtstoasc', tmpOut],
        { timeout: 35000 },
      );
    } catch {
      // Retry without ADTS bitstream filter (e.g. fMP4 audio or no audio track)
      await execFileAsync('ffmpeg', [...commonArgs, '-c', 'copy', tmpOut], { timeout: 35000 });
    }

    const stat = await fs.stat(tmpOut);
    if (stat.size === 0 || stat.size > maxBytes) return null;
    return await fs.readFile(tmpOut);
  } catch (err) {
    console.warn('[hlsDownloader] ffmpeg remux failed, falling back to pure-TS HLS assembler:', err instanceof Error ? err.message : err);
    return null;
  } finally {
    await fs.unlink(tmpOut).catch(() => {});
  }
}

async function downloadMediaPlaylistBytes(
  playlistUrl: string,
  maxBytes: number,
  maxDurationSec = 120,
): Promise<{ buffer: Buffer; format: ParsedMediaPlaylist['format'] } | null> {
  const res = await fetch(playlistUrl, {
    headers: MEDIA_HEADERS,
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return null;
  const text = await res.text();
  const parsed = parseHlsMediaPlaylist(text, res.url || playlistUrl, maxDurationSec);
  if (parsed.segments.length === 0) return null;

  const chunks: Buffer[] = [];
  let totalBytes = 0;

  if (parsed.initSegmentUrl) {
    const initBuf = await fetchBinaryWithCap(parsed.initSegmentUrl, maxBytes, 10000);
    if (!initBuf) return null;
    chunks.push(initBuf);
    totalBytes += initBuf.byteLength;
  }

  // Bounded concurrency (6 parallel segment fetches) preserving segment order
  const CONCURRENCY = 6;
  const segUrls = parsed.segments.map((s) => s.url);
  const results: Array<Buffer | null> = new Array(segUrls.length).fill(null);

  for (let start = 0; start < segUrls.length; start += CONCURRENCY) {
    if (totalBytes >= maxBytes) break;
    const batch = segUrls.slice(start, start + CONCURRENCY);
    const fetched = await Promise.all(
      batch.map((u) => fetchBinaryWithCap(u, Math.max(1024, maxBytes - totalBytes), 12000)),
    );
    for (let j = 0; j < fetched.length; j++) {
      const buf = fetched[j];
      if (!buf) continue;
      if (totalBytes + buf.byteLength > maxBytes) break;
      results[start + j] = buf;
      totalBytes += buf.byteLength;
    }
  }

  for (const buf of results) {
    if (buf) chunks.push(buf);
  }

  if (chunks.length === 0) return null;
  return { buffer: Buffer.concat(chunks), format: parsed.format };
}

async function downloadHlsPureTs(hlsUrl: string, maxBytes: number): Promise<DownloadedVideoMedia | null> {
  try {
    const res = await fetch(hlsUrl, {
      headers: MEDIA_HEADERS,
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const text = await res.text();
    const finalUrl = res.url || hlsUrl;

    const master = parseHlsMasterPlaylist(text, finalUrl);
    let videoPlaylistUrl = finalUrl;
    let audioPlaylistUrl: string | undefined;

    if (master.isMaster) {
      const selected = selectOptimalHlsVariant(master);
      if (!selected.variant) return null;
      videoPlaylistUrl = selected.variant.url;
      audioPlaylistUrl = selected.audioUrl;
    }

    const videoBudget = audioPlaylistUrl ? Math.floor(maxBytes * 0.85) : maxBytes;
    const videoTrack = await downloadMediaPlaylistBytes(videoPlaylistUrl, videoBudget);
    if (!videoTrack) return null;

    let audioTrack: { buffer: Buffer; mimeType: string } | undefined;
    if (audioPlaylistUrl) {
      const audioRes = await downloadMediaPlaylistBytes(audioPlaylistUrl, Math.floor(maxBytes * 0.15));
      if (audioRes) {
        audioTrack = {
          buffer: audioRes.buffer,
          mimeType: audioRes.format === 'aac' ? 'audio/aac' : 'audio/mp4',
        };
      }
    }

    if (videoTrack.format === 'fmp4') {
      return {
        video: { buffer: videoTrack.buffer, mimeType: 'video/mp4' },
        audio: audioTrack,
        method: 'hls-fmp4',
      };
    }

    return {
      video: { buffer: videoTrack.buffer, mimeType: 'video/mpeg' },
      audio: audioTrack,
      method: 'hls-ts',
    };
  } catch (err) {
    console.warn('[hlsDownloader] Pure-TS HLS download failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Downloads either a direct MP4/WebM/MOV video OR a public HLS (.m3u8) video stream
 * into a Gemini-compatible video (and optional separate audio) payload.
 */
export async function downloadVideoOrHls(
  videoUrl: string,
  maxBytes = 45 * 1024 * 1024,
): Promise<DownloadedVideoMedia | null> {
  if (!videoUrl) return null;

  const isHls = /\.m3u8(\?|$)/i.test(videoUrl) || videoUrl.includes('/hls/');
  if (!isHls) {
    const buf = await fetchBinaryWithCap(videoUrl, maxBytes, 20000);
    if (!buf) return null;
    const mimeType = /\.webm(\?|$)/i.test(videoUrl)
      ? 'video/webm'
      : /\.mov(\?|$)/i.test(videoUrl)
        ? 'video/mov'
        : 'video/mp4';
    return {
      video: { buffer: buf, mimeType },
      method: 'direct-mp4',
    };
  }

  // 1. Fast path: check if Pinterest CDN hosts a direct 720p MP4 sibling of this HLS URL
  const derivedMp4 = await tryDownloadDerivedPinterestMp4(videoUrl, maxBytes);
  if (derivedMp4) {
    return {
      video: { buffer: derivedMp4, mimeType: 'video/mp4' },
      method: 'derived-mp4',
    };
  }

  // 2. Local / container path: remux HLS (.ts or split fMP4) cleanly into a muxed MP4 via ffmpeg
  const ffmpegMp4 = await remuxHlsWithFfmpeg(videoUrl, maxBytes);
  if (ffmpegMp4) {
    return {
      video: { buffer: ffmpegMp4, mimeType: 'video/mp4' },
      method: 'hls-ffmpeg',
    };
  }

  // 3. Serverless zero-binary fallback: pure TypeScript HLS segment assembler
  return downloadHlsPureTs(videoUrl, maxBytes);
}

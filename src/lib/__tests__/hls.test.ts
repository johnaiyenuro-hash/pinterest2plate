import { describe, expect, it } from 'vitest';
import {
  derivePinterestMp4Candidates,
  parseHlsMasterPlaylist,
  parseHlsMediaPlaylist,
  selectOptimalHlsVariant,
} from '../hlsDownloader';
import { mapPinterestV5Pin, parseImportTarget } from '../pinterestResolver';

describe('hlsDownloader', () => {
  it('parses an HLS master playlist with separate audio rendition and selects 720p variant', () => {
    const masterText = `#EXTM3U
#EXT-X-VERSION:6
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio-aac",NAME="English",DEFAULT=YES,URI="audio/prog_index.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=450000,RESOLUTION=360x640,AUDIO="audio-aac"
360p/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1800000,RESOLUTION=720x1280,AUDIO="audio-aac"
720p/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=5500000,RESOLUTION=1080x1920,AUDIO="audio-aac"
1080p/index.m3u8`;

    const master = parseHlsMasterPlaylist(
      masterText,
      'https://v1.pinimg.com/videos/mc/hls/aa/bb/cc/master.m3u8',
    );
    expect(master.isMaster).toBe(true);
    expect(master.variants).toHaveLength(3);
    expect(master.audioRenditions).toHaveLength(1);

    const { variant, audioUrl } = selectOptimalHlsVariant(master);
    expect(variant?.url).toBe('https://v1.pinimg.com/videos/mc/hls/aa/bb/cc/720p/index.m3u8');
    expect(audioUrl).toBe('https://v1.pinimg.com/videos/mc/hls/aa/bb/cc/audio/prog_index.m3u8');
  });

  it('parses an fMP4 media playlist with EXT-X-MAP init segment and enforces max duration', () => {
    const mediaText = `#EXTM3U
#EXT-X-VERSION:7
#EXT-X-TARGETDURATION:6
#EXT-X-MAP:URI="init.mp4"
#EXTINF:6.0,
seg0.m4s
#EXTINF:6.0,
seg1.m4s
#EXTINF:6.0,
seg2.m4s`;

    const media = parseHlsMediaPlaylist(
      mediaText,
      'https://v1.pinimg.com/videos/mc/hls/aa/bb/cc/720p/index.m3u8',
      10,
    );
    expect(media.format).toBe('fmp4');
    expect(media.initSegmentUrl).toBe('https://v1.pinimg.com/videos/mc/hls/aa/bb/cc/720p/init.mp4');
    expect(media.segments).toHaveLength(2); // stops after exceeding 10s cap (12s)
  });

  it('parses an MPEG-TS media playlist cleanly', () => {
    const tsText = `#EXTM3U
#EXTINF:4.5,
chunk_0.ts
#EXTINF:4.5,
chunk_1.ts`;

    const media = parseHlsMediaPlaylist(tsText, 'https://cdn.example.com/hls/stream.m3u8');
    expect(media.format).toBe('mpegts');
    expect(media.segments).toHaveLength(2);
    expect(media.totalDurationSec).toBe(9);
  });

  it('derives Pinterest CDN direct MP4 sibling URLs from HLS URLs', () => {
    const candidates = derivePinterestMp4Candidates(
      'https://v1.pinimg.com/videos/mc/hls/12/34/56/abc123_720w.m3u8',
    );
    expect(candidates).toContain('https://v1.pinimg.com/videos/mc/720p/12/34/56/abc123.mp4');
    expect(candidates).toContain('https://v1.pinimg.com/videos/mc/expMp4/12/34/56/abc123.mp4');
  });

  it('recognizes direct .m3u8 video URLs and HLS-only Pinterest pins', () => {
    const target = parseImportTarget('https://v1.pinimg.com/videos/mc/hls/12/34/56/abc123.m3u8');
    expect(target.kind).toBe('video');

    const mapped = mapPinterestV5Pin(
      {
        id: '998877',
        title: 'Crispy Chili Oil Noodles',
        media: {
          media_type: 'video',
          videoList: {
            vHLSV4: { url: 'https://v1.pinimg.com/videos/mc/hls/12/34/56/abc123.m3u8', duration: 28000 },
          },
        },
      },
      'v5_test',
    );
    expect(mapped.mediaType).toBe('video');
    expect(mapped.videoUrl).toBe('https://v1.pinimg.com/videos/mc/hls/12/34/56/abc123.m3u8');
  });
});

'use client';

import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Bookmark,
  CheckCircle2,
  Clock,
  Film,
  Image as ImageIcon,
  Info,
  Link2,
  Loader2,
  Lock,
  Shuffle,
  Sparkles,
  Square,
  X,
  XCircle,
} from 'lucide-react';
import type { Board, RawPin, Recipe } from '@/lib/types';

export interface ExtractionProgressItem {
  pin: RawPin;
  state: 'queued' | 'extracting' | 'ready' | 'skipped' | 'cancelled' | 'error';
  recipeTitle?: string;
  sourceType?: Recipe['sourceType'];
  error?: string;
}

export interface DiscoverSummary {
  totalBoardPins: number;
  totalDiscovered: number;
  cappedByPublicFeed: boolean;
  unimportedAvailable: number;
}

interface RuntimeStatus {
  geminiConfigured: boolean;
  pinterestOAuthConfigured: boolean;
  pinterestConnected: boolean;
  storageMode: 'postgres' | 'local-json';
}

interface ImportModalProps {
  open: boolean;
  initialUrl?: string;
  status: RuntimeStatus;
  extensionReady: boolean;
  progressItems: ExtractionProgressItem[];
  discoverSummary: DiscoverSummary | null;
  isRunning: boolean;
  onClose: () => void;
  onCancelImport: () => void;
  onStartPublicImport: (url: string, maxPins: number, samplingMode: 'latest' | 'diverse') => Promise<void>;
  onStartOAuthImport: (board: Board, maxPins: number, samplingMode: 'latest' | 'diverse') => Promise<void>;
  onDisconnectPinterest: () => Promise<void>;
}

export function ImportModal({
  open,
  initialUrl,
  status,
  extensionReady,
  progressItems,
  discoverSummary,
  isRunning,
  onClose,
  onCancelImport,
  onStartPublicImport,
  onStartOAuthImport,
  onDisconnectPinterest,
}: ImportModalProps) {
  const [tab, setTab] = useState<'url' | 'oauth'>('url');
  const [urlInput, setUrlInput] = useState(initialUrl || 'https://uk.pinterest.com/shalom_x/food');
  const [maxPins, setMaxPins] = useState(12);
  const [samplingMode, setSamplingMode] = useState<'latest' | 'diverse'>('diverse');
  const [oauthBoards, setOAuthBoards] = useState<Board[]>([]);
  const [loadingBoards, setLoadingBoards] = useState(false);
  const [bookmarkletOrigin, setBookmarkletOrigin] = useState('https://pinterest-to-plate.vercel.app');

  useEffect(() => {
    if (initialUrl) setUrlInput(initialUrl);
  }, [initialUrl]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setBookmarkletOrigin(window.location.origin);
    }
  }, []);

  useEffect(() => {
    if (!open || tab !== 'oauth' || !status.pinterestConnected) return;
    setLoadingBoards(true);
    fetch('/api/pinterest/boards')
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.boards)) setOAuthBoards(d.boards);
      })
      .catch(() => {})
      .finally(() => setLoadingBoards(false));
  }, [open, tab, status.pinterestConnected]);

  if (!open) return null;

  const doneCount = progressItems.filter(
    (p) => p.state === 'ready' || p.state === 'skipped',
  ).length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Import Pinterest Board or Pin"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#1C1917]/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-[#E8E1D7] bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[#EFE8DF] bg-[#FCFBF8] px-6 py-5">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-[#D93B22]/10 px-2.5 py-0.5 text-[11px] font-bold text-[#D93B22]">
              <Sparkles className="h-3 w-3" />
              Gemini Multimodal Video &amp; Image Extractor
            </div>
            <h2 className="mt-1.5 font-serif text-xl font-semibold text-[#1C1917]">
              Import Pinterest Board or Pins
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close import modal"
            className="rounded-xl p-1.5 text-[#8A8177] hover:bg-[#FAF7F2] hover:text-[#1C1917]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="thin-scroll flex-1 overflow-y-auto p-6 space-y-5">
          {!status.geminiConfigured && (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-300/70 bg-amber-50 p-3.5 text-xs text-amber-950">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
              <div>
                <p className="font-bold">GEMINI_API_KEY not configured yet</p>
                <p className="mt-0.5 text-amber-900/80">
                  Add <code className="rounded bg-amber-100 px-1 py-0.5 font-mono">GEMINI_API_KEY</code> to{' '}
                  <code className="rounded bg-amber-100 px-1 py-0.5 font-mono">.env.local</code> or Vercel Environment Variables to read video &amp; image pins.
                </p>
              </div>
            </div>
          )}

          {/* Mode Tabs */}
          <div className="grid grid-cols-2 rounded-2xl bg-[#FAF7F2] p-1 border border-[#E8E1D7]">
            <button
              type="button"
              onClick={() => setTab('url')}
              className={`inline-flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold transition-all ${
                tab === 'url'
                  ? 'bg-white text-[#1C1917] shadow-sm'
                  : 'text-[#6B645C] hover:text-[#1C1917]'
              }`}
            >
              <Link2 className="h-3.5 w-3.5" />
              Paste Board / Pin Link(s)
            </button>
            <button
              type="button"
              onClick={() => setTab('oauth')}
              className={`inline-flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold transition-all ${
                tab === 'oauth'
                  ? 'bg-white text-[#1C1917] shadow-sm'
                  : 'text-[#6B645C] hover:text-[#1C1917]'
              }`}
            >
              <Lock className="h-3.5 w-3.5" />
              Pinterest Account (All 600+ Pins)
            </button>
          </div>

          {/* Sampling Mode & Batch Size Controls */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#EFE8DF] bg-[#FCFBF8] px-3.5 py-2.5 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-[#6B645C]">Pick:</span>
              <button
                type="button"
                onClick={() => setSamplingMode('diverse')}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 font-bold transition-colors ${
                  samplingMode === 'diverse'
                    ? 'bg-[#1C1917] text-white'
                    : 'bg-white border border-[#E8E1D7] text-[#575049] hover:border-[#CFC3B4]'
                }`}
              >
                <Shuffle className="h-3 w-3" />
                Diverse Mix
              </button>
              <button
                type="button"
                onClick={() => setSamplingMode('latest')}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 font-bold transition-colors ${
                  samplingMode === 'latest'
                    ? 'bg-[#1C1917] text-white'
                    : 'bg-white border border-[#E8E1D7] text-[#575049] hover:border-[#CFC3B4]'
                }`}
              >
                <Clock className="h-3 w-3" />
                Latest
              </button>
            </div>

            <div className="flex items-center gap-1.5 text-[#6B645C]">
              <span>Batch:</span>
              {[6, 12, 25].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setMaxPins(n)}
                  className={`rounded-lg px-2 py-1 font-bold tabular-nums ${
                    maxPins === n
                      ? 'bg-[#D93B22] text-white'
                      : 'bg-white border border-[#E8E1D7] text-[#6B645C] hover:bg-[#EFE8DF]'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {tab === 'url' ? (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#6B645C] mb-1.5">
                  Pinterest Board, Multiple Pin URLs (1 per line), Blog, or Video (.mp4 / .m3u8)
                </label>
                <textarea
                  rows={urlInput.includes('\n') ? 4 : 2}
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="Board URL (e.g. uk.pinterest.com/shalom_x/food), multiple pin URLs (1 per line), blog URL, or .m3u8/.mp4 video"
                  className="w-full rounded-xl border border-[#DED5C8] bg-[#FCFBF8] px-3.5 py-2.5 text-xs font-medium text-[#1C1917] placeholder:text-[#A89E91] focus:border-[#D93B22] focus:bg-white focus:outline-none"
                />

                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setUrlInput('https://uk.pinterest.com/shalom_x/food')}
                    className="text-[11px] font-semibold text-[#D93B22] hover:underline"
                  >
                    Use @shalom_x / Food board
                  </button>

                  <div className="flex items-center gap-2">
                    {isRunning && (
                      <button
                        type="button"
                        onClick={onCancelImport}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-red-300 bg-red-50 px-3.5 py-2 text-xs font-bold text-red-700 transition-colors hover:bg-red-100"
                      >
                        <Square className="h-3 w-3 fill-current" />
                        Cancel Import
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={isRunning || !urlInput.trim()}
                      onClick={() => onStartPublicImport(urlInput.trim(), maxPins, samplingMode)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#D93B22] px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-[#B82D17] disabled:opacity-50"
                    >
                      {isRunning ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Extracting...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-3.5 w-3.5" />
                          Add New Pins
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* 600+ Pin Public Feed Notice */}
              {discoverSummary?.cappedByPublicFeed && (
                <div className="flex items-start gap-2.5 rounded-2xl border border-sky-200 bg-sky-50/80 p-3.5 text-xs text-sky-950">
                  <Info className="h-4 w-4 shrink-0 text-sky-600 mt-0.5" />
                  <p className="leading-relaxed">
                    <strong>This board has {discoverSummary.totalBoardPins} pins</strong>, but Pinterest&apos;s public feed only returns the latest {discoverSummary.totalDiscovered}. To pull a diverse mix from further down your board, either <strong>scroll down in Pinterest and click the Board Clipper bookmarklet below</strong>, or connect <strong>Pinterest OAuth</strong> in the second tab.
                  </p>
                </div>
              )}

              {/* Chrome Extension Auto-Scroller Card (Replaces CSP-blocked Bookmarklet) */}
              <div className="flex items-start justify-between gap-3 rounded-2xl border border-[#EFE8DF] bg-[#FAF7F2] px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Bookmark className="h-3.5 w-3.5 text-[#D93B22] shrink-0" />
                    <p className="text-xs font-bold text-[#1C1917]">
                      Chrome Extension Auto-Scroller (All 600+ Pins)
                    </p>
                    {extensionReady && (
                      <span className="rounded-full bg-[#2D6A4F] px-2 py-0.5 text-[10px] font-bold text-white">
                        Connected
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[#6B645C] leading-snug mt-1">
                    {extensionReady
                      ? 'Open your Pinterest board in Chrome and click the P!nterest2Plate extension icon to auto-scroll all 600+ pins and send a diverse mix right here.'
                      : 'Pinterest blocks browser bookmarklets via CSP. Load the included chrome-extension folder in chrome://extensions (Developer Mode → Load unpacked) to auto-scroll 600+ pin boards and auto-fill UK supermarket trolleys.'}
                  </p>
                </div>
              </div>

              {/* How Multimodal Extraction Works */}
              <div className="grid grid-cols-3 gap-2 rounded-2xl border border-[#EFE8DF] bg-[#FCFBF8] p-3 text-[11px]">
                <div className="space-y-1">
                  <span className="inline-flex items-center gap-1 font-bold text-[#1C1917]">
                    <Film className="h-3.5 w-3.5 text-[#D93B22]" /> Videos &amp; HLS
                  </span>
                  <p className="text-[#6B645C] leading-snug">
                    Downloads MP4 &amp; public HLS (.m3u8) reels with audio into timestamped steps.
                  </p>
                </div>
                <div className="space-y-1">
                  <span className="inline-flex items-center gap-1 font-bold text-[#1C1917]">
                    <ImageIcon className="h-3.5 w-3.5 text-[#2D6A4F]" /> Images
                  </span>
                  <p className="text-[#6B645C] leading-snug">
                    Reads recipe cards, carousels &amp; handwritten lists automatically.
                  </p>
                </div>
                <div className="space-y-1">
                  <span className="inline-flex items-center gap-1 font-bold text-[#1C1917]">
                    <Sparkles className="h-3.5 w-3.5 text-amber-600" /> Smart Filter
                  </span>
                  <p className="text-[#6B645C] leading-snug">
                    Auto-skips storage charts &amp; already-imported pins so every sync adds fresh meals.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {!status.pinterestOAuthConfigured ? (
                <div className="rounded-2xl border border-[#E8E1D7] bg-[#FAF7F2] p-5 text-center space-y-2">
                  <Lock className="mx-auto h-7 w-7 text-[#8A8177]" />
                  <h3 className="font-serif text-base font-semibold text-[#1C1917]">
                    Sample Across All 600+ Pins with Pinterest OAuth
                  </h3>
                  <p className="text-xs text-[#6B645C] leading-relaxed">
                    Create a Pinterest App at <span className="font-semibold">developers.pinterest.com</span> with Redirect URI{' '}
                    <code className="rounded bg-white px-1 py-0.5 font-mono text-[11px]">
                      {bookmarkletOrigin}/api/pinterest/callback
                    </code>
                    , then add <code className="rounded bg-white px-1 py-0.5 font-mono">PINTEREST_APP_ID</code> and{' '}
                    <code className="rounded bg-white px-1 py-0.5 font-mono">PINTEREST_APP_SECRET</code> in Vercel to paginate through all 750 pins per board (including private boards &amp; 720p MP4 videos).
                  </p>
                </div>
              ) : !status.pinterestConnected ? (
                <div className="rounded-2xl border border-[#E8E1D7] bg-[#FAF7F2] p-5 text-center space-y-3">
                  <h3 className="font-serif text-base font-semibold text-[#1C1917]">
                    Sign in with Pinterest
                  </h3>
                  <p className="text-xs text-[#6B645C]">
                    Paginate through all 600+ pins on your boards with Diverse Mix sampling and direct MP4 video access.
                  </p>
                  <a
                    href="/api/pinterest/auth"
                    className="inline-flex items-center gap-2 rounded-xl bg-[#E60023] px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#C2001D]"
                  >
                    Connect Pinterest Account
                  </a>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#2D6A4F]">
                      Connected to Pinterest API v5
                    </span>
                    <div className="flex items-center gap-3">
                      {isRunning && (
                        <button
                          type="button"
                          onClick={onCancelImport}
                          className="inline-flex items-center gap-1 text-xs font-bold text-red-600 hover:underline"
                        >
                          <Square className="h-3 w-3 fill-current" />
                          Cancel Import
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={onDisconnectPinterest}
                        className="text-xs font-semibold text-[#8A8177] hover:text-[#D93B22]"
                      >
                        Disconnect
                      </button>
                    </div>
                  </div>

                  {loadingBoards ? (
                    <div className="py-8 text-center text-xs text-[#6B645C]">
                      <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-[#D93B22]" />
                      Loading your Pinterest boards...
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-60 overflow-y-auto thin-scroll">
                      {oauthBoards.map((b) => (
                        <div
                          key={b.id}
                          className="flex items-center justify-between rounded-xl border border-[#E8E1D7] bg-[#FCFBF8] px-3.5 py-2.5"
                        >
                          <div>
                            <p className="text-sm font-semibold text-[#1C1917]">{b.name}</p>
                            <p className="text-[11px] text-[#8A8177] tabular-nums">
                              {b.pinCount} pins
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={isRunning}
                            onClick={() => onStartOAuthImport(b, maxPins, samplingMode)}
                            className="rounded-xl bg-[#1C1917] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#332E2A] disabled:opacity-50"
                          >
                            Import {maxPins}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Live Extraction Queue */}
          {progressItems.length > 0 && (
            <div className="space-y-2.5 border-t border-[#EFE8DF] pt-4">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-[#1C1917]">
                  Extraction Progress ({doneCount}/{progressItems.length})
                </span>
                {isRunning && (
                  <button
                    type="button"
                    onClick={onCancelImport}
                    className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-700 hover:bg-red-100"
                  >
                    <Square className="h-2.5 w-2.5 fill-current" />
                    Stop
                  </button>
                )}
              </div>

              <div className="max-h-52 space-y-1.5 overflow-y-auto thin-scroll">
                {progressItems.map((item) => (
                  <div
                    key={item.pin.pinId}
                    className="flex items-center justify-between gap-2.5 rounded-xl border border-[#EFE8DF] bg-[#FCFBF8] px-3 py-2 text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {item.pin.imageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.pin.imageUrl}
                          alt=""
                          className="h-8 w-8 shrink-0 rounded-lg object-cover"
                        />
                      )}
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-[#1C1917]">
                          {item.recipeTitle || item.pin.title}
                        </p>
                        <p className="truncate text-[11px] text-[#8A8177]">
                          {item.state === 'queued' && 'Waiting in queue'}
                          {item.state === 'extracting' && 'Reading video/image with Gemini...'}
                          {item.state === 'ready' && `Ready (${item.sourceType || item.pin.mediaType})`}
                          {item.state === 'skipped' && 'Skipped — Not a cookable recipe'}
                          {item.state === 'cancelled' && 'Cancelled'}
                          {item.state === 'error' && (item.error || 'Extraction failed')}
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0">
                      {item.state === 'queued' && (
                        <span className="rounded-full bg-[#EFE8DF] px-2 py-0.5 text-[10px] font-bold text-[#6B645C]">
                          Queued
                        </span>
                      )}
                      {item.state === 'extracting' && (
                        <Loader2 className="h-4 w-4 animate-spin text-[#D93B22]" />
                      )}
                      {item.state === 'ready' && (
                        <CheckCircle2 className="h-4 w-4 text-[#2D6A4F]" />
                      )}
                      {item.state === 'skipped' && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                          Skipped
                        </span>
                      )}
                      {item.state === 'cancelled' && (
                        <span className="rounded-full bg-[#EFE8DF] px-2 py-0.5 text-[10px] font-bold text-[#8A8177]">
                          Cancelled
                        </span>
                      )}
                      {item.state === 'error' && <XCircle className="h-4 w-4 text-red-500" />}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

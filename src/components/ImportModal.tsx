'use client';

import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Chrome,
  Download,
  ExternalLink,
  Link2,
  Loader2,
  Sparkles,
  Square,
  X,
  XCircle,
} from 'lucide-react';
import type { RawPin, Recipe } from '@/lib/types';

export interface ExtractionProgressItem {
  pin: RawPin;
  state: 'queued' | 'extracting' | 'ready' | 'skipped' | 'cancelled' | 'error';
  recipeTitle?: string;
  sourceType?: Recipe['sourceType'];
  error?: string;
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
  isRunning: boolean;
  onClose: () => void;
  onCancelImport: () => void;
  onStartSingleLinkImport: (url: string) => Promise<void>;
}

export function ImportModal({
  open,
  initialUrl,
  status,
  extensionReady,
  progressItems,
  isRunning,
  onClose,
  onCancelImport,
  onStartSingleLinkImport,
}: ImportModalProps) {
  const [singleUrl, setSingleUrl] = useState(initialUrl || '');

  useEffect(() => {
    if (initialUrl) setSingleUrl(initialUrl);
  }, [initialUrl]);

  if (!open) return null;

  const doneCount = progressItems.filter(
    (p) => p.state === 'ready' || p.state === 'skipped',
  ).length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add Recipes from Pinterest"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#1C1917]/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-[#E8E1D7] bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[#EFE8DF] bg-[#FCFBF8] px-6 py-5">
          <div>
            <h2 className="font-serif text-xl font-semibold text-[#1C1917]">
              Add Recipes from Pinterest
            </h2>
            <p className="mt-1 text-xs text-[#6B645C]">
              Pull a fresh mix of recipes from your Pinterest board—we&apos;ll read the photos &amp; videos into step-by-step plans.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
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
              <p>
                Recipe reading is paused until <code className="rounded bg-amber-100 px-1 py-0.5 font-mono">GEMINI_API_KEY</code> is added in your project settings.
              </p>
            </div>
          )}

          {/* Primary Flow: Chrome Extension Auto-Scroller */}
          <div className="rounded-2xl border border-[#E8E1D7] bg-[#FAF7F2] p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#D93B22] text-white">
                  <Chrome className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#1C1917]">
                    Import from Your Pinterest Board
                  </h3>
                  <p className="text-[11px] text-[#6B645C]">
                    Best way to grab a varied mix across big boards (600+ pins)
                  </p>
                </div>
              </div>

              {extensionReady ? (
                <span className="shrink-0 rounded-full bg-[#2D6A4F] px-2.5 py-1 text-[10px] font-bold text-white">
                  Extension Ready
                </span>
              ) : (
                <span className="shrink-0 rounded-full bg-[#EFE8DF] px-2.5 py-1 text-[10px] font-bold text-[#6B645C]">
                  Chrome Extension
                </span>
              )}
            </div>

            <ol className="space-y-2.5 text-xs text-[#443E38]">
              <li className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white border border-[#DED5C8] text-[11px] font-bold text-[#1C1917]">
                  1
                </span>
                <span>
                  Open your food board on{' '}
                  <a
                    href="https://www.pinterest.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 font-bold text-[#D93B22] hover:underline"
                  >
                    Pinterest
                    <ExternalLink className="h-3 w-3" />
                  </a>
                  .
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white border border-[#DED5C8] text-[11px] font-bold text-[#1C1917]">
                  2
                </span>
                <span>
                  Click the <strong>Pin2Plate (P2P)</strong> icon in your Chrome toolbar.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white border border-[#DED5C8] text-[11px] font-bold text-[#1C1917]">
                  3
                </span>
                <span>
                  Choose how far down to scroll and tap <strong>Auto-Scroll &amp; Grab Pins</strong>—your new recipes will appear here automatically.
                </span>
              </li>
            </ol>

            {extensionReady ? (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-[#D3E3D9] bg-[#F5F8F4] px-3.5 py-2 text-[11px] text-[#2D6A4F]">
                <span className="font-semibold">Chrome extension connected on this browser.</span>
                <a
                  href="/downloads/pin2plate-extension.zip"
                  download="pin2plate-extension.zip"
                  className="inline-flex items-center gap-1 font-bold underline hover:text-[#1C1917]"
                >
                  <Download className="h-3 w-3" />
                  Download .zip
                </a>
              </div>
            ) : (
              <div className="rounded-xl border border-[#E8E1D7] bg-white p-3.5 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold text-[#1C1917]">
                      Don&apos;t have the extension yet?
                    </p>
                    <p className="text-[11px] text-[#6B645C]">
                      Download it free and add it to Chrome in 30 seconds.
                    </p>
                  </div>
                  <a
                    href="/downloads/pin2plate-extension.zip"
                    download="pin2plate-extension.zip"
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#1C1917] px-3.5 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-[#D93B22]"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download Extension
                  </a>
                </div>
                <p className="text-[11px] text-[#6B645C] leading-relaxed border-t border-[#F4EFE7] pt-2">
                  <strong>Quick install:</strong> Unzip the download → open{' '}
                  <code className="rounded bg-[#FAF7F2] px-1 py-0.5 font-mono text-[#1C1917]">chrome://extensions</code>{' '}
                  → switch on <strong>Developer mode</strong> (top right) → click <strong>Load unpacked</strong> and choose the unzipped folder.
                </p>
              </div>
            )}
          </div>

          {/* Secondary Simple Single-Link Input (Handy on Phone or for Recipe Blogs) */}
          <div className="space-y-2 border-t border-[#EFE8DF] pt-4">
            <label className="flex items-center gap-1.5 text-xs font-bold text-[#443E38]">
              <Link2 className="h-3.5 w-3.5 text-[#8A8177]" />
              Or paste a single recipe or pin link
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                value={singleUrl}
                onChange={(e) => setSingleUrl(e.target.value)}
                placeholder="https://www.pinterest.com/pin/... or any recipe website"
                className="flex-1 rounded-xl border border-[#DED5C8] bg-[#FCFBF8] px-3.5 py-2.5 text-xs text-[#1C1917] placeholder:text-[#A89E91] focus:border-[#D93B22] focus:bg-white focus:outline-none"
              />
              {isRunning ? (
                <button
                  type="button"
                  onClick={onCancelImport}
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-red-300 bg-red-50 px-3.5 py-2 text-xs font-bold text-red-700 hover:bg-red-100"
                >
                  <Square className="h-3 w-3 fill-current" />
                  Stop
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!singleUrl.trim()}
                  onClick={() => onStartSingleLinkImport(singleUrl.trim())}
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-[#D93B22] px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-[#B82D17] disabled:opacity-45"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Add
                </button>
              )}
            </div>
          </div>

          {/* Live Progress List */}
          {progressItems.length > 0 && (
            <div className="space-y-2.5 border-t border-[#EFE8DF] pt-4">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-[#1C1917]">
                  Reading Recipes ({doneCount} of {progressItems.length})
                </span>
                {isRunning && (
                  <button
                    type="button"
                    onClick={onCancelImport}
                    className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-700 hover:bg-red-100"
                  >
                    <Square className="h-2.5 w-2.5 fill-current" />
                    Cancel
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
                          {item.state === 'queued' && 'Waiting...'}
                          {item.state === 'extracting' && 'Reading recipe & ingredients...'}
                          {item.state === 'ready' && 'Added to your recipes'}
                          {item.state === 'skipped' && 'Skipped (not a recipe)'}
                          {item.state === 'cancelled' && 'Stopped'}
                          {item.state === 'error' && (item.error || 'Could not read this pin')}
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0">
                      {item.state === 'queued' && (
                        <span className="rounded-full bg-[#EFE8DF] px-2 py-0.5 text-[10px] font-bold text-[#6B645C]">
                          Waiting
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
                          Stopped
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

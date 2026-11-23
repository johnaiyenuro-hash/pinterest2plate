'use client';

import { useMemo, useState } from 'react';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ClipboardCopy,
  ExternalLink,
  ShoppingCart,
  SkipForward,
  Sparkles,
  X,
} from 'lucide-react';
import type { StoreConfig } from '@/lib/stores';
import type { ConsolidatedItem } from '@/lib/types';

interface ShopAllModalProps {
  open: boolean;
  store: StoreConfig;
  items: ConsolidatedItem[];
  checkedKeys: Set<string>;
  extensionReady: boolean;
  onToggleChecked: (key: string) => void;
  onStartExtensionAutoFill: () => void;
  onClose: () => void;
  onNotify: (msg: string) => void;
}

export function ShopAllModal({
  open,
  store,
  items,
  checkedKeys,
  extensionReady,
  onToggleChecked,
  onStartExtensionAutoFill,
  onClose,
  onNotify,
}: ShopAllModalProps) {
  const [tab, setTab] = useState<'queue' | 'bulk'>(store.supportsBulkPaste ? 'bulk' : 'queue');
  const [cursor, setCursor] = useState(0);

  const remainingItems = useMemo(
    () => items.filter((i) => !checkedKeys.has(i.key)),
    [items, checkedKeys],
  );

  if (!open) return null;

  const doneCount = items.length - remainingItems.length;
  const pct = items.length > 0 ? Math.round((doneCount / items.length) * 100) : 100;
  const currentItem = remainingItems[Math.min(cursor, Math.max(0, remainingItems.length - 1))];

  const bulkPlainList = remainingItems
    .map((item) => item.ukSearchQuery)
    .join('\n');

  const bulkWithQuantities = remainingItems
    .map((item) => `${item.name} — ${item.combinedQty}`)
    .join('\n');

  const openInSingleReusableTab = (query: string) => {
    // Reusing one named tab ("p2p_supermarket_tab") prevents spawning 20 separate tabs!
    window.open(store.getSearchUrl(query), 'p2p_supermarket_tab');
  };

  const handleOpenAndTickCurrent = () => {
    if (!currentItem) return;
    openInSingleReusableTab(currentItem.ukSearchQuery);
    onToggleChecked(currentItem.key);
    setCursor(0);
  };

  const handleCopyBulk = async (withQty: boolean) => {
    const content = withQty ? bulkWithQuantities : bulkPlainList;
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      onNotify(
        withQty
          ? `Copied ${remainingItems.length} items with quantities`
          : `Copied ${remainingItems.length} search terms for ${store.name} Quick Shop`,
      );
    } catch {
      onNotify('Could not access clipboard');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Shop all items in ${store.name}`}
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
            <div className="inline-flex items-center gap-1.5 rounded-full bg-[#2D6A4F]/10 px-2.5 py-0.5 text-[11px] font-bold text-[#2D6A4F]">
              <ShoppingCart className="h-3 w-3" />
              Single-Basket Shop Flow · {store.name}
            </div>
            <h2 className="mt-1.5 font-serif text-xl font-semibold text-[#1C1917]">
              Add All Ingredients to {store.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Shop All modal"
            className="rounded-xl p-1.5 text-[#8A8177] hover:bg-[#FAF7F2] hover:text-[#1C1917]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Mode Switcher */}
        <div className="px-6 pt-5">
          <div className="grid grid-cols-2 rounded-2xl border border-[#E8E1D7] bg-[#FAF7F2] p-1">
            <button
              type="button"
              onClick={() => setTab('queue')}
              className={`rounded-xl py-2 text-xs font-bold transition-all ${
                tab === 'queue'
                  ? 'bg-white text-[#1C1917] shadow-sm'
                  : 'text-[#6B645C] hover:text-[#1C1917]'
              }`}
            >
              1-Tab Rapid Queue ({remainingItems.length})
            </button>
            <button
              type="button"
              onClick={() => setTab('bulk')}
              className={`rounded-xl py-2 text-xs font-bold transition-all ${
                tab === 'bulk'
                  ? 'bg-white text-[#1C1917] shadow-sm'
                  : 'text-[#6B645C] hover:text-[#1C1917]'
              }`}
            >
              Bulk Quick-Shop Paste
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="thin-scroll flex-1 overflow-y-auto p-6 space-y-5">
          {/* Chrome Extension 1-Click Auto-Fill Banner */}
          {remainingItems.length > 0 && ['tesco', 'sainsburys', 'ocado', 'asda'].includes(store.key) && (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#2D6A4F]/25 bg-[#F5F8F4] p-3.5 text-xs">
              <div className="min-w-0">
                <p className="font-bold text-[#1C1917]">
                  {extensionReady
                    ? `1-Click Auto-Fill Ready (${store.name})`
                    : 'Want automatic 1-click trolley filling?'}
                </p>
                <p className="mt-0.5 text-[11px] text-[#575049]">
                  {extensionReady
                    ? `Companion Extension detected — automatically clicks Add for all ${remainingItems.length} items inside ${store.name}.`
                    : 'Load the included chrome-extension folder in chrome://extensions to auto-click Add inside Tesco, Sainsbury’s, Ocado, or Asda.'}
                </p>
              </div>
              {extensionReady && (
                <button
                  type="button"
                  onClick={() => {
                    onStartExtensionAutoFill();
                    onClose();
                  }}
                  className="shrink-0 rounded-xl bg-[#2D6A4F] px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#23543E]"
                >
                  Auto-Fill Trolley
                </button>
              )}
            </div>
          )}

          {/* Progress */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-[#575049]">Basket Progress</span>
              <span className="text-[#2D6A4F] tabular-nums">
                {doneCount} of {items.length} added ({pct}%)
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-[#EFE8DF]">
              <div
                className="h-full rounded-full bg-[#2D6A4F] transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          {remainingItems.length === 0 ? (
            <div className="rounded-2xl border border-[#D3E3D9] bg-[#F5F8F4] p-8 text-center space-y-2">
              <CheckCircle2 className="mx-auto h-10 w-10 text-[#2D6A4F]" />
              <h3 className="font-serif text-lg font-semibold text-[#1C1917]">
                All {items.length} ingredients added!
              </h3>
              <p className="text-xs text-[#575049]">
                Head to your {store.name} trolley to review and check out.
              </p>
              {store.bulkShopUrl && (
                <a
                  href={store.bulkShopUrl}
                  target="p2p_supermarket_tab"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-[#2D6A4F] px-4 py-2 text-xs font-bold text-white hover:bg-[#23543E]"
                >
                  Open {store.name}
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          ) : tab === 'queue' && currentItem ? (
            <div className="space-y-4">
              <p className="text-xs text-[#6B645C] leading-relaxed">
                Opens each item inside <strong>one single reusable {store.name} tab</strong> so you can click &ldquo;Add to Trolley&rdquo; and tap Next without juggling 20 browser tabs.
              </p>

              {/* Current Item Spotlight Card */}
              <div className="rounded-2xl border-2 border-[#1C1917]/10 bg-[#FCFBF8] p-5 space-y-3">
                <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-[#8A8177]">
                  <span>{currentItem.aisle}</span>
                  <span className="tabular-nums">{remainingItems.length} left</span>
                </div>

                <div>
                  <h3 className="font-serif text-2xl font-semibold text-[#1C1917]">
                    {currentItem.name}
                  </h3>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <span className="rounded-lg bg-[#D93B22]/10 px-2.5 py-1 text-xs font-bold text-[#D93B22] tabular-nums">
                      Need: {currentItem.combinedQty}
                    </span>
                    <span className="text-xs text-[#6B645C]">
                      For {currentItem.fromRecipes.join(', ')}
                    </span>
                  </div>
                </div>

                <div className="pt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleOpenAndTickCurrent}
                    className={`flex-1 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-bold shadow-sm transition-all ${store.pillActiveClass}`}
                  >
                    <span>Open in {store.name} &amp; Tick Off</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setCursor((c) => (c + 1) % remainingItems.length)}
                    className="inline-flex items-center gap-1 rounded-xl border border-[#DED5C8] bg-white px-3.5 py-3 text-xs font-bold text-[#575049] hover:bg-[#FAF7F2]"
                    title="Skip to next item"
                  >
                    <SkipForward className="h-3.5 w-3.5" />
                    Skip
                  </button>
                </div>
              </div>

              {/* Up Next Preview */}
              {remainingItems.length > 1 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#8A8177]">
                    Up Next
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {remainingItems.slice(1, 7).map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => openInSingleReusableTab(item.ukSearchQuery)}
                        className="inline-flex items-center gap-1 rounded-full border border-[#E8E1D7] bg-white px-2.5 py-1 text-[11px] font-medium text-[#575049] hover:border-[#D93B22]"
                      >
                        <span>{item.name}</span>
                        <span className="text-[#A89E91]">({item.combinedQty})</span>
                      </button>
                    ))}
                    {remainingItems.length > 7 && (
                      <span className="px-2 py-1 text-[11px] text-[#8A8177]">
                        +{remainingItems.length - 7} more
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start gap-2.5 rounded-2xl border border-[#E8E1D7] bg-[#FAF7F2] p-3.5 text-xs text-[#443E38]">
                <Sparkles className="h-4 w-4 shrink-0 text-[#D93B22] mt-0.5" />
                <p>
                  {store.supportsBulkPaste
                    ? store.bulkShopNote
                    : 'UK supermarkets block third-party multi-add cart APIs — switch to Ocado for 1-paste multi-item Quick Shop, or copy this clean list below.'}
                </p>
              </div>

              <textarea
                readOnly
                rows={8}
                value={bulkPlainList}
                className="w-full rounded-2xl border border-[#DED5C8] bg-[#FCFBF8] p-3.5 font-mono text-xs leading-relaxed text-[#1C1917] focus:outline-none"
              />

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleCopyBulk(false)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#1C1917] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#332E2A]"
                >
                  <ClipboardCopy className="h-3.5 w-3.5" />
                  Copy Bulk Search List
                </button>

                <button
                  type="button"
                  onClick={() => handleCopyBulk(true)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#DED5C8] bg-white px-3.5 py-2.5 text-xs font-bold text-[#443E38] hover:bg-[#FAF7F2]"
                >
                  <Check className="h-3.5 w-3.5" />
                  With Quantities
                </button>
              </div>

              {store.bulkShopUrl && (
                <a
                  href={store.bulkShopUrl}
                  target="p2p_supermarket_tab"
                  rel="noopener noreferrer"
                  className={`w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold shadow-sm ${store.pillActiveClass}`}
                >
                  <span>
                    {store.supportsBulkPaste
                      ? `Open ${store.name} Quick Shop (Paste & Add All)`
                      : `Open ${store.name} Groceries`}
                  </span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

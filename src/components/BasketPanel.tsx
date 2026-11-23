'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  Printer,
  ShoppingBasket,
  ShoppingCart,
  Sparkles,
  X,
} from 'lucide-react';
import { consolidateBasket } from '@/lib/consolidate';
import { STORE_LIST, STORES } from '@/lib/stores';
import type { ConsolidatedItem, Recipe, SupermarketKey } from '@/lib/types';
import { ShopAllModal } from './ShopAllModal';

interface BasketPanelProps {
  recipes: Recipe[];
  selectedIds: string[];
  servingsOverride: Record<string, number>;
  currentStore: SupermarketKey;
  hidePantry: boolean;
  checkedKeys: Set<string>;
  extensionReady: boolean;
  onSelectStore: (store: SupermarketKey) => void;
  onToggleHidePantry: (hide: boolean) => void;
  onToggleItemChecked: (key: string) => void;
  onRemoveRecipe: (id: string) => void;
  onOpenPlan: (recipe: Recipe) => void;
  onNotify: (message: string) => void;
}

export function BasketPanel({
  recipes,
  selectedIds,
  servingsOverride,
  currentStore,
  hidePantry,
  checkedKeys,
  extensionReady,
  onSelectStore,
  onToggleHidePantry,
  onToggleItemChecked,
  onRemoveRecipe,
  onOpenPlan,
  onNotify,
}: BasketPanelProps) {
  const [shopAllOpen, setShopAllOpen] = useState(false);
  const storeConfig = STORES[currentStore] || STORES.tesco;

  const selectedRecipes = useMemo(() => {
    const idSet = new Set(selectedIds);
    return recipes.filter((r) => idSet.has(r.id) && r.status === 'ready');
  }, [recipes, selectedIds]);

  const basket = useMemo(
    () => consolidateBasket(recipes, selectedIds, servingsOverride),
    [recipes, selectedIds, servingsOverride],
  );

  const visibleAisles = useMemo(() => {
    const entries: Array<[string, ConsolidatedItem[]]> = [];
    for (const [aisle, items] of Object.entries(basket.aisles)) {
      const filtered = items.filter((item) => {
        const isPantryOrHave = item.isPantry || checkedKeys.has(item.key);
        return !(hidePantry && isPantryOrHave);
      });
      if (filtered.length > 0) entries.push([aisle, filtered]);
    }
    return entries;
  }, [basket, hidePantry, checkedKeys]);

  const flatVisibleItems = useMemo(
    () => visibleAisles.flatMap(([, items]) => items),
    [visibleAisles],
  );

  const remainingToBuyCount = useMemo(
    () => flatVisibleItems.filter((item) => !checkedKeys.has(item.key)).length,
    [flatVisibleItems, checkedKeys],
  );

  // Keep the P!nterest2Plate Chrome Extension synced with the live consolidated basket
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.postMessage(
      {
        type: 'P2P_WEBAPP_SYNC_BASKET',
        payload: {
          store: currentStore,
          mealsCount: selectedRecipes.length,
          meals: selectedRecipes.map((r) => r.title),
          items: flatVisibleItems.map((item) => ({
            key: item.key,
            name: item.name,
            ukSearchQuery: item.ukSearchQuery,
            combinedQty: item.combinedQty,
            aisle: item.aisle,
            checked: checkedKeys.has(item.key),
          })),
        },
      },
      '*',
    );
  }, [currentStore, selectedRecipes, flatVisibleItems, checkedKeys, extensionReady]);

  const handleStartExtensionAutoFill = () => {
    window.postMessage(
      {
        type: 'P2P_WEBAPP_START_SHOPPING',
        payload: { store: currentStore, autoAdd: true },
      },
      '*',
    );
    onNotify(`Opening ${storeConfig.name} with Trolley Assistant...`);
  };

  const handleCopyWhatsApp = async () => {
    if (selectedRecipes.length === 0) return;

    let text = `*P!nterest2Plate Weekly Shop*\n`;
    text += `Store: *${storeConfig.name}*\n`;
    text += `Meals: ${selectedRecipes.map((r) => r.title).join(', ')}\n\n`;

    for (const [aisle, items] of visibleAisles) {
      const needed = items.filter((i) => !checkedKeys.has(i.key));
      if (needed.length === 0) continue;
      text += `*${aisle.toUpperCase()}*\n`;
      for (const item of needed) {
        text += `- [ ] ${item.name} (${item.combinedQty})\n  ${storeConfig.getSearchUrl(item.ukSearchQuery)}\n`;
      }
      text += `\n`;
    }

    try {
      await navigator.clipboard.writeText(text.trim());
      onNotify(`Copied ${storeConfig.name} checklist for WhatsApp`);
    } catch {
      onNotify('Could not access clipboard — try Print List instead.');
    }
  };

  return (
    <>
      <div className="flex flex-col overflow-hidden rounded-3xl border border-[#E8E1D7] bg-white shadow-[0_14px_40px_-20px_rgba(28,25,23,0.16)]">
        {/* Header */}
        <div className="border-b border-[#EFE8DF] bg-[#FCFBF8] p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#D93B22]/10 text-[#D93B22]">
                <ShoppingBasket className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-serif text-lg font-semibold text-[#1C1917] leading-tight">
                  Weekly Basket
                </h2>
                <p className="text-xs text-[#6B645C]">
                  {selectedRecipes.length === 0
                    ? 'Select meals to consolidate'
                    : `${selectedRecipes.length} meal${selectedRecipes.length === 1 ? '' : 's'} · ${remainingToBuyCount} to buy`}
                </p>
              </div>
            </div>

            {basket.totalIngredients > 0 && (
              <span className="rounded-full bg-[#1C1917] px-3 py-1 text-xs font-bold text-white tabular-nums">
                {remainingToBuyCount} needed
              </span>
            )}
          </div>

          {/* Selected Meal Chips */}
          {selectedRecipes.length > 0 && (
            <div className="mt-3.5 flex flex-wrap gap-1.5">
              {selectedRecipes.map((r) => {
                const sv = servingsOverride[r.id] ?? r.servings;
                return (
                  <div
                    key={r.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[#E8E1D7] bg-white pl-1.5 pr-2 py-1 text-[11px] font-semibold text-[#1C1917]"
                  >
                    {r.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.imageUrl} alt="" className="h-4 w-4 rounded-full object-cover" />
                    )}
                    <button
                      type="button"
                      onClick={() => onOpenPlan(r)}
                      className="max-w-[135px] truncate hover:text-[#D93B22]"
                      title={`Open ${r.title}`}
                    >
                      {r.title}
                    </button>
                    {sv !== r.servings && (
                      <span className="rounded bg-[#FAF7F2] px-1 text-[10px] text-[#6B645C] tabular-nums">
                        {sv}p
                      </span>
                    )}
                    <button
                      type="button"
                      aria-label={`Remove ${r.title}`}
                      onClick={() => onRemoveRecipe(r.id)}
                      className="rounded-full p-0.5 text-[#8A8177] hover:bg-[#FAF7F2] hover:text-[#D93B22]"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* UK Supermarket Switcher (6 stores, 3x2 clean grid) */}
          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[#8A8177]">
              <span>UK Supermarket</span>
              {storeConfig.supportsBulkPaste && (
                <span className="text-[#5E2750]">1-Paste Quick Shop</span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {STORE_LIST.map((store) => {
                const active = store.key === currentStore;
                return (
                  <button
                    key={store.key}
                    type="button"
                    onClick={() => onSelectStore(store.key)}
                    className={`rounded-xl border px-2 py-2 text-[11px] font-bold transition-all ${
                      active
                        ? `${store.pillActiveClass} shadow-sm`
                        : 'border-[#E8E1D7] bg-white text-[#575049] hover:border-[#CFC3B4] hover:text-[#1C1917]'
                    }`}
                  >
                    {store.shortName}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Top Quick Actions (Always Visible Above the Ingredient List) */}
        <div className="no-print border-b border-[#EFE8DF] bg-[#FCFBF8] px-5 py-3 space-y-2">
          <button
            type="button"
            disabled={selectedRecipes.length === 0 || flatVisibleItems.length === 0}
            onClick={() => setShopAllOpen(true)}
            className={`w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed ${storeConfig.pillActiveClass}`}
          >
            <ShoppingCart className="h-4 w-4" />
            <span>
              Shop All ({remainingToBuyCount}) in {storeConfig.name}
            </span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={selectedRecipes.length === 0}
              onClick={handleCopyWhatsApp}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[#1C1917] px-3.5 py-2 text-xs font-bold text-white transition-all hover:bg-[#332E2A] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Copy className="h-3.5 w-3.5" />
              <span>Copy for WhatsApp</span>
            </button>

            <button
              type="button"
              disabled={selectedRecipes.length === 0}
              onClick={() => window.print()}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#DED5C8] bg-white px-3.5 py-2 text-xs font-bold text-[#443E38] transition-colors hover:bg-[#FAF7F2] disabled:opacity-40 disabled:cursor-not-allowed"
              title="Print shopping list"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>Print</span>
            </button>
          </div>
        </div>

        {/* Pantry Filter Bar */}
        <div className="flex items-center justify-between border-b border-[#EFE8DF] bg-[#F5F8F4] px-5 py-2.5 text-xs">
          <label className="flex cursor-pointer items-center gap-2 font-medium text-[#2D6A4F] select-none">
            <input
              type="checkbox"
              checked={hidePantry}
              onChange={(e) => onToggleHidePantry(e.target.checked)}
              className="h-4 w-4 rounded border-[#2D6A4F]/40 accent-[#2D6A4F]"
            />
            <span>Hide pantry staples</span>
          </label>
          <span className="font-semibold text-[#2D6A4F]/80 tabular-nums">
            {basket.pantryCount} detected
          </span>
        </div>

        {/* Aisle List */}
        <div className="thin-scroll max-h-[520px] overflow-y-auto p-5 space-y-5">
          {selectedRecipes.length === 0 ? (
            <div className="py-12 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FAF7F2] text-[#A89E91]">
                <Sparkles className="h-6 w-6" />
              </div>
              <p className="font-serif text-base font-semibold text-[#1C1917]">
                Your basket is empty
              </p>
              <p className="mt-1 text-xs text-[#6B645C] max-w-[220px] mx-auto">
                Tap 2 or 3 dishes on the left and we&apos;ll merge quantities by UK supermarket aisle.
              </p>
            </div>
          ) : visibleAisles.length === 0 ? (
            <div className="py-10 text-center text-xs text-[#6B645C]">
              Every item is checked off or hidden as a pantry staple.
            </div>
          ) : (
            visibleAisles.map(([aisle, items]) => (
              <div key={aisle} className="space-y-2">
                <div className="flex items-center justify-between border-b border-[#F1EAE0] pb-1.5">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#6B645C]">
                    {aisle}
                  </h3>
                  <span className="text-[11px] font-semibold text-[#A89E91] tabular-nums">
                    {items.length}
                  </span>
                </div>

                <ul className="space-y-1.5">
                  {items.map((item) => {
                    const checked = checkedKeys.has(item.key);
                    return (
                      <li
                        key={item.key}
                        className={`flex items-center justify-between gap-2.5 rounded-xl border px-3 py-2.5 transition-all ${
                          checked
                            ? 'border-[#EFE8DF] bg-[#FAF7F2]/70 opacity-60'
                            : 'border-[#EFE8DF] bg-white hover:border-[#D9CEBE]'
                        }`}
                      >
                        <div className="flex items-start gap-2.5 min-w-0 flex-1">
                          <button
                            type="button"
                            aria-label={`Mark ${item.name} as ${checked ? 'needed' : 'already have'}`}
                            onClick={() => onToggleItemChecked(item.key)}
                            className={`mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                              checked
                                ? 'border-[#2D6A4F] bg-[#2D6A4F] text-white'
                                : 'border-[#CFC3B4] bg-white hover:border-[#2D6A4F]'
                            }`}
                          >
                            {checked && <Check className="h-3 w-3 stroke-[3]" />}
                          </button>

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span
                                className={`text-[13px] font-semibold leading-tight ${
                                  checked ? 'line-through text-[#8A8177]' : 'text-[#1C1917]'
                                }`}
                              >
                                {item.name}
                              </span>
                              <span className="rounded-md bg-[#FAF7F2] px-1.5 py-0.5 text-[11px] font-bold text-[#443E38] tabular-nums">
                                {item.combinedQty}
                              </span>
                              {item.isPantry && (
                                <span className="rounded-md bg-[#EBF3EC] px-1.5 py-0.5 text-[10px] font-semibold text-[#2D6A4F]">
                                  Pantry
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 truncate text-[11px] text-[#8A8177]">
                              {item.fromRecipes.join(' · ')}
                            </p>
                          </div>
                        </div>

                        <a
                          href={storeConfig.getSearchUrl(item.ukSearchQuery)}
                          target="p2p_supermarket_tab"
                          rel="noopener noreferrer"
                          className={`inline-flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition-colors ${storeConfig.linkClass}`}
                          title={`Search "${item.ukSearchQuery}" on ${storeConfig.name}`}
                        >
                          <span>{storeConfig.shortName}</span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>
      </div>

      <ShopAllModal
        open={shopAllOpen}
        store={storeConfig}
        items={flatVisibleItems}
        checkedKeys={checkedKeys}
        extensionReady={extensionReady}
        onToggleChecked={onToggleItemChecked}
        onStartExtensionAutoFill={handleStartExtensionAutoFill}
        onClose={() => setShopAllOpen(false)}
        onNotify={onNotify}
      />
    </>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  ChefHat,
  ChevronDown,
  Clock,
  Dices,
  Film,
  FilterX,
  Loader2,
  Plus,
  Search,
  ShoppingBasket,
  Sparkles,
  Square,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import { BasketPanel } from './BasketPanel';
import { ImportModal, type DiscoverSummary, type ExtractionProgressItem } from './ImportModal';
import { KitchenTimerBar, type ActiveTimer } from './KitchenTimerBar';
import { ExtractingPinCard, RecipeCard } from './RecipeCard';
import { RecipePlanModal } from './RecipePlanModal';
import { consolidateBasket } from '@/lib/consolidate';
import { FOOD_TABS } from '@/lib/foodTags';
import { STORES } from '@/lib/stores';
import { RECIPE_CATEGORIES, type Board, type RawPin, type Recipe, type SupermarketKey } from '@/lib/types';

interface RuntimeStatus {
  geminiConfigured: boolean;
  pinterestOAuthConfigured: boolean;
  pinterestConnected: boolean;
  storageMode: 'postgres' | 'local-json';
}

interface MealPlannerAppProps {
  initialBoards: Board[];
  initialRecipes: Recipe[];
}

const LS_SELECTED = 'p2p_v2_selected';
const LS_PANTRY_CHECKED = 'p2p_v2_pantry_checked';
const LS_STORE = 'p2p_v2_store';
const LS_LOCAL_RECIPES = 'p2p_v2_imported_recipes';
const LS_LOCAL_BOARDS = 'p2p_v2_imported_boards';
const LS_MADE_IT = 'p2p_v2_made_it';

export function MealPlannerApp({ initialBoards, initialRecipes }: MealPlannerAppProps) {
  const [boards, setBoards] = useState<Board[]>(initialBoards);
  const [recipes, setRecipes] = useState<Recipe[]>(initialRecipes);
  const [activeBoardId, setActiveBoardId] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>(['sliders', 'crispy_salmon_bites', 'fondant_leeks']);
  const [servingsOverride, setServingsOverride] = useState<Record<string, number>>({});
  const [currentStore, setCurrentStore] = useState<SupermarketKey>('tesco');
  const [hidePantry, setHidePantry] = useState(false);
  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(new Set());
  const [madeItIds, setMadeItIds] = useState<Set<string>>(new Set());

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [activeFoodTab, setActiveFoodTab] = useState<string>('all');
  const [mediaFilter, setMediaFilter] = useState<'all' | 'video' | 'quick'>('all');
  const [cookedFilter, setCookedFilter] = useState<'all' | 'to_try' | 'made'>('all');

  // Modals & drawers
  const [activeRecipeId, setActiveRecipeId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importInitialUrl, setImportInitialUrl] = useState<string | undefined>(undefined);
  const [skippedDrawerOpen, setSkippedDrawerOpen] = useState(false);
  const [mobileBasketOpen, setMobileBasketOpen] = useState(false);
  const [boardMenuOpen, setBoardMenuOpen] = useState(false);

  // Extraction state + AbortController for Cancel Import
  const [progressItems, setProgressItems] = useState<ExtractionProgressItem[]>([]);
  const [discoverSummary, setDiscoverSummary] = useState<DiscoverSummary | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extensionReady, setExtensionReady] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus>({
    geminiConfigured: true,
    pinterestOAuthConfigured: false,
    pinterestConnected: false,
    storageMode: 'local-json',
  });

  // Active timers & toast
  const [timers, setTimers] = useState<ActiveTimer[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast((prev) => (prev === msg ? null : prev));
    }, 3400);
  }, []);

  // Hydrate persisted client preferences + any client-cached imported recipes
  useEffect(() => {
    try {
      const savedSelected = JSON.parse(localStorage.getItem(LS_SELECTED) || 'null');
      if (Array.isArray(savedSelected)) setSelectedIds(savedSelected);

      const savedChecked = JSON.parse(localStorage.getItem(LS_PANTRY_CHECKED) || 'null');
      if (Array.isArray(savedChecked)) setCheckedKeys(new Set(savedChecked));

      const savedMadeIt = JSON.parse(localStorage.getItem(LS_MADE_IT) || 'null');
      if (Array.isArray(savedMadeIt)) setMadeItIds(new Set(savedMadeIt));

      const savedStore = localStorage.getItem(LS_STORE) as SupermarketKey | null;
      if (savedStore) setCurrentStore(savedStore);

      const cachedLocalRecipes = JSON.parse(localStorage.getItem(LS_LOCAL_RECIPES) || '[]') as Recipe[];
      if (Array.isArray(cachedLocalRecipes) && cachedLocalRecipes.length > 0) {
        setRecipes((prev) => {
          const map = new Map(prev.map((r) => [r.id, r]));
          for (const r of cachedLocalRecipes) {
            if (!map.has(r.id)) map.set(r.id, r);
          }
          return Array.from(map.values());
        });
      }

      const cachedLocalBoards = JSON.parse(localStorage.getItem(LS_LOCAL_BOARDS) || '[]') as Board[];
      if (Array.isArray(cachedLocalBoards) && cachedLocalBoards.length > 0) {
        setBoards((prev) => {
          const map = new Map(prev.map((b) => [b.id, b]));
          for (const b of cachedLocalBoards) {
            if (!map.has(b.id)) map.set(b.id, b);
          }
          return Array.from(map.values());
        });
      }
    } catch {
      // ignore storage errors
    }

    fetch('/api/status')
      .then((r) => r.json())
      .then((d: RuntimeStatus) => setRuntimeStatus(d))
      .catch(() => {});

    // Handle Bookmarklet (?import=... or ?importBatch=...) and Pinterest OAuth (?pinterest=connected)
    const params = new URLSearchParams(window.location.search);
    const importBatchParam = params.get('importBatch');
    const importUrlParam = params.get('import');
    if (importBatchParam) {
      setImportInitialUrl(importBatchParam);
      setImportOpen(true);
      notify('Loaded scrolled pins from your Pinterest board — click Add New Pins!');
      window.history.replaceState({}, '', '/');
    } else if (importUrlParam) {
      setImportInitialUrl(importUrlParam);
      setImportOpen(true);
      window.history.replaceState({}, '', '/');
    }
    const pinterestParam = params.get('pinterest');
    if (pinterestParam === 'connected') {
      setImportOpen(true);
      notify('Connected to your Pinterest account!');
      window.history.replaceState({}, '', '/');
    } else if (pinterestParam === 'error') {
      notify(`Pinterest auth notice: ${params.get('reason') || 'cancelled'}`);
      window.history.replaceState({}, '', '/');
    }
  }, [notify]);

  const persistLocalCache = useCallback((nextRecipes: Recipe[], nextBoards: Board[]) => {
    try {
      const importedOnly = nextRecipes.filter((r) => r.sourceType !== 'curated');
      localStorage.setItem(LS_LOCAL_RECIPES, JSON.stringify(importedOnly.slice(0, 150)));
      const customBoards = nextBoards.filter((b) => b.source !== 'curated');
      localStorage.setItem(LS_LOCAL_BOARDS, JSON.stringify(customBoards));
    } catch {
      // ignore quota errors
    }
  }, []);

  const mergeRecipeIntoState = useCallback(
    (incoming: Recipe) => {
      setRecipes((prev) => {
        const idx = prev.findIndex((r) => r.id === incoming.id);
        const next = idx >= 0 ? prev.map((r, i) => (i === idx ? incoming : r)) : [incoming, ...prev];
        persistLocalCache(next, boards);
        return next;
      });
    },
    [boards, persistLocalCache],
  );

  const toggleSelectRecipe = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const exists = prev.includes(id);
      const next = exists ? prev.filter((x) => x !== id) : [...prev, id];
      localStorage.setItem(LS_SELECTED, JSON.stringify(next));
      return next;
    });
  }, []);

  const toggleMadeIt = useCallback(
    (id: string) => {
      setMadeItIds((prev) => {
        const next = new Set(prev);
        const wasMade = next.has(id);
        if (wasMade) next.delete(id);
        else next.add(id);
        localStorage.setItem(LS_MADE_IT, JSON.stringify(Array.from(next)));
        notify(wasMade ? 'Moved back to To Try' : 'Marked as Made It!');
        return next;
      });
    },
    [notify],
  );

  const markMadeIt = useCallback(
    (id: string) => {
      setMadeItIds((prev) => {
        if (prev.has(id)) return prev;
        const next = new Set(prev);
        next.add(id);
        localStorage.setItem(LS_MADE_IT, JSON.stringify(Array.from(next)));
        notify('Nice cooking! Marked as Made It');
        return next;
      });
    },
    [notify],
  );

  const handleToggleItemChecked = useCallback((key: string) => {
    setCheckedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      localStorage.setItem(LS_PANTRY_CHECKED, JSON.stringify(Array.from(next)));
      return next;
    });
  }, []);

  const handleSelectStore = useCallback((store: SupermarketKey) => {
    setCurrentStore(store);
    localStorage.setItem(LS_STORE, store);
  }, []);

  const handleStartTimer = useCallback(
    (label: string, recipeTitle: string, minutes: number) => {
      const totalSeconds = Math.max(10, Math.round(minutes * 60));
      setTimers((prev) => [
        ...prev,
        {
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          label,
          recipeTitle,
          totalSeconds,
          remainingSeconds: totalSeconds,
          running: true,
          finished: false,
        },
      ]);
      notify(`Started ${minutes}m timer: ${label}`);
    },
    [notify],
  );

  const handleCancelImport = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setExtracting(false);
    setProgressItems((prev) =>
      prev.map((item) =>
        item.state === 'queued' || item.state === 'extracting'
          ? { ...item, state: 'cancelled' }
          : item,
      ),
    );
    notify('Import cancelled — already-extracted recipes were kept.');
  }, [notify]);

  // Batch extraction runner with AbortController cancel support
  const runBatchExtraction = useCallback(
    async (
      board: Board,
      cachedRecipes: Recipe[],
      pendingPins: RawPin[],
      skipEnrich = false,
      controller?: AbortController,
    ) => {
      setBoards((prev) => {
        const idx = prev.findIndex((b) => b.id === board.id);
        const next = idx >= 0 ? prev.map((b, i) => (i === idx ? board : b)) : [board, ...prev];
        persistLocalCache(recipes, next);
        return next;
      });

      if (cachedRecipes.length > 0) {
        for (const r of cachedRecipes) mergeRecipeIntoState(r);
      }

      if (pendingPins.length === 0) {
        setActiveBoardId(board.id);
        setExtracting(false);
        notify(`No unimported pins left in this batch (${cachedRecipes.length} already in library)`);
        return;
      }

      setActiveBoardId(board.id);
      setExtracting(true);
      setProgressItems(pendingPins.map((pin) => ({ pin, state: 'queued' })));

      const activeController = controller || new AbortController();
      abortControllerRef.current = activeController;

      const queue = [...pendingPins];
      let readyCount = 0;
      let skippedCount = 0;
      let missingKeyHit = false;

      const worker = async () => {
        while (queue.length > 0 && !missingKeyHit && !activeController.signal.aborted) {
          const pin = queue.shift();
          if (!pin) break;

          setProgressItems((prev) =>
            prev.map((item) =>
              item.pin.pinId === pin.pinId ? { ...item, state: 'extracting' } : item,
            ),
          );

          try {
            const res = await fetch('/api/pins/extract', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ pin, skipEnrich }),
              signal: activeController.signal,
            });
            const data = await res.json();

            if (!res.ok) {
              if (data.code === 'MISSING_GEMINI_KEY') {
                missingKeyHit = true;
                setRuntimeStatus((s) => ({ ...s, geminiConfigured: false }));
              }
              throw new Error(data.error || `HTTP ${res.status}`);
            }

            const recipe = data.recipe as Recipe;
            mergeRecipeIntoState(recipe);

            if (recipe.status === 'skipped_non_recipe') {
              skippedCount++;
              setProgressItems((prev) =>
                prev.map((item) =>
                  item.pin.pinId === pin.pinId
                    ? { ...item, state: 'skipped', recipeTitle: recipe.title, sourceType: recipe.sourceType }
                    : item,
                ),
              );
            } else {
              readyCount++;
              setProgressItems((prev) =>
                prev.map((item) =>
                  item.pin.pinId === pin.pinId
                    ? { ...item, state: 'ready', recipeTitle: recipe.title, sourceType: recipe.sourceType }
                    : item,
                ),
              );
            }
          } catch (err) {
            if (activeController.signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
              setProgressItems((prev) =>
                prev.map((item) =>
                  item.pin.pinId === pin.pinId ? { ...item, state: 'cancelled' } : item,
                ),
              );
              break;
            }
            const msg = err instanceof Error ? err.message : 'Extraction failed';
            setProgressItems((prev) =>
              prev.map((item) =>
                item.pin.pinId === pin.pinId ? { ...item, state: 'error', error: msg } : item,
              ),
            );
          }
        }
      };

      await Promise.all([worker(), worker()]);

      if (!activeController.signal.aborted) {
        abortControllerRef.current = null;
        setExtracting(false);
        if (missingKeyHit) {
          notify('Add GEMINI_API_KEY to extract video & image pins.');
        } else {
          notify(
            `Added ${readyCount} new recipe${readyCount === 1 ? '' : 's'}${
              skippedCount > 0 ? ` (${skippedCount} non-recipe skipped)` : ''
            }`,
          );
        }
      }
    },
    [mergeRecipeIntoState, notify, persistLocalCache, recipes],
  );

  const handleStartPublicImport = useCallback(
    async (url: string, maxPins: number, samplingMode: 'latest' | 'diverse') => {
      const controller = new AbortController();
      abortControllerRef.current = controller;
      setExtracting(true);
      setProgressItems([]);
      setDiscoverSummary(null);

      try {
        const excludeIds = recipes.map((r) => r.id);
        const res = await fetch('/api/boards/discover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, maxPins, samplingMode, excludeIds }),
          signal: controller.signal,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not discover board pins');

        setDiscoverSummary({
          totalBoardPins: data.totalBoardPins ?? data.totalDiscovered ?? 0,
          totalDiscovered: data.totalDiscovered ?? 0,
          cappedByPublicFeed: Boolean(data.cappedByPublicFeed),
          unimportedAvailable: data.unimportedAvailable ?? 0,
        });

        await runBatchExtraction(
          data.board,
          data.cachedRecipes || [],
          data.pendingPins || [],
          false,
          controller,
        );
      } catch (err) {
        if (controller.signal.aborted) return;
        setExtracting(false);
        notify(err instanceof Error ? err.message : 'Import failed');
      }
    },
    [notify, recipes, runBatchExtraction],
  );

  const handleStartOAuthImport = useCallback(
    async (board: Board, maxPins: number, samplingMode: 'latest' | 'diverse') => {
      const controller = new AbortController();
      abortControllerRef.current = controller;
      setExtracting(true);
      setProgressItems([]);
      setDiscoverSummary(null);

      try {
        const excludeIds = recipes.map((r) => r.id);
        const res = await fetch('/api/boards/discover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            oauthBoardId: board.id,
            boardName: board.name,
            maxPins,
            samplingMode,
            excludeIds,
          }),
          signal: controller.signal,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not sync Pinterest board');

        setDiscoverSummary({
          totalBoardPins: data.totalBoardPins ?? data.totalDiscovered ?? 0,
          totalDiscovered: data.totalDiscovered ?? 0,
          cappedByPublicFeed: false,
          unimportedAvailable: data.unimportedAvailable ?? 0,
        });

        await runBatchExtraction(
          data.board,
          data.cachedRecipes || [],
          data.pendingPins || [],
          true,
          controller,
        );
      } catch (err) {
        if (controller.signal.aborted) return;
        setExtracting(false);
        notify(err instanceof Error ? err.message : 'OAuth board import failed');
      }
    },
    [notify, recipes, runBatchExtraction],
  );

  // Listen for Chrome Extension presence & incoming auto-scrolled Pinterest pin batches
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window || !event.data || !event.data.type) return;

      if (event.data.type === 'P2P_EXTENSION_READY') {
        setExtensionReady(true);
        return;
      }

      if (event.data.type === 'P2P_EXTENSION_IMPORT_PINS') {
        const payload = event.data.payload as {
          pins?: Array<{
            pinId: string;
            pinUrl: string;
            imageUrl: string;
            title: string;
            description: string;
            mediaType?: 'video' | 'image';
            videoUrl?: string;
          }>;
          boardName?: string;
        };
        const incoming = payload?.pins || [];
        if (incoming.length === 0) return;

        const boardName = payload.boardName || 'Pinterest Extension Import';
        const boardId = `ext_${boardName.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 32)}`;
        const board: Board = {
          id: boardId,
          name: boardName,
          handle: `${incoming.length} diverse pins (Extension)`,
          url: incoming[0].pinUrl,
          source: 'public',
          pinCount: incoming.length,
          lastSyncedAt: new Date().toISOString(),
        };

        const existingIds = new Set(recipes.map((r) => r.id));
        const pendingPins: RawPin[] = [];
        for (const p of incoming) {
          const canonicalId = p.pinId.startsWith('pin_') ? p.pinId : `pin_${p.pinId}`;
          if (existingIds.has(canonicalId)) continue;
          pendingPins.push({
            pinId: p.pinId,
            boardId,
            title: p.title || 'Pinterest Recipe Pin',
            description: p.description || '',
            pinUrl: p.pinUrl,
            mediaType: p.videoUrl || p.mediaType === 'video' ? 'video' : 'image',
            imageUrl: p.imageUrl || '',
            videoUrl: p.videoUrl,
            creator: 'Pinterest Saved',
          });
        }

        setImportOpen(true);
        notify(`Received ${incoming.length} pins from Chrome Extension — extracting ${pendingPins.length} new...`);
        const controller = new AbortController();
        abortControllerRef.current = controller;
        runBatchExtraction(board, [], pendingPins, false, controller);
      }
    };

    window.addEventListener('message', onMessage);
    window.postMessage({ type: 'P2P_WEBAPP_PING' }, '*');
    return () => window.removeEventListener('message', onMessage);
  }, [notify, recipes, runBatchExtraction]);

  const handleForceExtractSkipped = useCallback(
    async (skippedRecipe: Recipe) => {
      notify(`Extracting "${skippedRecipe.title}"...`);
      try {
        const pin: RawPin = {
          pinId: skippedRecipe.id.replace(/^pin_/, ''),
          boardId: skippedRecipe.boardId,
          title: skippedRecipe.title,
          description: skippedRecipe.rawCaption || '',
          pinUrl: skippedRecipe.sourcePinUrl,
          outboundUrl: skippedRecipe.outboundUrl,
          mediaType: skippedRecipe.sourceType === 'video' ? 'video' : 'image',
          imageUrl: skippedRecipe.imageUrl,
          videoUrl: skippedRecipe.videoUrl,
          creator: skippedRecipe.creator,
        };
        const res = await fetch('/api/pins/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin, forceExtract: true }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to extract');
        mergeRecipeIntoState(data.recipe);
        notify(`Added "${data.recipe.title}" to your meal planner`);
      } catch (err) {
        notify(err instanceof Error ? err.message : 'Could not force extract pin');
      }
    },
    [mergeRecipeIntoState, notify],
  );

  const handleSaveRecipeEdits = useCallback(
    async (updated: Recipe) => {
      const res = await fetch(`/api/recipes/${encodeURIComponent(updated.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      const data = await res.json();
      mergeRecipeIntoState(res.ok && data.recipe ? data.recipe : updated);
      notify('Saved recipe changes');
    },
    [mergeRecipeIntoState, notify],
  );

  // Scoped recipes (by board)
  const boardScopedRecipes = useMemo(() => {
    if (activeBoardId === 'all') return recipes;
    return recipes.filter((r) => r.boardId === activeBoardId);
  }, [recipes, activeBoardId]);

  const readyRecipes = useMemo(
    () => boardScopedRecipes.filter((r) => r.status === 'ready'),
    [boardScopedRecipes],
  );

  const skippedRecipes = useMemo(
    () => boardScopedRecipes.filter((r) => r.status === 'skipped_non_recipe'),
    [boardScopedRecipes],
  );

  const madeCount = useMemo(
    () => readyRecipes.filter((r) => madeItIds.has(r.id)).length,
    [readyRecipes, madeItIds],
  );

  const toTryCount = readyRecipes.length - madeCount;

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: readyRecipes.length };
    for (const cat of RECIPE_CATEGORIES) {
      counts[cat] = readyRecipes.filter((r) => r.category === cat).length;
    }
    return counts;
  }, [readyRecipes]);

  const foodTabCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const tab of FOOD_TABS) {
      counts[tab.id] = readyRecipes.filter((r) => tab.matches(r)).length;
    }
    return counts;
  }, [readyRecipes]);

  const filteredRecipes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const activeFoodDef = activeFoodTab === 'all' ? null : FOOD_TABS.find((t) => t.id === activeFoodTab) || null;
    return readyRecipes.filter((r) => {
      if (activeCategory !== 'all' && r.category !== activeCategory) return false;
      if (activeFoodDef && !activeFoodDef.matches(r)) return false;
      if (mediaFilter === 'video' && r.sourceType !== 'video') return false;
      if (mediaFilter === 'quick' && r.prepMinutes + r.cookMinutes > 25) return false;
      if (cookedFilter === 'to_try' && madeItIds.has(r.id)) return false;
      if (cookedFilter === 'made' && !madeItIds.has(r.id)) return false;
      if (!q) return true;
      return (
        r.title.toLowerCase().includes(q) ||
        r.creator.toLowerCase().includes(q) ||
        r.summary.toLowerCase().includes(q) ||
        r.tags.some((t) => t.toLowerCase().includes(q)) ||
        r.ingredients.some((i) => i.name.toLowerCase().includes(q))
      );
    });
  }, [readyRecipes, activeCategory, activeFoodTab, mediaFilter, cookedFilter, madeItIds, searchQuery]);

  const printBasket = useMemo(
    () => consolidateBasket(recipes, selectedIds, servingsOverride),
    [recipes, selectedIds, servingsOverride],
  );

  const selectedRecipesForPrint = useMemo(() => {
    const idSet = new Set(selectedIds);
    return recipes.filter((r) => idSet.has(r.id) && r.status === 'ready');
  }, [recipes, selectedIds]);

  const activeBoardLabel = useMemo(() => {
    if (activeBoardId === 'all') return `All Boards (${boards.length})`;
    return boards.find((b) => b.id === activeBoardId)?.name || 'Selected Board';
  }, [activeBoardId, boards]);

  const activeRecipe = useMemo(
    () => recipes.find((r) => r.id === activeRecipeId) || null,
    [recipes, activeRecipeId],
  );

  const activeExtractingItems = useMemo(
    () => progressItems.filter((p) => p.state === 'extracting' || p.state === 'queued'),
    [progressItems],
  );

  const handlePickFive = () => {
    const TARGET_COUNT = 5;
    const basePool = filteredRecipes.length >= TARGET_COUNT ? filteredRecipes : readyRecipes;
    const untriedPool = basePool.filter((r) => !madeItIds.has(r.id));
    const pool = untriedPool.length >= TARGET_COUNT ? untriedPool : basePool;

    // Shuffle and prefer category diversity across the 5 picks
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    const picked: Recipe[] = [];
    const seenCats = new Set<string>();

    for (const r of shuffled) {
      if (picked.length >= TARGET_COUNT) break;
      if (!seenCats.has(r.category)) {
        picked.push(r);
        seenCats.add(r.category);
      }
    }
    for (const r of shuffled) {
      if (picked.length >= TARGET_COUNT) break;
      if (!picked.some((p) => p.id === r.id)) picked.push(r);
    }

    const nextIds = picked.map((r) => r.id);
    setSelectedIds(nextIds);
    localStorage.setItem(LS_SELECTED, JSON.stringify(nextIds));
    notify(
      untriedPool.length >= TARGET_COUNT
        ? `Picked ${nextIds.length} untried dishes for your week`
        : `Picked ${nextIds.length} balanced meals for your week`,
    );
  };

  const handleClearSelection = () => {
    setSelectedIds([]);
    localStorage.setItem(LS_SELECTED, JSON.stringify([]));
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Slim Sticky Editorial Header */}
      <header className="no-print sticky top-0 z-40 border-b border-[#E8E1D7] bg-[#FAF7F2]/92 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1380px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          {/* Brand + Board Switcher */}
          <div className="flex items-center gap-4 min-w-0">
            <div className="flex items-center gap-2.5 shrink-0">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#D93B22] text-white shadow-sm">
                <UtensilsCrossed className="h-5 w-5" />
              </div>
              <div className="leading-none">
                <span className="font-serif text-xl font-bold tracking-tight text-[#1C1917]">
                  P!nterest<span className="text-[#D93B22]">2</span>Plate
                </span>
                <p className="hidden sm:block text-[11px] text-[#8A8177] mt-0.5">
                  Pins to step-by-step plans &amp; UK baskets
                </p>
              </div>
            </div>

            <div className="hidden md:block h-6 w-px bg-[#E8E1D7]" />

            {/* Board Switcher Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setBoardMenuOpen((v) => !v)}
                className="inline-flex items-center gap-2 rounded-xl border border-[#E8E1D7] bg-white px-3 py-1.5 text-xs font-semibold text-[#1C1917] shadow-xs transition-colors hover:border-[#CFC3B4]"
              >
                <span className="h-2 w-2 shrink-0 rounded-full bg-[#2D6A4F]" />
                <span className="max-w-[100px] sm:max-w-[160px] truncate">{activeBoardLabel}</span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#8A8177]" />
              </button>

              {boardMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setBoardMenuOpen(false)}
                  />
                  <div className="absolute left-0 mt-2 z-40 w-64 overflow-hidden rounded-2xl border border-[#E8E1D7] bg-white p-1.5 shadow-xl">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveBoardId('all');
                        setBoardMenuOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-semibold ${
                        activeBoardId === 'all'
                          ? 'bg-[#FAF7F2] text-[#D93B22]'
                          : 'text-[#443E38] hover:bg-[#FAF7F2]'
                      }`}
                    >
                      <span>All Boards</span>
                      <span className="text-[11px] text-[#8A8177] tabular-nums">
                        {recipes.filter((r) => r.status === 'ready').length}
                      </span>
                    </button>
                    <div className="my-1 h-px bg-[#EFE8DF]" />
                    {boards.map((board) => (
                      <button
                        key={board.id}
                        type="button"
                        onClick={() => {
                          setActiveBoardId(board.id);
                          setBoardMenuOpen(false);
                        }}
                        className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-semibold ${
                          activeBoardId === board.id
                            ? 'bg-[#FAF7F2] text-[#D93B22]'
                            : 'text-[#443E38] hover:bg-[#FAF7F2]'
                        }`}
                      >
                        <div className="min-w-0 pr-2">
                          <p className="truncate">{board.name}</p>
                          {board.handle && (
                            <p className="truncate text-[10px] font-normal text-[#8A8177]">
                              {board.handle}
                            </p>
                          )}
                        </div>
                        <span className="shrink-0 text-[11px] text-[#8A8177] tabular-nums">
                          {recipes.filter((r) => r.boardId === board.id && r.status === 'ready').length}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {extracting && (
              <button
                type="button"
                onClick={handleCancelImport}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-100"
              >
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span className="hidden sm:inline">Cancel Import</span>
                <Square className="h-3 w-3 fill-current sm:hidden" />
              </button>
            )}

            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-[#D93B22] px-3 sm:px-3.5 py-2 text-xs font-bold text-white shadow-sm transition-all hover:bg-[#B82D17] active:scale-[0.98]"
            >
              <Plus className="h-4 w-4 shrink-0" />
              <span className="sm:hidden">Import</span>
              <span className="hidden sm:inline">Import Board / Pin</span>
            </button>

            <button
              type="button"
              onClick={() => setMobileBasketOpen(true)}
              className="lg:hidden inline-flex items-center gap-1.5 rounded-xl border border-[#DED5C8] bg-white px-3 py-2 text-xs font-bold text-[#1C1917]"
            >
              <ShoppingBasket className="h-4 w-4 text-[#D93B22]" />
              <span className="tabular-nums">{selectedIds.length}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Compact Editorial Intro + Controls Strip */}
      <main className="mx-auto grid w-full max-w-[1380px] flex-1 grid-cols-1 items-start gap-7 px-4 py-6 sm:px-6 lg:grid-cols-12 lg:px-8">
        {/* LEFT COLUMN: Catalog (8 cols) */}
        <section className="no-print lg:col-span-8 space-y-5">
          {/* Compact Top Heading + Quick Pick */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <h1 className="font-serif text-2xl sm:text-3xl font-semibold tracking-tight text-[#1C1917]">
                What&apos;s on the menu this week?
              </h1>
              <p className="mt-1 text-sm text-[#6B645C]">
                Pick your dishes to consolidate ingredients, tick off ones you&apos;ve made, or open any card to cook.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handlePickFive}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#1C1917] px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-all hover:bg-[#332E2A] active:scale-[0.98]"
              >
                <Dices className="h-4 w-4 text-[#F97316]" />
                {toTryCount >= 5 ? 'Pick 5 Untried' : 'Pick 5 for Me'}
              </button>
              {selectedIds.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearSelection}
                  className="rounded-xl border border-[#DED5C8] bg-white px-3.5 py-2.5 text-xs font-bold text-[#575049] hover:bg-[#FAF7F2]"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Search & Clean Filter Bar */}
          <div className="rounded-2xl border border-[#E8E1D7] bg-white p-3.5 shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row gap-2.5">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A89E91]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search dishes, ingredients (salmon, tofu, garlic), or creators..."
                  className="w-full rounded-xl border border-[#EFE8DF] bg-[#FCFBF8] py-2.5 pl-10 pr-9 text-sm text-[#1C1917] placeholder:text-[#A89E91] focus:border-[#D93B22] focus:bg-white focus:outline-none"
                />
                {searchQuery && (
                  <button
                    type="button"
                    aria-label="Clear search"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-[#8A8177] hover:bg-[#FAF7F2]"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Quick Filter Chips: To Try / Made It / Videos / Under 25m */}
              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setCookedFilter((v) => (v === 'to_try' ? 'all' : 'to_try'))}
                  className={`inline-flex items-center gap-1 rounded-xl border px-3 py-2 text-xs font-bold transition-colors ${
                    cookedFilter === 'to_try'
                      ? 'border-[#D93B22] bg-[#D93B22] text-white'
                      : 'border-[#EFE8DF] bg-[#FCFBF8] text-[#575049] hover:border-[#D4C7B7]'
                  }`}
                >
                  To Try ({toTryCount})
                </button>
                <button
                  type="button"
                  onClick={() => setCookedFilter((v) => (v === 'made' ? 'all' : 'made'))}
                  className={`inline-flex items-center gap-1 rounded-xl border px-3 py-2 text-xs font-bold transition-colors ${
                    cookedFilter === 'made'
                      ? 'border-[#2D6A4F] bg-[#2D6A4F] text-white'
                      : 'border-[#EFE8DF] bg-[#FCFBF8] text-[#575049] hover:border-[#D4C7B7]'
                  }`}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Made ({madeCount})
                </button>
                <button
                  type="button"
                  onClick={() => setMediaFilter((v) => (v === 'video' ? 'all' : 'video'))}
                  className={`inline-flex items-center gap-1 rounded-xl border px-3 py-2 text-xs font-bold transition-colors ${
                    mediaFilter === 'video'
                      ? 'border-[#1C1917] bg-[#1C1917] text-white'
                      : 'border-[#EFE8DF] bg-[#FCFBF8] text-[#575049] hover:border-[#D4C7B7]'
                  }`}
                >
                  <Film className="h-3.5 w-3.5" />
                  Videos
                </button>
                <button
                  type="button"
                  onClick={() => setMediaFilter((v) => (v === 'quick' ? 'all' : 'quick'))}
                  className={`inline-flex items-center gap-1 rounded-xl border px-3 py-2 text-xs font-bold transition-colors ${
                    mediaFilter === 'quick'
                      ? 'border-[#1C1917] bg-[#1C1917] text-white'
                      : 'border-[#EFE8DF] bg-[#FCFBF8] text-[#575049] hover:border-[#D4C7B7]'
                  }`}
                >
                  <Clock className="h-3.5 w-3.5" />
                  &lt;25m
                </button>
              </div>
            </div>

            {/* Category Pills */}
            <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto">
              <button
                type="button"
                onClick={() => setActiveCategory('all')}
                className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${
                  activeCategory === 'all'
                    ? 'bg-[#1C1917] text-white'
                    : 'bg-[#FAF7F2] text-[#575049] hover:bg-[#EFE8DF]'
                }`}
              >
                All Styles <span className="opacity-70 tabular-nums">({categoryCounts.all || 0})</span>
              </button>
              {RECIPE_CATEGORIES.map((cat) => {
                const count = categoryCounts[cat] || 0;
                if (count === 0 && activeCategory !== cat) return null;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setActiveCategory(cat)}
                    className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                      activeCategory === cat
                        ? 'bg-[#1C1917] text-white font-bold'
                        : 'bg-[#FAF7F2] text-[#575049] hover:bg-[#EFE8DF]'
                    }`}
                  >
                    {cat} <span className="opacity-70 tabular-nums">({count})</span>
                  </button>
                );
              })}
            </div>

            {/* Main Ingredient & Dish Type Tabs (Chicken, Beef, Seafood, Pasta, Rice, Veggie, Eggs) */}
            <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto border-t border-[#F4EFE7] pt-2.5">
              <button
                type="button"
                onClick={() => setActiveFoodTab('all')}
                className={`whitespace-nowrap rounded-full border px-3 py-1 text-[11px] font-bold transition-colors ${
                  activeFoodTab === 'all'
                    ? 'border-[#D93B22] bg-[#D93B22]/10 text-[#D93B22]'
                    : 'border-[#EFE8DF] bg-white text-[#6B645C] hover:border-[#D4C7B7]'
                }`}
              >
                All Ingredients
              </button>
              {FOOD_TABS.map((tab) => {
                const count = foodTabCounts[tab.id] || 0;
                if (count === 0 && activeFoodTab !== tab.id) return null;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveFoodTab((prev) => (prev === tab.id ? 'all' : tab.id))}
                    className={`whitespace-nowrap rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${
                      activeFoodTab === tab.id
                        ? 'border-[#D93B22] bg-[#D93B22] text-white font-bold'
                        : 'border-[#EFE8DF] bg-white text-[#575049] hover:border-[#D4C7B7]'
                    }`}
                  >
                    {tab.label} <span className="opacity-75 tabular-nums">({count})</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Results Summary Row */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-0.5 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-bold text-[#1C1917]">
                Showing {filteredRecipes.length} of {readyRecipes.length} recipes
              </span>
              {selectedIds.length > 0 && (
                <span className="rounded-full bg-[#D93B22]/12 px-2.5 py-0.5 font-bold text-[#D93B22] tabular-nums">
                  {selectedIds.length} selected
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              {skippedRecipes.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSkippedDrawerOpen(true)}
                  className="inline-flex items-center gap-1 font-semibold text-amber-700 hover:underline"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {skippedRecipes.length} non-recipe pin{skippedRecipes.length === 1 ? '' : 's'} filtered out
                </button>
              )}
              <span className="hidden sm:inline text-[#8A8177]">
                Tap a card to select · Tick &ldquo;Made it&rdquo; once cooked
              </span>
            </div>
          </div>

          {/* Recipe Grid */}
          {filteredRecipes.length === 0 && activeExtractingItems.length === 0 ? (
            <div className="rounded-3xl border border-[#E8E1D7] bg-white px-6 py-14 text-center">
              <FilterX className="mx-auto h-9 w-9 text-[#A89E91]" />
              <p className="mt-3 font-serif text-lg font-semibold text-[#1C1917]">
                No matching recipes
              </p>
              <p className="mt-1 text-xs text-[#6B645C]">
                Try clearing a filter, or import more pins from your Pinterest board.
              </p>
              <div className="mt-4 flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setActiveCategory('all');
                    setActiveFoodTab('all');
                    setMediaFilter('all');
                    setCookedFilter('all');
                  }}
                  className="rounded-xl border border-[#DED5C8] bg-white px-4 py-2 text-xs font-bold text-[#1C1917] hover:bg-[#FAF7F2]"
                >
                  Reset Filters
                </button>
                <button
                  type="button"
                  onClick={() => setImportOpen(true)}
                  className="rounded-xl bg-[#D93B22] px-4 py-2 text-xs font-bold text-white hover:bg-[#B82D17]"
                >
                  Import Pinterest Board
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              {activeExtractingItems.slice(0, 4).map((item) => (
                <ExtractingPinCard
                  key={item.pin.pinId}
                  pin={item.pin}
                  statusLabel={
                    item.state === 'extracting' ? 'Reading with Gemini...' : 'Queued for extraction'
                  }
                />
              ))}

              {filteredRecipes.map((recipe) => (
                <RecipeCard
                  key={recipe.id}
                  recipe={recipe}
                  selected={selectedIds.includes(recipe.id)}
                  madeIt={madeItIds.has(recipe.id)}
                  onToggleSelect={toggleSelectRecipe}
                  onToggleMadeIt={toggleMadeIt}
                  onOpenPlan={(r) => setActiveRecipeId(r.id)}
                />
              ))}
            </div>
          )}
        </section>

        {/* RIGHT COLUMN: Sticky Consolidated Basket (4 cols) */}
        <aside className="no-print hidden lg:block lg:col-span-4 lg:sticky lg:top-20">
          <BasketPanel
            recipes={recipes}
            selectedIds={selectedIds}
            servingsOverride={servingsOverride}
            currentStore={currentStore}
            hidePantry={hidePantry}
            checkedKeys={checkedKeys}
            extensionReady={extensionReady}
            onSelectStore={handleSelectStore}
            onToggleHidePantry={setHidePantry}
            onToggleItemChecked={handleToggleItemChecked}
            onRemoveRecipe={toggleSelectRecipe}
            onOpenPlan={(r) => setActiveRecipeId(r.id)}
            onNotify={notify}
          />
        </aside>
      </main>

      {/* Mobile Basket Slide-Up Sheet */}
      {mobileBasketOpen && (
        <div
          className="no-print fixed inset-0 z-50 flex items-end bg-[#1C1917]/60 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileBasketOpen(false)}
        >
          <div
            className="max-h-[88vh] w-full overflow-y-auto rounded-t-3xl bg-[#FAF7F2] p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between px-1">
              <span className="font-serif text-lg font-semibold text-[#1C1917]">
                Your Shopping Basket
              </span>
              <button
                type="button"
                onClick={() => setMobileBasketOpen(false)}
                className="rounded-xl bg-white p-1.5 text-[#6B645C] border border-[#E8E1D7]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <BasketPanel
              recipes={recipes}
              selectedIds={selectedIds}
              servingsOverride={servingsOverride}
              currentStore={currentStore}
              hidePantry={hidePantry}
              checkedKeys={checkedKeys}
              extensionReady={extensionReady}
              onSelectStore={handleSelectStore}
              onToggleHidePantry={setHidePantry}
              onToggleItemChecked={handleToggleItemChecked}
              onRemoveRecipe={toggleSelectRecipe}
              onOpenPlan={(r) => {
                setMobileBasketOpen(false);
                setActiveRecipeId(r.id);
              }}
              onNotify={notify}
            />
          </div>
        </div>
      )}

      {/* Skipped Non-Recipe Pins Drawer */}
      {skippedDrawerOpen && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-[#1C1917]/50 backdrop-blur-sm"
          onClick={() => setSkippedDrawerOpen(false)}
        >
          <div
            className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#EFE8DF] px-5 py-4">
              <div>
                <h2 className="font-serif text-lg font-semibold text-[#1C1917]">
                  Filtered Non-Recipe Pins
                </h2>
                <p className="text-xs text-[#6B645C]">
                  Infographics, storage charts, or tips automatically kept out of your meal grid.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSkippedDrawerOpen(false)}
                className="rounded-xl p-1.5 text-[#8A8177] hover:bg-[#FAF7F2]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="thin-scroll flex-1 overflow-y-auto p-5 space-y-3">
              {skippedRecipes.map((r) => (
                <div
                  key={r.id}
                  className="flex items-start gap-3 rounded-2xl border border-[#EFE8DF] bg-[#FCFBF8] p-3"
                >
                  {r.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.imageUrl} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-[#1C1917] line-clamp-2">{r.title}</p>
                    <p className="mt-0.5 text-[11px] text-[#8A8177] line-clamp-2">{r.summary}</p>
                    <button
                      type="button"
                      onClick={() => handleForceExtractSkipped(r)}
                      className="mt-2 inline-flex items-center gap-1 rounded-lg bg-[#1C1917] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#D93B22]"
                    >
                      <BookOpen className="h-3 w-3" />
                      Extract Anyway
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Recipe Plan & Cook Mode Modal */}
      {activeRecipe && (
        <RecipePlanModal
          recipe={activeRecipe}
          servings={servingsOverride[activeRecipe.id] ?? activeRecipe.servings}
          selected={selectedIds.includes(activeRecipe.id)}
          madeIt={madeItIds.has(activeRecipe.id)}
          onClose={() => setActiveRecipeId(null)}
          onChangeServings={(id, nextServings) =>
            setServingsOverride((prev) => ({ ...prev, [id]: nextServings }))
          }
          onToggleSelect={toggleSelectRecipe}
          onToggleMadeIt={toggleMadeIt}
          onMarkMadeIt={markMadeIt}
          onStartTimer={handleStartTimer}
          onSaveEdits={handleSaveRecipeEdits}
          onReExtract={handleForceExtractSkipped}
        />
      )}

      {/* Import Board / Pin Modal */}
      <ImportModal
        open={importOpen}
        initialUrl={importInitialUrl}
        status={runtimeStatus}
        extensionReady={extensionReady}
        progressItems={progressItems}
        discoverSummary={discoverSummary}
        isRunning={extracting}
        onClose={() => setImportOpen(false)}
        onCancelImport={handleCancelImport}
        onStartPublicImport={handleStartPublicImport}
        onStartOAuthImport={handleStartOAuthImport}
        onDisconnectPinterest={async () => {
          await fetch('/api/pinterest/boards', { method: 'DELETE' });
          setRuntimeStatus((s) => ({ ...s, pinterestConnected: false }));
          notify('Disconnected Pinterest account');
        }}
      />

      {/* Floating Active Kitchen Timers */}
      <KitchenTimerBar timers={timers} onUpdateTimers={setTimers} />

      {/* Dedicated Ink-Friendly A4 Print Sheet (always prints cleanly regardless of viewport width) */}
      <section className="print-only p-2 text-[#111111]">
        <div className="border-b-2 border-[#111111] pb-3 mb-5 flex items-baseline justify-between">
          <div>
            <h1 className="font-serif text-2xl font-bold">P!nterest2Plate — Weekly Shopping List</h1>
            <p className="text-xs text-[#555555] mt-1">
              Store: <strong>{(STORES[currentStore] || STORES.tesco).name}</strong> ·{' '}
              {selectedRecipesForPrint.length} meal{selectedRecipesForPrint.length === 1 ? '' : 's'} ·{' '}
              {hidePantry ? 'Pantry staples hidden' : 'Including pantry staples'}
            </p>
          </div>
          <span className="text-xs text-[#555555]">
            {new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        </div>

        {selectedRecipesForPrint.length > 0 && (
          <div className="mb-5 rounded-xl border border-[#cccccc] p-3">
            <h2 className="text-xs font-bold uppercase tracking-wider mb-1.5">This Week&apos;s Meals</h2>
            <ul className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
              {selectedRecipesForPrint.map((r) => (
                <li key={r.id}>
                  • <strong>{r.title}</strong> ({servingsOverride[r.id] ?? r.servings} servings)
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-2 gap-6">
          {Object.entries(printBasket.aisles).map(([aisle, items]) => {
            const visible = items.filter((item) => {
              if (checkedKeys.has(item.key)) return false;
              if (hidePantry && item.isPantry) return false;
              return true;
            });
            if (visible.length === 0) return null;
            return (
              <div key={aisle} className="break-inside-avoid mb-4">
                <h3 className="border-b border-[#999999] pb-1 mb-2 text-xs font-bold uppercase tracking-wider">
                  {aisle} ({visible.length})
                </h3>
                <ul className="space-y-1.5 text-xs">
                  {visible.map((item) => (
                    <li key={item.key} className="flex items-start gap-2">
                      <span className="inline-block mt-0.5 h-3.5 w-3.5 shrink-0 border border-[#333333] rounded-[2px]" />
                      <div>
                        <span className="font-semibold">{item.name}</span>{' '}
                        <span className="font-bold">({item.combinedQty})</span>
                        <div className="text-[10px] text-[#666666]">{item.fromRecipes.join(', ')}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      {/* Toast Notification */}
      {toast && (
        <div className="no-print fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-2xl bg-[#1C1917] px-4 py-3 text-xs font-semibold text-white shadow-xl">
          <ChefHat className="h-4 w-4 text-[#F97316]" />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}

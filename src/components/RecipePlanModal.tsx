'use client';

import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChefHat,
  Clock,
  ExternalLink,
  Film,
  Flame,
  Lightbulb,
  Minus,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Save,
  Timer,
  Users,
  X,
} from 'lucide-react';
import { formatScaledIngredientQty } from '@/lib/consolidate';
import type { Recipe } from '@/lib/types';

interface RecipePlanModalProps {
  recipe: Recipe;
  servings: number;
  selected: boolean;
  madeIt: boolean;
  onClose: () => void;
  onChangeServings: (recipeId: string, nextServings: number) => void;
  onToggleSelect: (recipeId: string) => void;
  onToggleMadeIt: (recipeId: string) => void;
  onMarkMadeIt: (recipeId: string) => void;
  onStartTimer: (label: string, recipeTitle: string, minutes: number) => void;
  onSaveEdits: (updated: Recipe) => Promise<void>;
  onReExtract: (recipe: Recipe) => Promise<void>;
}

export function RecipePlanModal({
  recipe,
  servings,
  selected,
  madeIt,
  onClose,
  onChangeServings,
  onToggleSelect,
  onToggleMadeIt,
  onMarkMadeIt,
  onStartTimer,
  onSaveEdits,
  onReExtract,
}: RecipePlanModalProps) {
  const [checkedIngredients, setCheckedIngredients] = useState<Set<number>>(new Set());
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [cookMode, setCookMode] = useState(false);
  const [cookStepIdx, setCookStepIdx] = useState(0);
  const [showIngredientsPeek, setShowIngredientsPeek] = useState(false);

  // Edit mode state
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reExtracting, setReExtracting] = useState(false);
  const [draftTitle, setDraftTitle] = useState(recipe.title);
  const [draftSummary, setDraftSummary] = useState(recipe.summary);
  const [draftStepsText, setDraftStepsText] = useState(
    recipe.steps.map((s) => `${s.title} :: ${s.instruction}`).join('\n'),
  );

  const scale = recipe.servings > 0 ? servings / recipe.servings : 1;
  const totalMins = (recipe.prepMinutes || 0) + (recipe.cookMinutes || 0);

  // Escape & arrow keyboard controls
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (cookMode) setCookMode(false);
        else onClose();
      } else if (cookMode && e.key === 'ArrowRight') {
        setCookStepIdx((i) => Math.min(recipe.steps.length - 1, i + 1));
      } else if (cookMode && e.key === 'ArrowLeft') {
        setCookStepIdx((i) => Math.max(0, i - 1));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [cookMode, onClose, recipe.steps.length]);

  // Keep screen awake while in Cook Mode
  useEffect(() => {
    if (!cookMode) return;
    let wakeLock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> };
    };
    nav.wakeLock?.request('screen').then((lock) => {
      wakeLock = lock;
    }).catch(() => {});
    return () => {
      wakeLock?.release().catch(() => {});
    };
  }, [cookMode]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const parsedSteps = draftStepsText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((line, idx) => {
          const [rawTitle, ...rest] = line.split('::');
          const hasSplit = rest.length > 0;
          const prev = recipe.steps[idx];
          return {
            stepNumber: idx + 1,
            title: hasSplit ? rawTitle.trim() : prev?.title || `Step ${idx + 1}`,
            instruction: hasSplit ? rest.join('::').trim() : line,
            durationMinutes: prev?.durationMinutes ?? null,
            temperature: prev?.temperature ?? null,
            videoTimestamp: prev?.videoTimestamp ?? null,
            tip: prev?.tip ?? null,
          };
        });

      await onSaveEdits({
        ...recipe,
        title: draftTitle.trim() || recipe.title,
        summary: draftSummary.trim(),
        steps: parsedSteps.length > 0 ? parsedSteps : recipe.steps,
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleReExtractClick = async () => {
    setReExtracting(true);
    try {
      await onReExtract(recipe);
    } finally {
      setReExtracting(false);
    }
  };

  // Full-Screen Distraction-Free Cook Mode
  if (cookMode && recipe.steps.length > 0) {
    const step = recipe.steps[Math.min(cookStepIdx, recipe.steps.length - 1)];
    const progressPct = ((cookStepIdx + 1) / recipe.steps.length) * 100;

    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-[#1C1917] text-[#FAF7F2]">
        {/* Top Bar */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <ChefHat className="h-5 w-5 text-[#F97316] shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-white/60">
                Cook Mode · Step {cookStepIdx + 1} of {recipe.steps.length}
              </p>
              <h2 className="truncate font-serif text-lg font-semibold">{recipe.title}</h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowIngredientsPeek((v) => !v)}
              className="rounded-xl border border-white/15 bg-white/10 px-3.5 py-2 text-xs font-semibold hover:bg-white/20"
            >
              {showIngredientsPeek ? 'Hide Ingredients' : `Ingredients (${recipe.ingredients.length})`}
            </button>
            <button
              type="button"
              onClick={() => setCookMode(false)}
              className="rounded-xl border border-white/15 bg-white/10 p-2 hover:bg-white/20"
              aria-label="Exit Cook Mode"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="h-1 w-full bg-white/10">
          <div
            className="h-full bg-[#D93B22] transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* Main Step Area */}
        <div className="relative flex flex-1 overflow-hidden">
          <div className="flex flex-1 flex-col items-center justify-center p-6 sm:p-12 overflow-y-auto">
            <div className="max-w-2xl w-full space-y-6">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-[#D93B22] px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-white">
                  Step {step.stepNumber}
                </span>
                {step.temperature && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-3 py-1 text-xs font-semibold text-amber-200">
                    <Flame className="h-3.5 w-3.5" />
                    {step.temperature}
                  </span>
                )}
                {step.videoTimestamp && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs font-mono text-white/80">
                    <Film className="h-3.5 w-3.5" />
                    {step.videoTimestamp}
                  </span>
                )}
              </div>

              <h3 className="font-serif text-3xl sm:text-4xl font-semibold leading-tight text-white">
                {step.title}
              </h3>

              <p className="text-lg sm:text-xl leading-relaxed text-[#E7E0D6]">
                {step.instruction}
              </p>

              {step.tip && (
                <div className="flex items-start gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-100">
                  <Lightbulb className="h-5 w-5 shrink-0 text-amber-300 mt-0.5" />
                  <p>{step.tip}</p>
                </div>
              )}

              {step.durationMinutes && step.durationMinutes > 0 && (
                <button
                  type="button"
                  onClick={() => onStartTimer(step.title, recipe.title, step.durationMinutes!)}
                  className="inline-flex items-center gap-2 rounded-2xl bg-[#F97316] px-5 py-3 text-sm font-bold text-white shadow-lg transition-transform hover:scale-[1.02] active:scale-[0.98]"
                >
                  <Timer className="h-4 w-4" />
                  <span>Start {step.durationMinutes} min Timer</span>
                </button>
              )}
            </div>
          </div>

          {/* Optional Ingredients Peek Drawer */}
          {showIngredientsPeek && (
            <aside className="w-80 shrink-0 border-l border-white/10 bg-[#25211E] p-5 overflow-y-auto">
              <h4 className="text-xs font-bold uppercase tracking-wider text-white/60 mb-3">
                Ingredients ({servings} servings)
              </h4>
              <ul className="space-y-2.5 text-sm">
                {recipe.ingredients.map((ing, idx) => (
                  <li key={idx} className="flex items-baseline justify-between gap-3 border-b border-white/5 pb-2">
                    <span className="text-white/90">{ing.name}</span>
                    <span className="font-semibold text-[#F97316] tabular-nums shrink-0">
                      {formatScaledIngredientQty(ing, scale)}
                    </span>
                  </li>
                ))}
              </ul>
            </aside>
          )}
        </div>

        {/* Bottom Controls */}
        <div className="flex items-center justify-between border-t border-white/10 px-6 py-4">
          <button
            type="button"
            disabled={cookStepIdx === 0}
            onClick={() => setCookStepIdx((i) => Math.max(0, i - 1))}
            className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-5 py-3 text-sm font-semibold hover:bg-white/20 disabled:opacity-30"
          >
            <ArrowLeft className="h-4 w-4" />
            Previous
          </button>

          <span className="text-xs text-white/50 hidden sm:inline">
            Use ← / → arrow keys · Screen stays awake
          </span>

          {cookStepIdx < recipe.steps.length - 1 ? (
            <button
              type="button"
              onClick={() => setCookStepIdx((i) => Math.min(recipe.steps.length - 1, i + 1))}
              className="inline-flex items-center gap-2 rounded-xl bg-[#D93B22] px-6 py-3 text-sm font-bold text-white hover:bg-[#B82D17]"
            >
              Next Step
              <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                onMarkMadeIt(recipe.id);
                setCookMode(false);
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-[#2D6A4F] px-6 py-3 text-sm font-bold text-white hover:bg-[#23543E]"
            >
              <Check className="h-4 w-4" />
              Finish &amp; Mark as Made
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={recipe.title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#1C1917]/60 p-3 sm:p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-[#E8E1D7] bg-[#FAF7F2] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Hero Strip */}
        <div className="relative grid grid-cols-1 md:grid-cols-12 border-b border-[#E8E1D7] bg-white">
          <div className="relative md:col-span-5 h-56 md:h-auto min-h-[220px] bg-[#1C1917] overflow-hidden">
            {recipe.videoUrl && /\.mp4(\?|$)/i.test(recipe.videoUrl) ? (
              <video
                src={recipe.videoUrl}
                poster={recipe.imageUrl}
                controls
                playsInline
                className="h-full w-full object-cover"
              />
            ) : recipe.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={recipe.imageUrl}
                alt={recipe.title}
                className="h-full w-full object-cover"
              />
            ) : null}
          </div>

          <div className="md:col-span-7 flex flex-col justify-between p-5 sm:p-6">
            <div>
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full bg-[#D93B22]/10 px-2.5 py-0.5 text-[11px] font-bold text-[#D93B22]">
                    {recipe.category}
                  </span>
                  <span className="rounded-full bg-[#FAF7F2] border border-[#E8E1D7] px-2.5 py-0.5 text-[11px] font-semibold text-[#575049]">
                    {recipe.difficulty}
                  </span>
                  {recipe.sourceType === 'video' && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#1C1917] px-2.5 py-0.5 text-[11px] font-semibold text-white">
                      <Film className="h-3 w-3 text-[#FB7185]" />
                      Extracted from Video
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close recipe plan"
                  className="rounded-xl p-1.5 text-[#8A8177] hover:bg-[#FAF7F2] hover:text-[#1C1917]"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {editing ? (
                <div className="mt-3 space-y-2">
                  <input
                    type="text"
                    value={draftTitle}
                    onChange={(e) => setDraftTitle(e.target.value)}
                    className="w-full rounded-xl border border-[#D4C7B7] bg-white px-3 py-2 font-serif text-xl font-semibold text-[#1C1917] focus:border-[#D93B22] focus:outline-none"
                  />
                  <textarea
                    rows={2}
                    value={draftSummary}
                    onChange={(e) => setDraftSummary(e.target.value)}
                    className="w-full rounded-xl border border-[#D4C7B7] bg-white px-3 py-1.5 text-xs text-[#443E38] focus:border-[#D93B22] focus:outline-none"
                  />
                </div>
              ) : (
                <>
                  <h2 className="mt-2.5 font-serif text-2xl sm:text-[26px] font-semibold leading-tight text-[#1C1917]">
                    {recipe.title}
                  </h2>
                  {recipe.summary && (
                    <p className="mt-2 text-sm leading-relaxed text-[#575049]">
                      {recipe.summary}
                    </p>
                  )}
                </>
              )}

              <div className="mt-3.5 flex flex-wrap items-center gap-4 text-xs font-medium text-[#6B645C]">
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5 text-[#D93B22]" />
                  Prep {recipe.prepMinutes}m · Cook {recipe.cookMinutes}m ({totalMins}m total)
                </span>
                <span>By {recipe.creator}</span>
                {recipe.sourcePinUrl && (
                  <a
                    href={recipe.outboundUrl || recipe.sourcePinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-[#D93B22] hover:underline"
                  >
                    Original Source
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>

              {recipe.extractionNotes && (
                <p className="mt-2.5 rounded-xl bg-[#FAF7F2] border border-[#E8E1D7] px-3 py-2 text-[11px] text-[#6B645C]">
                  {recipe.extractionNotes}
                </p>
              )}
            </div>

            {/* Action Row */}
            <div className="mt-5 flex flex-wrap items-center gap-2">
              {recipe.steps.length > 0 && !editing && (
                <button
                  type="button"
                  onClick={() => {
                    setCookStepIdx(0);
                    setCookMode(true);
                  }}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#D93B22] px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-[#B82D17]"
                >
                  <Play className="h-3.5 w-3.5 fill-current" />
                  Start Cook Mode
                </button>
              )}

              <button
                type="button"
                onClick={() => onToggleSelect(recipe.id)}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2.5 text-xs font-bold transition-colors ${
                  selected
                    ? 'border-[#1C1917] bg-[#1C1917] text-white'
                    : 'border-[#DED5C8] bg-white text-[#1C1917] hover:bg-[#FAF7F2]'
                }`}
              >
                <Check className="h-3.5 w-3.5" />
                {selected ? 'In Weekly Basket' : 'Add to Basket'}
              </button>

              <button
                type="button"
                onClick={() => onToggleMadeIt(recipe.id)}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2.5 text-xs font-bold transition-colors ${
                  madeIt
                    ? 'border-[#2D6A4F] bg-[#2D6A4F] text-white'
                    : 'border-[#DED5C8] bg-white text-[#443E38] hover:border-[#2D6A4F] hover:text-[#2D6A4F]'
                }`}
              >
                <Check className="h-3.5 w-3.5" />
                {madeIt ? 'Made It' : 'Mark as Made'}
              </button>

              {!editing ? (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#DED5C8] bg-white px-3 py-2.5 text-xs font-semibold text-[#575049] hover:bg-[#FAF7F2]"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </button>
              ) : (
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleSave}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#1C1917] px-3.5 py-2.5 text-xs font-bold text-white hover:bg-[#332E2A]"
                >
                  <Save className="h-3.5 w-3.5" />
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              )}

              {recipe.sourcePinUrl && recipe.sourceType !== 'curated' && (
                <button
                  type="button"
                  disabled={reExtracting}
                  onClick={handleReExtractClick}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#DED5C8] bg-white px-3 py-2.5 text-xs font-semibold text-[#575049] hover:bg-[#FAF7F2] disabled:opacity-50"
                  title="Re-analyze this pin with Gemini"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${reExtracting ? 'animate-spin' : ''}`} />
                  {reExtracting ? 'Re-reading...' : 'Re-extract'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Scrollable 2-Column Content */}
        <div className="thin-scroll flex-1 overflow-y-auto p-5 sm:p-6">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            {/* Ingredients Column */}
            <div className="md:col-span-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-serif text-lg font-semibold text-[#1C1917]">Ingredients</h3>

                {/* Serving Scaler */}
                <div className="inline-flex items-center gap-1.5 rounded-xl border border-[#E8E1D7] bg-white px-2 py-1 text-xs font-semibold text-[#1C1917]">
                  <Users className="h-3.5 w-3.5 text-[#8A8177]" />
                  <button
                    type="button"
                    aria-label="Decrease servings"
                    onClick={() => onChangeServings(recipe.id, Math.max(1, servings - 1))}
                    className="rounded-md p-1 hover:bg-[#FAF7F2]"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="w-6 text-center font-bold tabular-nums">{servings}</span>
                  <button
                    type="button"
                    aria-label="Increase servings"
                    onClick={() => onChangeServings(recipe.id, Math.min(20, servings + 1))}
                    className="rounded-md p-1 hover:bg-[#FAF7F2]"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
              </div>

              <ul className="space-y-2 rounded-2xl border border-[#E8E1D7] bg-white p-4">
                {recipe.ingredients.map((ing, idx) => {
                  const checked = checkedIngredients.has(idx);
                  const qty = formatScaledIngredientQty(ing, scale);
                  return (
                    <li
                      key={idx}
                      onClick={() =>
                        setCheckedIngredients((prev) => {
                          const next = new Set(prev);
                          if (next.has(idx)) next.delete(idx);
                          else next.add(idx);
                          return next;
                        })
                      }
                      className={`flex cursor-pointer items-start gap-2.5 rounded-xl p-2 transition-colors hover:bg-[#FAF7F2] ${
                        checked ? 'opacity-50 line-through' : ''
                      }`}
                    >
                      <span
                        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                          checked
                            ? 'border-[#2D6A4F] bg-[#2D6A4F] text-white'
                            : 'border-[#CFC3B4] bg-white'
                        }`}
                      >
                        {checked && <Check className="h-3 w-3 stroke-[3]" />}
                      </span>
                      <div className="text-sm leading-snug">
                        <span className="font-bold text-[#1C1917] tabular-nums">{qty}</span>{' '}
                        <span className="text-[#332E2A]">{ing.name}</span>
                        {ing.prepNote && (
                          <span className="text-xs text-[#8A8177]">, {ing.prepNote}</span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Step-by-Step Plan Column */}
            <div className="md:col-span-7 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-serif text-lg font-semibold text-[#1C1917]">
                  Step-by-Step Plan
                </h3>
                <span className="text-xs font-medium text-[#8A8177] tabular-nums">
                  {completedSteps.size}/{recipe.steps.length} done
                </span>
              </div>

              {editing ? (
                <div className="space-y-2">
                  <p className="text-xs text-[#6B645C]">
                    One step per line using <code className="rounded bg-white px-1 py-0.5">Title :: Instruction</code>
                  </p>
                  <textarea
                    rows={10}
                    value={draftStepsText}
                    onChange={(e) => setDraftStepsText(e.target.value)}
                    className="w-full rounded-2xl border border-[#D4C7B7] bg-white p-4 text-xs leading-relaxed text-[#1C1917] focus:border-[#D93B22] focus:outline-none"
                  />
                </div>
              ) : (
                <ol className="space-y-3">
                  {recipe.steps.map((step) => {
                    const done = completedSteps.has(step.stepNumber);
                    return (
                      <li
                        key={step.stepNumber}
                        className={`rounded-2xl border p-4 transition-all ${
                          done
                            ? 'border-[#D3E3D9] bg-[#F5F8F4]/70 opacity-75'
                            : 'border-[#E8E1D7] bg-white'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <button
                            type="button"
                            aria-label={`Mark step ${step.stepNumber} complete`}
                            onClick={() =>
                              setCompletedSteps((prev) => {
                                const next = new Set(prev);
                                if (next.has(step.stepNumber)) next.delete(step.stepNumber);
                                else next.add(step.stepNumber);
                                return next;
                              })
                            }
                            className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                              done
                                ? 'bg-[#2D6A4F] text-white'
                                : 'bg-[#FAF7F2] border border-[#DED5C8] text-[#1C1917] hover:border-[#2D6A4F]'
                            }`}
                          >
                            {done ? <Check className="h-3.5 w-3.5 stroke-[3]" /> : step.stepNumber}
                          </button>

                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <h4
                                className={`font-semibold text-sm ${
                                  done ? 'line-through text-[#6B645C]' : 'text-[#1C1917]'
                                }`}
                              >
                                {step.title}
                              </h4>

                              <div className="flex items-center gap-1.5">
                                {step.temperature && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200/70 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                                    <Flame className="h-3 w-3" />
                                    {step.temperature}
                                  </span>
                                )}
                                {step.videoTimestamp && (
                                  <span className="rounded-full bg-[#FAF7F2] border border-[#E8E1D7] px-2 py-0.5 font-mono text-[10px] font-semibold text-[#6B645C]">
                                    {step.videoTimestamp}
                                  </span>
                                )}
                                {step.durationMinutes && step.durationMinutes > 0 && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onStartTimer(step.title, recipe.title, step.durationMinutes!)
                                    }
                                    className="inline-flex items-center gap-1 rounded-full bg-[#D93B22]/10 px-2.5 py-0.5 text-[11px] font-bold text-[#D93B22] hover:bg-[#D93B22] hover:text-white transition-colors"
                                  >
                                    <Timer className="h-3 w-3" />
                                    {step.durationMinutes}m
                                  </button>
                                )}
                              </div>
                            </div>

                            <p className="mt-1.5 text-sm leading-relaxed text-[#443E38]">
                              {step.instruction}
                            </p>

                            {step.tip && (
                              <div className="mt-2.5 flex items-start gap-2 rounded-xl bg-[#FAF7F2] px-3 py-2 text-xs text-[#6B645C]">
                                <Lightbulb className="h-3.5 w-3.5 shrink-0 text-amber-600 mt-0.5" />
                                <span>{step.tip}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

import {
  BookOpen,
  Check,
  CheckCircle2,
  Clock,
  Film,
  Globe,
  Image as ImageIcon,
  Layers,
  Sparkles,
  Users,
} from 'lucide-react';
import type { RawPin, Recipe } from '@/lib/types';

function SourceBadge({ sourceType }: { sourceType: Recipe['sourceType'] }) {
  switch (sourceType) {
    case 'video':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-[#1C1917]/80 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-md">
          <Film className="h-3 w-3 text-[#FB7185]" />
          Video
        </span>
      );
    case 'carousel':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-[#1C1917]/80 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-md">
          <Layers className="h-3 w-3 text-amber-300" />
          Multi-photo
        </span>
      );
    case 'blog':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-[#1C1917]/80 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-md">
          <Globe className="h-3 w-3 text-emerald-300" />
          Web
        </span>
      );
    case 'image':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-[#1C1917]/80 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-md">
          <ImageIcon className="h-3 w-3 text-sky-300" />
          Photo
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-[#1C1917] shadow-sm backdrop-blur-md">
          <Sparkles className="h-3 w-3 text-[#D93B22]" />
          Starter
        </span>
      );
  }
}

interface RecipeCardProps {
  recipe: Recipe;
  selected: boolean;
  madeIt: boolean;
  onToggleSelect: (id: string) => void;
  onToggleMadeIt: (id: string) => void;
  onOpenPlan: (recipe: Recipe) => void;
}

export function RecipeCard({
  recipe,
  selected,
  madeIt,
  onToggleSelect,
  onToggleMadeIt,
  onOpenPlan,
}: RecipeCardProps) {
  const totalMins = (recipe.prepMinutes || 0) + (recipe.cookMinutes || 0);

  return (
    <article
      onClick={() => onToggleSelect(recipe.id)}
      className={`group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border bg-white transition-all duration-200 select-none ${
        selected
          ? 'border-[#D93B22] ring-2 ring-[#D93B22]/20 shadow-[0_12px_30px_-14px_rgba(217,59,34,0.35)]'
          : 'border-[#E8E1D7] hover:border-[#D4C7B7] hover:shadow-[0_10px_28px_-14px_rgba(28,25,23,0.18)]'
      }`}
    >
      {/* Photo */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#F1EAE0]">
        {recipe.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={recipe.imageUrl}
            alt={recipe.title}
            loading="lazy"
            className="h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[#A89E91]">
            <BookOpen className="h-10 w-10" />
          </div>
        )}

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#1C1917]/65 via-[#1C1917]/10 to-transparent" />

        {/* Top Row: Source Type + Selection Ring */}
        <div className="absolute inset-x-3 top-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <SourceBadge sourceType={recipe.sourceType} />
            {madeIt && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#2D6A4F] px-2 py-1 text-[10px] font-bold text-white shadow-sm">
                <CheckCircle2 className="h-3 w-3" />
                Made
              </span>
            )}
          </div>

          <button
            type="button"
            aria-label={selected ? `Remove ${recipe.title} from meal plan` : `Add ${recipe.title} to meal plan`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect(recipe.id);
            }}
            className={`flex h-8 w-8 items-center justify-center rounded-full border transition-all ${
              selected
                ? 'border-[#D93B22] bg-[#D93B22] text-white shadow-md scale-105'
                : 'border-white/70 bg-white/85 text-transparent backdrop-blur-md hover:bg-white'
            }`}
          >
            <Check className="h-4 w-4 stroke-[2.75]" />
          </button>
        </div>

        {/* Bottom Overlay: Time + Primary Tag */}
        <div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-2 text-[11px]">
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-0.5 font-semibold text-[#1C1917] shadow-sm">
              <Clock className="h-3 w-3 text-[#D93B22]" />
              <span className="tabular-nums">{totalMins > 0 ? `${totalMins}m` : '25m'}</span>
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-[#1C1917]/75 px-2.5 py-0.5 font-medium text-white backdrop-blur-sm">
              <Users className="h-3 w-3 text-white/80" />
              <span className="tabular-nums">{recipe.servings}</span>
            </span>
          </div>
          {recipe.tags[0] && (
            <span className="truncate rounded-full bg-white/90 px-2.5 py-0.5 font-semibold text-[#443E38] backdrop-blur-sm">
              {recipe.tags[0]}
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col justify-between p-4">
        <div>
          <h3 className="font-serif text-[17px] leading-snug font-semibold text-[#1C1917] line-clamp-2 transition-colors group-hover:text-[#D93B22]">
            {recipe.title}
          </h3>
          {recipe.summary && (
            <p className="mt-1.5 text-xs leading-relaxed text-[#6B645C] line-clamp-2">
              {recipe.summary}
            </p>
          )}
          <p className="mt-2 text-[11px] font-medium text-[#8A8177] truncate">
            {recipe.creator} · {recipe.category}
          </p>
        </div>

        {/* Footer */}
        <div className="mt-4 flex items-center justify-between gap-2 border-t border-[#F1EAE0] pt-3">
          {/* Made It Checkbox */}
          <label
            onClick={(e) => e.stopPropagation()}
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold transition-colors ${
              madeIt
                ? 'bg-[#EBF3EC] text-[#2D6A4F]'
                : 'text-[#6B645C] hover:bg-[#FAF7F2] hover:text-[#1C1917]'
            }`}
          >
            <input
              type="checkbox"
              checked={madeIt}
              onChange={() => onToggleMadeIt(recipe.id)}
              className="h-3.5 w-3.5 rounded border-[#CFC3B4] accent-[#2D6A4F] cursor-pointer"
            />
            <span>Made it</span>
          </label>

          <div className="flex items-center gap-2">
            <span className="hidden sm:inline text-[11px] font-medium text-[#8A8177] tabular-nums">
              {recipe.ingredients.length} ing · {recipe.steps.length} steps
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenPlan(recipe);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#FAF7F2] px-2.5 py-1.5 text-xs font-semibold text-[#1C1917] border border-[#E8E1D7] transition-colors hover:border-[#D93B22] hover:bg-[#D93B22] hover:text-white"
            >
              <BookOpen className="h-3.5 w-3.5" />
              <span>Recipe</span>
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

export function ExtractingPinCard({
  pin,
  statusLabel,
}: {
  pin: RawPin;
  statusLabel: string;
}) {
  return (
    <div className="relative flex flex-col overflow-hidden rounded-2xl border border-[#D93B22]/30 bg-white shadow-sm">
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#F1EAE0]">
        {pin.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={pin.imageUrl}
            alt={pin.title}
            className="h-full w-full object-cover opacity-50 blur-[1px]"
          />
        )}
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#1C1917]/40 p-4 text-center text-white backdrop-blur-[2px]">
          <div className="mb-2 h-7 w-7 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          <span className="text-xs font-semibold tracking-wide">{statusLabel}</span>
          <span className="mt-1 text-[11px] text-white/80">
            {pin.mediaType === 'video' ? 'Watching video & noting steps' : 'Reading recipe & ingredients'}
          </span>
        </div>
      </div>
      <div className="p-4 space-y-2">
        <div className="h-4 w-3/4 animate-pulse rounded bg-[#EFE8DF]" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-[#F4EFE7]" />
      </div>
    </div>
  );
}

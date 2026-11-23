'use client';

import { useEffect } from 'react';
import { Bell, Pause, Play, RotateCcw, Timer, X } from 'lucide-react';

export interface ActiveTimer {
  id: string;
  label: string;
  recipeTitle: string;
  totalSeconds: number;
  remainingSeconds: number;
  running: boolean;
  finished: boolean;
}

function playDoneChime() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const notes = [587.33, 880, 1174.66];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.08, ctx.currentTime + i * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.14 + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.14);
      osc.stop(ctx.currentTime + i * 0.14 + 0.35);
    });
  } catch {
    // Ignore audio context autoplay restrictions
  }
}

function formatTime(secs: number): string {
  const safe = Math.max(0, Math.floor(secs));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function KitchenTimerBar({
  timers,
  onUpdateTimers,
}: {
  timers: ActiveTimer[];
  onUpdateTimers: React.Dispatch<React.SetStateAction<ActiveTimer[]>>;
}) {
  useEffect(() => {
    const hasRunning = timers.some((t) => t.running && !t.finished);
    if (!hasRunning) return;

    const interval = setInterval(() => {
      onUpdateTimers((prev) =>
        prev.map((t) => {
          if (!t.running || t.finished) return t;
          const next = t.remainingSeconds - 1;
          if (next <= 0) {
            playDoneChime();
            return { ...t, remainingSeconds: 0, running: false, finished: true };
          }
          return { ...t, remainingSeconds: next };
        }),
      );
    }, 1000);

    return () => clearInterval(interval);
  }, [timers, onUpdateTimers]);

  if (timers.length === 0) return null;

  return (
    <div className="no-print fixed bottom-20 left-4 z-50 flex flex-col gap-2 max-w-xs w-[calc(100vw-2rem)]">
      {timers.map((timer) => {
        const pct = timer.totalSeconds > 0 ? ((timer.totalSeconds - timer.remainingSeconds) / timer.totalSeconds) * 100 : 100;
        return (
          <div
            key={timer.id}
            className={`overflow-hidden rounded-2xl border p-3 shadow-xl backdrop-blur-md transition-colors ${
              timer.finished
                ? 'border-[#D93B22] bg-[#D93B22] text-white animate-pulse'
                : 'border-[#E8E1D7] bg-[#1C1917]/95 text-white'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {timer.finished ? (
                  <Bell className="h-4 w-4 shrink-0" />
                ) : (
                  <Timer className="h-4 w-4 shrink-0 text-[#F97316]" />
                )}
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold">{timer.label}</p>
                  <p className="truncate text-[10px] opacity-75">{timer.recipeTitle}</p>
                </div>
              </div>

              <span className="font-mono text-base font-bold tabular-nums shrink-0">
                {timer.finished ? 'Done!' : formatTime(timer.remainingSeconds)}
              </span>

              <div className="flex items-center gap-1 shrink-0">
                {!timer.finished && (
                  <button
                    type="button"
                    aria-label={timer.running ? 'Pause timer' : 'Resume timer'}
                    onClick={() =>
                      onUpdateTimers((prev) =>
                        prev.map((t) => (t.id === timer.id ? { ...t, running: !t.running } : t)),
                      )
                    }
                    className="rounded-lg bg-white/15 p-1.5 hover:bg-white/25"
                  >
                    {timer.running ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  </button>
                )}
                <button
                  type="button"
                  aria-label="Reset timer"
                  onClick={() =>
                    onUpdateTimers((prev) =>
                      prev.map((t) =>
                        t.id === timer.id
                          ? { ...t, remainingSeconds: t.totalSeconds, running: true, finished: false }
                          : t,
                      ),
                    )
                  }
                  className="rounded-lg bg-white/15 p-1.5 hover:bg-white/25"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Dismiss timer"
                  onClick={() => onUpdateTimers((prev) => prev.filter((t) => t.id !== timer.id))}
                  className="rounded-lg bg-white/15 p-1.5 hover:bg-white/25"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {!timer.finished && (
              <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/15">
                <div
                  className="h-full rounded-full bg-[#F97316] transition-all duration-1000"
                  style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

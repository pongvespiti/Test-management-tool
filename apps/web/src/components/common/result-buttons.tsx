'use client';

import {
  EXECUTED_STATUSES,
  RESULT_LABELS,
  RESULT_SHORTCUTS,
  type ExecutedStatus,
  type ResultStatus,
} from '@tmt/shared';
import { RESULT_TONES } from '@/lib/status';
import { cn } from '@/lib/utils';

/**
 * Controlled result picker: OK / NG / OK w/ cond. / Blocked / N/T / N/A with keyboard hints.
 * The page owns the keyboard handler (see `resultFromKey`); this only renders the buttons.
 */
export function ResultButtons({
  value,
  onChange,
  disabled,
  compact = false,
  statuses = EXECUTED_STATUSES,
}: {
  value: ResultStatus | null;
  onChange: (status: ExecutedStatus) => void;
  disabled?: boolean;
  /** Smaller buttons for table rows. */
  compact?: boolean;
  statuses?: readonly ExecutedStatus[];
}) {
  return (
    <div role="group" aria-label="Result" className="flex flex-wrap gap-2">
      {statuses.map((s) => {
        const tone = RESULT_TONES[s];
        const selected = value === s;
        return (
          <button
            key={s}
            type="button"
            aria-pressed={selected}
            disabled={disabled}
            onClick={() => onChange(s)}
            title={`${RESULT_LABELS[s]} (${RESULT_SHORTCUTS[s]})`}
            className={cn(
              'inline-flex items-center justify-center gap-2 rounded-lg border font-bold transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-55',
              compact ? 'h-8 min-w-16 px-2 text-[13px]' : 'h-11 min-w-24 px-3 text-sm',
            )}
            style={{
              background: selected ? tone.solid : tone.bg,
              color: selected ? '#FFFFFF' : tone.fg,
              borderColor: selected ? tone.solid : 'transparent',
            }}
          >
            {!compact && (
              <span
                aria-hidden
                className="inline-flex size-[18px] items-center justify-center rounded font-mono text-[11px] font-semibold"
                style={{
                  background: selected ? 'rgba(255,255,255,0.22)' : '#FFFFFF',
                  color: selected ? '#FFFFFF' : tone.fg,
                }}
              >
                {RESULT_SHORTCUTS[s]}
              </span>
            )}
            {RESULT_LABELS[s]}
          </button>
        );
      })}
    </div>
  );
}

/** Maps a pressed key to a result status (case-insensitive), or null. */
export function resultFromKey(key: string): ExecutedStatus | null {
  const k = key.toUpperCase();
  for (const s of EXECUTED_STATUSES) if (RESULT_SHORTCUTS[s] === k) return s;
  return null;
}

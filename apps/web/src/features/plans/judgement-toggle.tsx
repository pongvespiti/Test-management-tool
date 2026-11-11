'use client';

import { JUDGEMENT_LABELS, JUDGEMENTS, type Judgement } from '@tmt/shared';
import { Button } from '@/components/ui/button';
import { JUDGEMENT_TONES } from '@/lib/status';
import { cn } from '@/lib/utils';

/** PASS / PASS WITH CONDITION / NOT PASS as toggle buttons; pressing the active one clears it. */
export function JudgementToggle({
  value,
  onChange,
  label = 'Judgement',
  size = 'sm',
  id,
}: {
  value: Judgement | null;
  onChange: (judgement: Judgement | null) => void;
  /** Accessible name of the button group. */
  label?: string;
  size?: 'xs' | 'sm';
  id?: string;
}) {
  return (
    <div id={id} role="group" aria-label={label} className="flex flex-wrap gap-2">
      {JUDGEMENTS.map((j) => {
        const active = value === j;
        const tone = JUDGEMENT_TONES[j];
        return (
          <Button
            key={j}
            type="button"
            variant="outline"
            aria-pressed={active}
            className={cn(
              'font-bold tracking-[0.02em]',
              size === 'sm' ? 'h-10' : 'h-8',
              active && 'border-transparent hover:opacity-90',
            )}
            style={active ? { background: tone.solid, color: '#FFFFFF' } : { color: tone.fg }}
            onClick={() => onChange(active ? null : j)}
          >
            {JUDGEMENT_LABELS[j]}
          </Button>
        );
      })}
    </div>
  );
}

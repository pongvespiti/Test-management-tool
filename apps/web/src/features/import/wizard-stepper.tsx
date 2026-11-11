'use client';

import { Check } from 'lucide-react';
import { Fragment } from 'react';
import { cn } from '@/lib/utils';

export interface WizardStep {
  label: string;
  /** Small line under the label (e.g. the uploaded file name). */
  description?: string;
  /** The user may jump back to this step. */
  selectable?: boolean;
}

/**
 * Horizontal step indicator: done steps show a check, the current one is highlighted. Wide screens
 * only — narrow screens get a one-line "Step 2 of 6 · …" instead.
 */
export function WizardStepper({
  steps,
  active,
  onSelect,
  label,
}: {
  steps: readonly WizardStep[];
  /** Index of the current step; `steps.length` = all done. */
  active: number;
  onSelect: (index: number) => void;
  label: string;
}) {
  return (
    <>
      <ol aria-label={label} className="hidden items-start gap-3 lg:flex">
        {steps.map((step, i) => {
          const done = i < active;
          const current = i === active;
          const body = (
            <>
              <span
                aria-hidden
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors',
                  done && 'border-primary bg-primary text-primary-foreground',
                  current && 'border-primary bg-card text-primary',
                  !done && !current && 'border-input bg-card text-muted-foreground',
                )}
              >
                {done ? <Check className="size-4" strokeWidth={2.5} /> : i + 1}
              </span>
              <span className="flex min-w-0 flex-col text-left">
                <span
                  className={cn(
                    'text-sm leading-5 font-medium',
                    !done && !current && 'text-muted-foreground',
                  )}
                >
                  {step.label}
                </span>
                {step.description && (
                  <span
                    className="max-w-40 truncate text-xs text-muted-foreground"
                    title={step.description}
                  >
                    {step.description}
                  </span>
                )}
              </span>
            </>
          );
          return (
            <Fragment key={step.label}>
              {i > 0 && (
                <li
                  aria-hidden
                  className={cn(
                    'mt-4 h-0.5 min-w-4 flex-1 rounded-full',
                    done || current ? 'bg-primary' : 'bg-border',
                  )}
                />
              )}
              <li aria-current={current ? 'step' : undefined} className="flex shrink-0">
                {step.selectable ? (
                  <button
                    type="button"
                    onClick={() => onSelect(i)}
                    className="flex items-start gap-2.5 rounded-md outline-none hover:opacity-80 focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    {body}
                  </button>
                ) : (
                  <span className="flex items-start gap-2.5">{body}</span>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
      <p className="text-sm font-semibold lg:hidden">
        Step {Math.min(active, steps.length - 1) + 1} of {steps.length} ·{' '}
        {steps[Math.min(active, steps.length - 1)]?.label}
      </p>
    </>
  );
}

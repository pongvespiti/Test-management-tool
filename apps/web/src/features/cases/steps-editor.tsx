'use client';

import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Layers,
  Plus,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { IconButton } from '@/components/common/icon-button';
import { StepsView } from '@/components/common/steps-view';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Textarea } from '@/components/ui/textarea';
import { pluralize } from '@/lib/format';
import { cn } from '@/lib/utils';
import { plainStep, type EditorStep } from './case-form-model';
import { FieldCaption } from '@/components/common/list-controls';

/** Case steps: `steps` array limit of `createCaseSchema` (a shared step reference counts as one). */
export const MAX_CASE_STEPS = 200;

type Update = (prev: EditorStep[]) => EditorStep[];

interface StepsEditorProps {
  steps: EditorStep[];
  /** Functional update of the whole list. */
  onChange: (update: Update) => void;
  /** Error of a field of row `index`. */
  errorFor?: (index: number, field: 'action' | 'expected') => string | undefined;
  /** Error about the list as a whole (e.g. too many steps, unknown shared step). */
  error?: string;
  /** Shows "Insert shared steps…" (case editor only). */
  onInsertShared?: () => void;
  /** Link to the shared steps page, shown inside shared step cards. */
  sharedStepsHref?: string;
  max?: number;
  disabled?: boolean;
}

/** Step numbers as the tester will see them in a run (shared steps expanded in place). */
export function stepNumbers(steps: readonly EditorStep[]): string[] {
  let n = 0;
  return steps.map((s) => {
    if (s.kind === 'step') {
      n += 1;
      return String(n);
    }
    const count = s.missing ? 0 : s.steps.length;
    if (count === 0) return '–';
    const from = n + 1;
    n += count;
    return count === 1 ? String(from) : `${from}–${n}`;
  });
}

/**
 * Ordered steps editor: inline steps (action + expected result) and, in the case editor, references
 * to shared steps shown as collapsible cards. Rows can be moved up/down and removed.
 */
export function StepsEditor({
  steps,
  onChange,
  errorFor,
  error,
  onInsertShared,
  sharedStepsHref,
  max = MAX_CASE_STEPS,
  disabled = false,
}: StepsEditorProps) {
  const numbers = stepNumbers(steps);
  const full = steps.length >= max;

  const move = (index: number, to: number) =>
    onChange((prev) => {
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(to, 0, item!);
      return next;
    });
  const remove = (index: number) => onChange((prev) => prev.filter((_, i) => i !== index));
  const setField = (index: number, field: 'action' | 'expected', value: string) =>
    onChange((prev) =>
      prev.map((s, i) => (i === index && s.kind === 'step' ? { ...s, [field]: value } : s)),
    );

  return (
    <div className="flex flex-col gap-2">
      {steps.length === 0 ? (
        <p className="rounded-md border bg-muted p-4 text-sm text-muted-foreground">
          No steps yet. Add the first step
          {onInsertShared ? ' or insert a shared step set (e.g. “Log in to the app”)' : ''}.
        </p>
      ) : (
        <div aria-hidden className="hidden items-center gap-3 pr-[108px] sm:flex">
          <span className="w-11 shrink-0" />
          <div className="grid flex-1 grid-cols-2 gap-2">
            <FieldCaption className="mb-0">Action</FieldCaption>
            <FieldCaption className="mb-0">Expected result</FieldCaption>
          </div>
        </div>
      )}
      {steps.map((s, i) => {
        const actions = (
          <RowActions
            label={s.kind === 'step' ? `step ${numbers[i]}` : `shared steps ${s.name}`.trim()}
            first={i === 0}
            last={i === steps.length - 1}
            disabled={disabled}
            onUp={() => move(i, i - 1)}
            onDown={() => move(i, i + 1)}
            onRemove={() => remove(i)}
          />
        );
        if (s.kind === 'shared')
          return (
            <SharedStepCard
              key={s.uid}
              step={s}
              number={numbers[i]!}
              actions={actions}
              sharedStepsHref={sharedStepsHref}
            />
          );
        const actionError = errorFor?.(i, 'action');
        const expectedError = errorFor?.(i, 'expected');
        return (
          <div key={s.uid} className="flex items-start gap-3">
            <span className="mt-2 w-11 shrink-0 text-right text-sm font-semibold text-muted-foreground">
              {numbers[i]}.
            </span>
            <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
              <div>
                <Textarea
                  aria-label={`Step ${numbers[i]} action`}
                  placeholder="Action"
                  rows={1}
                  className="min-h-9"
                  value={s.action}
                  aria-invalid={!!actionError}
                  disabled={disabled}
                  onChange={(e) => setField(i, 'action', e.currentTarget.value)}
                />
                {actionError && <p className="mt-1 text-xs text-destructive">{actionError}</p>}
              </div>
              <div>
                <Textarea
                  aria-label={`Step ${numbers[i]} expected result`}
                  placeholder="Expected result"
                  rows={1}
                  className="min-h-9"
                  value={s.expected}
                  aria-invalid={!!expectedError}
                  disabled={disabled}
                  onChange={(e) => setField(i, 'expected', e.currentTarget.value)}
                />
                {expectedError && <p className="mt-1 text-xs text-destructive">{expectedError}</p>}
              </div>
            </div>
            {actions}
          </div>
        );
      })}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 sm:pl-14">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={full || disabled}
          onClick={() => onChange((prev) => [...prev, plainStep()])}
        >
          <Plus />
          Add step
        </Button>
        {onInsertShared && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-primary"
            disabled={full || disabled}
            onClick={onInsertShared}
          >
            <Layers />
            Insert shared steps…
          </Button>
        )}
        {full && <span className="text-xs text-muted-foreground">At most {max} steps.</span>}
      </div>
    </div>
  );
}

function RowActions({
  label,
  first,
  last,
  disabled,
  onUp,
  onDown,
  onRemove,
}: {
  label: string;
  first: boolean;
  last: boolean;
  disabled: boolean;
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="mt-0.5 flex shrink-0 items-center gap-0.5">
      <IconButton
        type="button"
        label={`Move ${label} up`}
        disabled={first || disabled}
        onClick={onUp}
      >
        <ArrowUp />
      </IconButton>
      <IconButton
        type="button"
        label={`Move ${label} down`}
        disabled={last || disabled}
        onClick={onDown}
      >
        <ArrowDown />
      </IconButton>
      <IconButton
        type="button"
        label={`Remove ${label}`}
        tone="danger"
        disabled={disabled}
        onClick={onRemove}
      >
        <Trash2 />
      </IconButton>
    </div>
  );
}

/** A shared step reference: name, count and a one-line preview; expands to its steps. */
function SharedStepCard({
  step,
  number,
  actions,
  sharedStepsHref,
}: {
  step: Extract<EditorStep, { kind: 'shared' }>;
  number: string;
  actions: ReactNode;
  sharedStepsHref?: string;
}) {
  const [open, setOpen] = useState(false);
  const count = step.missing ? 0 : step.steps.length;
  const preview = step.steps
    .map((p) => p.action.split('\n')[0]?.trim())
    .filter(Boolean)
    .join(' · ');
  return (
    <div className="flex items-start gap-3">
      <span className="mt-2.5 w-11 shrink-0 text-right text-sm font-semibold text-muted-foreground">
        {number}
      </span>
      <Collapsible
        open={open && !step.missing}
        onOpenChange={setOpen}
        className={cn(
          'min-w-0 flex-1 rounded-md border bg-muted px-3 py-1.5',
          step.missing && 'border-[#ffa94d]',
        )}
      >
        <CollapsibleTrigger
          disabled={step.missing}
          className="flex w-full min-w-0 items-center gap-2 py-0.5 text-left enabled:cursor-pointer"
        >
          {!step.missing &&
            (open ? (
              <ChevronDown className="size-3.5 shrink-0" />
            ) : (
              <ChevronRight className="size-3.5 shrink-0" />
            ))}
          <Layers aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm font-semibold">
            {step.missing ? `Deleted shared step #${step.sharedStepId}` : step.name}
          </span>
          <Badge variant="secondary" className="shrink-0 bg-card font-medium">
            Shared · {pluralize(count, 'step')}
          </Badge>
          {!open && !step.missing && preview && (
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{preview}</span>
          )}
        </CollapsibleTrigger>
        {step.missing && (
          <Alert variant="warning" className="my-1.5 py-2">
            <TriangleAlert />
            <AlertDescription>
              This shared step was deleted, so it adds no steps. Remove it from the case.
            </AlertDescription>
          </Alert>
        )}
        <CollapsibleContent className="mt-2 mb-1 flex flex-col gap-1.5">
          <StepsView steps={step.steps.map((p) => ({ ...p, sharedStepName: null }))} />
          {sharedStepsHref && (
            <p className="text-xs text-muted-foreground">
              Edited on the{' '}
              <a
                href={sharedStepsHref}
                target="_blank"
                rel="noopener"
                className="text-primary hover:underline"
              >
                Shared steps page
              </a>{' '}
              — changes apply to every case that uses them.
            </p>
          )}
        </CollapsibleContent>
      </Collapsible>
      {actions}
    </div>
  );
}

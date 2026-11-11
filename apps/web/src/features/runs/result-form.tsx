'use client';

import {
  RESULT_LABELS,
  suggestStatusFromSteps,
  type ExecutedStatus,
  type RunCaseDTO,
  type RunStepDTO,
  type StepResultDTO,
} from '@tmt/shared';
import { ArrowRight, Check, Ellipsis, Pause, Play, RotateCcw, Sparkles } from 'lucide-react';
import {
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from 'react';
import { ResultBadge } from '@/components/common/badges';
import { confirmAction } from '@/components/common/confirm-host';
import { MultilineText } from '@/components/common/multiline-text';
import { ResultButtons } from '@/components/common/result-buttons';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Kbd } from '@/components/ui/kbd';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useSetResult, type SetResultBody } from '@/lib/api/runs';
import { notifyError } from '@/lib/notify';
import { cn } from '@/lib/utils';
import { useProject } from '@/providers/project-provider';
import {
  draftFromCase,
  elapsedNow,
  pauseTimer,
  sameDraft,
  type DraftStore,
  type ResultDraft,
} from './drafts';
import { FIELD_LABEL, FieldLabel } from './run-ui';
import { formatClock } from './time';

export interface ResultFormHandle {
  setStatus: (status: ExecutedStatus) => void;
  /** Saves the result; `next` moves on at once (the save completes in the background). */
  save: (opts: { next: boolean }) => void;
  /** Current (possibly unsaved) values, e.g. to prefill a defect. */
  getDraft: () => ResultDraft;
}

const touchedStep = (s: StepResultDTO) => s.status !== 'untested' || s.actual.trim() !== '';

/** Request body of a draft compared with the saved values. */
export function buildResultBody(
  d: ResultDraft,
  base: ResultDraft,
  stepCount: number,
): SetResultBody {
  const body: SetResultBody = {
    status: d.status,
    actualResult: d.actualResult,
    remark: d.remark,
  };
  if (d.elapsedSec !== base.elapsedSec) body.elapsedSec = d.elapsedSec > 0 ? d.elapsedSec : null;
  if (stepCount > 0) {
    if (d.stepResults.some(touchedStep))
      body.stepResults = d.stepResults.map((s) => ({ status: s.status, actual: s.actual }));
    else if (base.stepResults.some(touchedStep)) body.stepResults = null;
  }
  return body;
}

function TimerDisplay({ draft }: { draft: ResultDraft }) {
  const running = draft.timerStartedAt !== null;
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [running]);
  const clock = formatClock(elapsedNow(draft));
  return (
    <span
      aria-label={`Elapsed ${clock}`}
      className={cn(
        'inline-block min-w-[52px] font-mono text-sm font-semibold',
        running && 'text-[#1864ab]',
      )}
    >
      {clock}
    </span>
  );
}

function TipButton({
  label,
  children,
  className,
  variant = 'outline',
  onClick,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  variant?: 'default' | 'outline' | 'ghost';
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant={variant}
          aria-label={label}
          className={className}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** Per-step results of a step-by-step case (compact buttons + actual text per step). */
function StepExecution({
  steps,
  results,
  editable,
  onChange,
}: {
  steps: RunStepDTO[];
  results: StepResultDTO[];
  editable: boolean;
  onChange: (index: number, patch: Partial<StepResultDTO>) => void;
}) {
  return (
    <ol className="m-0 flex list-none flex-col gap-2 p-0">
      {steps.map((s, i) => {
        const r = results[i] ?? { status: 'untested' as const, actual: '' };
        return (
          <li
            key={i}
            aria-label={`Step ${i + 1}`}
            className="rounded-[10px] border border-[#e3e6ea] bg-white px-3 py-2.5"
          >
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="text-sm font-bold">Step {i + 1}</span>
                {s.sharedStepName && (
                  <span
                    title="From a shared step"
                    className="min-w-0 truncate rounded-sm bg-secondary px-1.5 py-0.5 text-xs font-medium text-[#495057]"
                  >
                    {s.sharedStepName}
                  </span>
                )}
              </div>
              {(!editable || r.status !== 'untested') && <ResultBadge status={r.status} />}
            </div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-x-4 gap-y-2">
              <div className="min-w-0">
                <FieldLabel as="div" className="mb-0.5">
                  Action
                </FieldLabel>
                <MultilineText value={s.action} />
              </div>
              <div className="min-w-0">
                <FieldLabel as="div" className="mb-0.5">
                  Expected
                </FieldLabel>
                <MultilineText value={s.expected} />
              </div>
            </div>
            {editable ? (
              <div className="mt-2 flex flex-col gap-1.5">
                <ResultButtons
                  compact
                  value={r.status === 'untested' ? null : r.status}
                  onChange={(st) => onChange(i, { status: r.status === st ? 'untested' : st })}
                />
                <Textarea
                  rows={1}
                  maxLength={10000}
                  aria-label={`Actual result of step ${i + 1}`}
                  placeholder="Actual result of this step (optional)"
                  className="max-h-48 min-h-8 py-1 text-xs md:text-xs"
                  value={r.actual}
                  onChange={(e) => onChange(i, { actual: e.currentTarget.value })}
                />
              </div>
            ) : (
              r.actual && (
                <p className="mt-1.5 text-xs whitespace-multiline">
                  <span className="font-semibold">Actual: </span>
                  {r.actual}
                </p>
              )
            )}
          </li>
        );
      })}
    </ol>
  );
}

interface Props {
  rc: RunCaseDTO;
  runId: number;
  store: DraftStore;
  /** May record results (tester and plan not completed). */
  editable: boolean;
  /** Select the next case of the list (Save & next). */
  onNext: () => void;
  ref?: Ref<ResultFormHandle>;
}

/**
 * Result entry of one run case. Edits live in a draft (kept in `store` while moving between cases
 * and across reloads) until saved; without edits the form follows the saved row (save, bulk
 * update, JUnit import). Keyboard shortcuts of the page call the handle.
 */
export function ResultForm({ rc, runId, store, editable, onNext, ref }: Props) {
  const { projectId } = useProject();
  const setResult = useSetResult(projectId);
  const base = useMemo(() => draftFromCase(rc), [rc]);
  /** The tester's edits; null = follow the saved values. */
  const [edit, setEdit] = useState<ResultDraft | null>(() => store.get(rc.id));
  const draft = edit ?? base;
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const draftRef = useRef(draft);
  const baseRef = useRef(base);
  const mounted = useRef(true);
  const rcId = rc.id;
  const stepCount = rc.steps.length;

  useLayoutEffect(() => {
    draftRef.current = draft;
    baseRef.current = base;
  });

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // Leaving the case: stop the timer, keep what was entered as a draft.
      const d = draftRef.current;
      if (d.timerStartedAt !== null) {
        const paused = pauseTimer(d);
        store.set(rcId, sameDraft(paused, baseRef.current) ? null : paused);
      }
    };
  }, [store, rcId]);

  useEffect(() => {
    store.set(rcId, sameDraft(draft, base) ? null : draft);
  }, [store, rcId, draft, base]);

  useEffect(() => {
    if (savedAt === null) return;
    const t = window.setTimeout(() => setSavedAt(null), 2500);
    return () => window.clearTimeout(t);
  }, [savedAt]);

  const dirty = !sameDraft(draft, base);
  const update = (patch: Partial<ResultDraft>) =>
    setEdit((cur) => ({ ...(cur ?? base), ...patch }));
  const setStepResult = (index: number, patch: Partial<StepResultDTO>) =>
    setEdit((cur) => {
      const d = cur ?? base;
      return {
        ...d,
        stepResults: d.stepResults.map((s, i) => (i === index ? { ...s, ...patch } : s)),
      };
    });

  const save = (next: boolean) => {
    if (!editable) return;
    const d = pauseTimer(draftRef.current);
    const b = baseRef.current;
    const changed = !sameDraft(d, b);
    if (next && !changed) {
      onNext();
      return;
    }
    if (!next && !changed && d.status === 'untested') return;
    const body = buildResultBody(d, b, stepCount);
    setEdit(d);
    store.set(rcId, changed ? d : null);
    setSaving(true);
    const pending = setResult.mutateAsync({ runId, runCaseId: rcId, ...body });
    if (next) onNext();
    pending
      .then(() => {
        const stored = store.get(rcId);
        if (!stored || sameDraft(stored, d)) store.set(rcId, null);
        if (!mounted.current) return;
        // Saved: follow the server row again unless the tester typed on meanwhile.
        setEdit((cur) => (cur && !sameDraft(cur, d) ? cur : null));
        setSavedAt(Date.now());
      })
      .catch((err) => notifyError(err, `Could not save ${rc.displayId}`))
      .finally(() => {
        if (mounted.current) setSaving(false);
      });
  };

  const setStatus = (status: ExecutedStatus) => {
    if (editable) update({ status });
  };

  useImperativeHandle(ref, () => ({
    setStatus,
    save: ({ next }) => save(next),
    getDraft: () => draftRef.current,
  }));

  const resetResult = () =>
    confirmAction({
      title: `Reset ${rc.displayId} to untested?`,
      message:
        'The current result, actual result, remark, elapsed time and step results are cleared. Earlier results stay in the history.',
      confirmLabel: 'Reset',
      danger: true,
      onConfirm: () => {
        setEdit({
          status: 'untested',
          actualResult: '',
          remark: '',
          elapsedSec: 0,
          timerStartedAt: null,
          stepResults: rc.steps.map(() => ({ status: 'untested', actual: '' })),
        });
        setSaving(true);
        return setResult
          .mutateAsync({
            runId,
            runCaseId: rcId,
            status: 'untested',
            actualResult: null,
            remark: null,
            elapsedSec: null,
            ...(stepCount > 0 && { stepResults: null }),
          })
          .then(() => {
            store.set(rcId, null);
            if (mounted.current) setEdit(null);
          })
          .catch((err) => notifyError(err, `Could not reset ${rc.displayId}`))
          .finally(() => {
            if (mounted.current) setSaving(false);
          });
      },
    });

  const suggestion =
    stepCount > 0 ? suggestStatusFromSteps(draft.stepResults.map((s) => s.status)) : null;
  const stepsDone = draft.stepResults.filter((s) => s.status !== 'untested').length;
  const running = draft.timerStartedAt !== null;

  if (!editable) {
    return (
      <div className="flex flex-col gap-4">
        {stepCount > 0 && (
          <div className="flex flex-col gap-1.5">
            <FieldLabel>Steps</FieldLabel>
            <StepExecution
              steps={rc.steps}
              results={draft.stepResults}
              editable={false}
              onChange={() => undefined}
            />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <FieldLabel as="div">Result</FieldLabel>
          <ResultBadge status={rc.status} size="md" />
          {rc.elapsedSec ? (
            <span className="text-sm text-muted-foreground">
              Elapsed {formatClock(rc.elapsedSec)}
            </span>
          ) : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <FieldLabel as="div">Actual result</FieldLabel>
          <MultilineText value={rc.actualResult} />
        </div>
        <div className="flex flex-col gap-1.5">
          <FieldLabel as="div">Remark</FieldLabel>
          <MultilineText value={rc.resultRemark} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {stepCount > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <FieldLabel>Steps</FieldLabel>
            <span className="text-xs text-muted-foreground">
              {stepsDone} of {stepCount} executed
            </span>
          </div>
          <StepExecution
            steps={rc.steps}
            results={draft.stepResults}
            editable
            onChange={setStepResult}
          />
        </div>
      )}

      <div className="flex flex-col gap-2">
        <FieldLabel id={`result-label-${rcId}`}>Result</FieldLabel>
        {suggestion && suggestion !== draft.status && (
          <Alert variant="info" className="py-2">
            <Sparkles />
            <AlertDescription className="flex flex-row flex-wrap items-center gap-2 text-[13px]">
              <span>All steps executed — suggested result</span>
              <ResultBadge status={suggestion} />
              <Button
                size="sm"
                variant="secondary"
                className="h-6 px-2 text-xs"
                onClick={() => update({ status: suggestion })}
              >
                Apply
              </Button>
            </AlertDescription>
          </Alert>
        )}
        <ResultButtons
          value={draft.status === 'untested' ? null : draft.status}
          onChange={setStatus}
        />
        <p className="text-xs leading-6 text-muted-foreground">
          Keys: <Kbd>O</Kbd> OK · <Kbd>N</Kbd> NG · <Kbd>C</Kbd> OK w/ cond. · <Kbd>B</Kbd> Blocked
          · <Kbd>T</Kbd> N/T · <Kbd>A</Kbd> N/A · <Kbd>J</Kbd>/<Kbd>K</Kbd> next/previous ·{' '}
          <Kbd>Enter</Kbd> save &amp; next
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`actual-${rcId}`} className={FIELD_LABEL}>
          Actual result
        </label>
        <Textarea
          id={`actual-${rcId}`}
          rows={2}
          maxLength={20000}
          placeholder="What happened? (required for NG)"
          className="max-h-72"
          value={draft.actualResult}
          onChange={(e) => update({ actualResult: e.currentTarget.value })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`remark-${rcId}`} className={FIELD_LABEL}>
          Remark
        </label>
        <Textarea
          id={`remark-${rcId}`}
          rows={1}
          maxLength={20000}
          placeholder="Optional — e.g. reproduced 3/3 times"
          className="max-h-48 min-h-9"
          value={draft.remark}
          onChange={(e) => update({ remark: e.currentTarget.value })}
        />
      </div>

      {/* The save bar stays visible while the result form is on screen. */}
      <div className="sticky bottom-0 z-[3] -mx-5 border-t border-[#e3e6ea] bg-white px-5 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <TipButton
              label={running ? 'Pause timer' : 'Start timer'}
              variant={running ? 'default' : 'outline'}
              onClick={() =>
                setEdit((cur) => {
                  const d = cur ?? base;
                  return d.timerStartedAt === null
                    ? { ...d, timerStartedAt: Date.now() }
                    : pauseTimer(d);
                })
              }
            >
              {running ? <Pause /> : <Play />}
            </TipButton>
            <TimerDisplay draft={draft} />
            {(draft.elapsedSec > 0 || running) && (
              <TipButton
                label="Reset timer"
                variant="ghost"
                className="size-7"
                onClick={() => update({ elapsedSec: 0, timerStartedAt: null })}
              >
                <RotateCcw className="size-3.5" />
              </TipButton>
            )}
          </div>
          <div className="flex items-center gap-2">
            {savedAt !== null && !dirty ? (
              <span role="status" className="text-xs font-semibold text-success">
                <Check className="mr-0.5 inline size-3.5 align-[-2px]" aria-hidden />
                Saved
              </span>
            ) : dirty ? (
              <span role="status" className="text-xs text-muted-foreground">
                Unsaved changes
              </span>
            ) : null}
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="outline" aria-label="More result actions">
                  <Ellipsis />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top">
                <DropdownMenuItem disabled={!dirty} onSelect={() => setEdit(null)}>
                  <RotateCcw />
                  Discard changes
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  disabled={rc.status === 'untested' && !rc.actualResult && !rc.resultRemark}
                  onSelect={resetResult}
                >
                  Reset to untested…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="outline"
              onClick={() => save(false)}
              loading={saving}
              disabled={!dirty && draft.status === 'untested'}
            >
              Save
            </Button>
            <Button
              onClick={() => save(true)}
              disabled={saving && !dirty}
              title={`Save and go to the next case (Enter)${draft.status === 'untested' ? '' : ` — ${RESULT_LABELS[draft.status]}`}`}
            >
              Save &amp; next
              <ArrowRight />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

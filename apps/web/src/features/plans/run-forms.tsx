'use client';

import {
  RERUN_STATUSES,
  RESULT_LABELS,
  totalOf,
  type Judgement,
  type RerunStatus,
  type RunDTO,
} from '@tmt/shared';
import { Info } from 'lucide-react';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { JudgementBadge } from '@/components/common/badges';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { errorAt, flatResolver } from '@/lib/form-errors';
import { LabeledDivider } from '@/components/common/list-controls';
import { useRerun } from '@/lib/api/automation';
import { ApiError } from '@/lib/api/client';
import { useInvalidateReports } from '@/lib/api/reports';
import { useDuplicateRun, useUpdateRun } from '@/lib/api/runs';
import { pluralize } from '@/lib/format';
import { notifyError, notifySuccess } from '@/lib/notify';
import { cn } from '@/lib/utils';
import { EnvEditor } from './env-editor';
import {
  DateField,
  FormAlert,
  FormButtons,
  SwitchField,
  TesterField,
  TextareaField,
  TextField,
} from './form-fields';
import { JudgementToggle } from './judgement-toggle';
import {
  duplicateRunBody,
  duplicateRunDefaults,
  editRunBody,
  editRunDefaults,
  rerunBody,
  rerunDefaults,
  rerunMatching,
  validateDuplicateRun,
  validateEditRun,
  validateRerun,
  type DuplicateRunValues,
  type EditRunValues,
  type RerunValues,
} from './run-form-model';

/** Errors every run dialog maps the same way; returns false when the caller should notify. */
export function handleRunError(
  err: unknown,
  setCodeError: (message: string) => void,
  setFormError: (message: string) => void,
): boolean {
  if (!(err instanceof ApiError)) return false;
  if (err.code === 'RUN_CODE_TAKEN') {
    setCodeError('Another run in this plan uses this code');
    return true;
  }
  if (err.code === 'PLAN_LOCKED') {
    setFormError('The plan was completed in the meantime — reopen it to change its runs.');
    return true;
  }
  return false;
}

const CODE_TAKEN = { type: 'server' } as const;

interface RunFormProps {
  projectId: number;
  run: RunDTO;
  /** All runs of the plan (free code suggestions). */
  planRuns: RunDTO[];
  onDone: () => void;
}

// ------------------------------------------------------------------ edit

const editResolver = flatResolver<EditRunValues>(validateEditRun);

/** Edit a run: code, scenario, tester, date, environment, judgement and notes. */
export function EditRunForm({ projectId, run, onDone }: Omit<RunFormProps, 'planRuns'>) {
  const update = useUpdateRun(projectId);
  const invalidateReports = useInvalidateReports(projectId);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<EditRunValues>({
    defaultValues: editRunDefaults(run),
    resolver: editResolver,
  });
  const judgement = useWatch({ control: form.control, name: 'judgement' });
  const environment = useWatch({ control: form.control, name: 'environment' });
  const suggested = run.suggestedJudgement;

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      const saved = await update.mutateAsync({ runId: run.id, ...editRunBody(values) });
      invalidateReports();
      notifySuccess(`Run ${saved.code} saved.`);
      onDone();
    } catch (err) {
      const mapped = handleRunError(
        err,
        (message) => form.setError('code', { ...CODE_TAKEN, message }),
        setFormError,
      );
      if (!mapped) notifyError(err, 'Could not save the run');
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <FormAlert message={formError} title="Run not saved" />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            control={form.control}
            name="code"
            label="Run code (Test ID)"
            mono
            required
            autoFocus
          />
          <TextField control={form.control} name="scenario" label="Scenario / configuration" />
          <TesterField control={form.control} name="testerId" projectId={projectId} />
          <DateField control={form.control} name="testedDate" label="Tested date" />
        </div>

        <LabeledDivider label="Test environment" />
        <EnvEditor
          value={environment}
          onChange={(rows) =>
            form.setValue('environment', rows, {
              shouldDirty: true,
              shouldValidate: form.formState.isSubmitted,
            })
          }
          errorOf={(i, part) => errorAt(form.formState.errors, `environment.${i}.${part}`)}
        />

        <LabeledDivider label="Judgement" />
        <JudgementToggle
          label="Run judgement"
          value={judgement}
          onChange={(j) => form.setValue('judgement', j, { shouldDirty: true })}
        />
        <SuggestionLine
          suggested={suggested}
          current={judgement}
          onUse={(j) => form.setValue('judgement', j, { shouldDirty: true })}
        />
        <TextareaField control={form.control} name="judgementNote" label="Judgement explanation" />
        <TextareaField control={form.control} name="remark" label="Remark" />
        <FormButtons onCancel={onDone} submitLabel="Save run" loading={update.isPending} />
      </form>
    </Form>
  );
}

/** "Suggested from results: PASS [Use]" under the judgement buttons. */
function SuggestionLine({
  suggested,
  current,
  onUse,
}: {
  suggested: Judgement | null;
  current: Judgement | null;
  onUse: (judgement: Judgement) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Info aria-hidden className="size-4 text-primary" />
      {suggested ? (
        <div className="flex items-center gap-1.5 text-sm">
          Suggested from results: <JudgementBadge judgement={suggested} />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No suggestion yet — untested or blocked cases remain.
        </p>
      )}
      {suggested && current !== suggested && (
        <Button type="button" variant="secondary" size="sm" onClick={() => onUse(suggested)}>
          Use
        </Button>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ duplicate

const duplicateResolver = flatResolver<DuplicateRunValues>(validateDuplicateRun);

/** Same cases with fresh results — for the next configuration (another Test ID). */
export function DuplicateRunForm({ projectId, run, planRuns, onDone }: RunFormProps) {
  const duplicate = useDuplicateRun(projectId);
  const invalidateReports = useInvalidateReports(projectId);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<DuplicateRunValues>({
    defaultValues: duplicateRunDefaults(run, planRuns),
    resolver: duplicateResolver,
  });
  const environment = useWatch({ control: form.control, name: 'environment' });

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      const created = await duplicate.mutateAsync({ runId: run.id, ...duplicateRunBody(values) });
      invalidateReports();
      notifySuccess(
        `Run ${created.code} created with ${pluralize(totalOf(created.counts), 'case')}.`,
      );
      onDone();
    } catch (err) {
      const mapped = handleRunError(
        err,
        (message) => form.setError('code', { ...CODE_TAKEN, message }),
        setFormError,
      );
      if (!mapped) notifyError(err, 'Could not duplicate the run');
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Creates a run with the same {pluralize(totalOf(run.counts), 'case')} as{' '}
          <span className="font-mono font-semibold text-foreground">{run.code}</span> and fresh
          (untested) results. Update the environment for the new configuration.
        </p>
        <FormAlert message={formError} title="Run not created" />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            control={form.control}
            name="code"
            label="New run code (Test ID)"
            mono
            required
            autoFocus
          />
          <TextField control={form.control} name="scenario" label="Scenario / configuration" />
          <TesterField control={form.control} name="testerId" projectId={projectId} />
        </div>
        <LabeledDivider label="Test environment" />
        <EnvEditor
          value={environment}
          onChange={(rows) =>
            form.setValue('environment', rows, {
              shouldDirty: true,
              shouldValidate: form.formState.isSubmitted,
            })
          }
          errorOf={(i, part) => errorAt(form.formState.errors, `environment.${i}.${part}`)}
        />
        <FormButtons onCancel={onDone} submitLabel="Duplicate run" loading={duplicate.isPending} />
      </form>
    </Form>
  );
}

// ------------------------------------------------------------------ re-run

const rerunResolver = flatResolver<RerunValues>(validateRerun);

/** New run with the source run's cases whose current result is in the chosen statuses. */
export function RerunForm({ projectId, run, planRuns, onDone }: RunFormProps) {
  const rerun = useRerun(projectId);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<RerunValues>({
    defaultValues: rerunDefaults(run, planRuns),
    resolver: rerunResolver,
  });
  const statuses = useWatch({ control: form.control, name: 'statuses' });
  const copyEnvironment = useWatch({ control: form.control, name: 'copyEnvironment' });
  const environment = useWatch({ control: form.control, name: 'environment' });
  const matching = rerunMatching(statuses, run.counts);
  const statusError = errorAt(form.formState.errors, 'statuses');

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      const created = await rerun.mutateAsync({ runId: run.id, ...rerunBody(values) });
      notifySuccess(
        `Re-run ${created.code} created with ${pluralize(totalOf(created.counts), 'case')}.`,
      );
      onDone();
    } catch (err) {
      const mapped = handleRunError(
        err,
        (message) => form.setError('code', { ...CODE_TAKEN, message }),
        setFormError,
      );
      if (mapped) return;
      if (err instanceof ApiError && err.code === 'NO_CASES')
        setFormError('No case of this run currently has one of the chosen results.');
      else notifyError(err, 'Could not create the re-run');
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Creates a new run in this plan with the cases of{' '}
          <span className="font-mono font-semibold text-foreground">{run.code}</span> whose current
          result is one of the chosen ones — typically NG and Blocked after a fix.
        </p>
        <FormAlert message={formError} title="Re-run not created" />
        <div className="flex flex-col gap-1.5">
          <p id="rerun-statuses-label" className="text-sm font-medium">
            Include cases with result <span className="text-destructive">*</span>
          </p>
          <ToggleGroup
            type="multiple"
            variant="outline"
            size="sm"
            aria-labelledby="rerun-statuses-label"
            value={statuses}
            onValueChange={(v) =>
              form.setValue('statuses', v as RerunStatus[], {
                shouldValidate: form.formState.isSubmitted,
              })
            }
            className="flex-wrap gap-2"
          >
            {RERUN_STATUSES.map((s) => (
              <ToggleGroupItem
                key={s}
                value={s}
                className="flex-none rounded-full! border! px-3 data-[state=on]:font-semibold"
              >
                {s === 'untested' ? 'Untested' : RESULT_LABELS[s]} ({run.counts[s]})
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {statusError ? (
            <p className="text-xs text-destructive">{statusError}</p>
          ) : (
            <p
              className={cn(
                'text-xs',
                matching === 0 ? 'font-semibold text-warning' : 'text-muted-foreground',
              )}
            >
              {matching === 0
                ? 'No case currently has these results.'
                : `${pluralize(matching, 'case')} will be copied into the re-run.`}
            </p>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            control={form.control}
            name="code"
            label="Re-run code (Test ID)"
            mono
            required
            autoFocus
          />
          <TextField control={form.control} name="scenario" label="Scenario / configuration" />
          <TesterField control={form.control} name="testerId" projectId={projectId} />
        </div>
        <div className="flex flex-col gap-3">
          <SwitchField
            control={form.control}
            name="keepAssignees"
            label="Keep each case's assignee"
          />
          <SwitchField
            control={form.control}
            name="refreshFromLibrary"
            label="Refresh cases from the library"
            description="Off: re-test with the same steps the failure was found with. On: use the current library version."
          />
          <SwitchField
            control={form.control}
            name="copyEnvironment"
            label="Copy the environment of the source run"
          />
        </div>
        {!copyEnvironment && (
          <EnvEditor
            value={environment}
            onChange={(rows) =>
              form.setValue('environment', rows, {
                shouldDirty: true,
                shouldValidate: form.formState.isSubmitted,
              })
            }
            errorOf={(i, part) => errorAt(form.formState.errors, `environment.${i}.${part}`)}
          />
        )}
        <FormButtons
          onCancel={onDone}
          submitLabel="Create re-run"
          loading={rerun.isPending}
          disabled={matching === 0}
        />
      </form>
    </Form>
  );
}

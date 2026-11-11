'use client';

import {
  CASE_PRIORITIES,
  CASE_PRIORITY_LABELS,
  CASE_STATUS_LABELS,
  totalOf,
  type CasePriority,
  type RunDTO,
} from '@tmt/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { MonoId } from '@/components/common/mono-id';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ComboboxSelect } from '@/components/common/combobox-select';
import { errorAt, flatResolver } from '@/lib/form-errors';
import { LabeledDivider } from '@/components/common/list-controls';
import { ApiError } from '@/lib/api/client';
import { useSectionTree, useSuites } from '@/lib/api/library';
import { useMembers } from '@/lib/api/projects';
import { useInvalidateReports } from '@/lib/api/reports';
import { useCreateRun } from '@/lib/api/runs';
import { useTags } from '@/lib/api/shared-steps';
import { pluralize } from '@/lib/format';
import { notifyError, notifySuccess } from '@/lib/notify';
import { useAuth } from '@/providers/auth-provider';
import { EnvEditor } from './env-editor';
import { mergeEnvTemplate } from './env-rows';
import { DateField, FormAlert, FormButtons, TesterField, TextField } from './form-fields';
import { MultiSelect } from '@/components/common/multi-select';
import { nextFreeCode, sectionOptions, usedCodes } from './plan-utils';
import { handleRunError } from './run-forms';
import {
  CASE_STATUS_CHOICES,
  newRunBody,
  newRunDefaults,
  validateNewRun,
  type NewRunValues,
  type SelectableStatus,
} from './run-form-model';

const resolver = flatResolver<NewRunValues>(validateNewRun);

interface Props {
  projectId: number;
  planId: number;
  /** Runs already in the plan (for a free run code). */
  existingRuns: RunDTO[];
  onDone: (run?: RunDTO) => void;
}

/** New run: suite, which cases (sections, priority, tags, review status), environment, tester. */
export function NewRunForm({ projectId, planId, existingRuns, onDone }: Props) {
  const { user } = useAuth();
  const suites = useSuites(projectId);
  const members = useMembers(projectId);
  const tags = useTags(projectId);
  const create = useCreateRun(projectId);
  const invalidateReports = useInvalidateReports(projectId);
  const [formError, setFormError] = useState<string | null>(null);
  const used = useMemo(() => usedCodes(existingRuns), [existingRuns]);
  const form = useForm<NewRunValues>({ defaultValues: newRunDefaults(), resolver });
  const { getValues, setValue } = form;
  const [suiteId, priorities, caseStatuses, environment] = useWatch({
    control: form.control,
    name: ['suiteId', 'priorities', 'caseStatuses', 'environment'],
  });

  const suiteList = useMemo(() => suites.data ?? [], [suites.data]);
  const suite = suiteList.find((s) => String(s.id) === suiteId) ?? null;
  const tree = useSectionTree(projectId, suite?.id ?? null);
  const sections = useMemo(() => sectionOptions(tree.data?.sections ?? []), [tree.data]);
  const tagOptions = useMemo(
    () => (tags.data ?? []).map((t) => ({ value: t.tag, label: t.tag, hint: t.count })),
    [tags.data],
  );

  // A new suite: no section filter, its environment template, a free code with its prefix.
  const lastCodeSuggestion = useRef('');
  const chooseSuite = useCallback(
    (id: string | null) => {
      const next = suiteList.find((s) => String(s.id) === id) ?? null;
      setValue('suiteId', id, { shouldValidate: form.formState.isSubmitted });
      setValue('sectionIds', []);
      setValue('environment', mergeEnvTemplate(next?.envTemplate ?? [], getValues('environment')));
      const current = getValues('code');
      if (next && (current === '' || current === lastCodeSuggestion.current)) {
        const suggestion = nextFreeCode(`${next.prefix}_`, used);
        lastCodeSuggestion.current = suggestion;
        setValue('code', suggestion);
      }
    },
    [suiteList, setValue, getValues, used, form.formState.isSubmitted],
  );

  // Once, when the suites arrive: a project with a single suite needs no choice.
  const onlySuite = suiteList.length === 1 ? suiteList[0] : undefined;
  const preselected = useRef(false);
  useEffect(() => {
    if (preselected.current || !onlySuite) return;
    preselected.current = true;
    if (getValues('suiteId') === null) chooseSuite(String(onlySuite.id));
  }, [onlySuite, chooseSuite, getValues]);

  // Default tester = me, when I can execute in this project.
  const meCanExecute = (members.data ?? []).some(
    (m) => m.user.id === user?.id && m.role !== 'viewer',
  );
  const testerDefaulted = useRef(false);
  useEffect(() => {
    if (testerDefaulted.current || !meCanExecute || !user) return;
    testerDefaulted.current = true;
    if (getValues('testerId') === null) setValue('testerId', user.id);
  }, [meCanExecute, user, getValues, setValue]);

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      const run = await create.mutateAsync({ planId, ...newRunBody(values) });
      invalidateReports();
      notifySuccess(`Run ${run.code} created with ${pluralize(totalOf(run.counts), 'case')}.`);
      onDone(run);
    } catch (err) {
      const mapped = handleRunError(
        err,
        (message) => form.setError('code', { type: 'server', message }),
        (message) => setFormError(message.replace('change its runs', 'add runs')),
      );
      if (mapped) return;
      if (err instanceof ApiError && err.code === 'NO_CASES')
        setFormError(
          'No test cases match these filters. Widen the sections, priorities, tags or review statuses.',
        );
      else notifyError(err, 'Could not create the run');
    }
  });

  const statusError = errorAt(form.formState.errors, 'caseStatuses');

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <FormAlert message={formError} title="Run not created" />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="suiteId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Suite</FormLabel>
                <FormControl>
                  <ComboboxSelect
                    options={suiteList.map((s) => ({ value: String(s.id), label: s.name }))}
                    value={field.value}
                    onChange={chooseSuite}
                    placeholder={suites.isPending ? 'Loading suites…' : 'Choose a suite'}
                    emptyText="No suites"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <TextField
            control={form.control}
            name="code"
            label="Run code (Test ID)"
            placeholder="e.g. KR_01"
            mono
            required
          />
          <TextField
            control={form.control}
            name="scenario"
            label="Scenario / configuration"
            placeholder="e.g. AP mode · iOS"
          />
          <TesterField control={form.control} name="testerId" projectId={projectId} />
          <DateField control={form.control} name="testedDate" label="Tested date" />
        </div>

        <LabeledDivider label="Cases to include" />
        <p className="-mt-2 text-sm text-muted-foreground">
          {suite ? (
            <>
              <MonoId>{suite.prefix}</MonoId> · {pluralize(suite.caseCount, 'case')} in the suite.
              Leave a filter empty to include everything; filters are combined.
            </>
          ) : (
            'Choose a suite to filter its cases.'
          )}
        </p>
        <FormField
          control={form.control}
          name="sectionIds"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Sections</FormLabel>
              <FormControl>
                <MultiSelect
                  options={sections}
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="All sections"
                  emptyText="No sections"
                  disabled={!suite || tree.isPending}
                />
              </FormControl>
              <FormDescription>A section includes its sub-sections</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex flex-col gap-2">
          <p id="run-priority-label" className="text-sm font-medium">
            Priority
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <ToggleGroup
              type="multiple"
              variant="outline"
              size="sm"
              aria-labelledby="run-priority-label"
              value={priorities}
              onValueChange={(v) => setValue('priorities', v as CasePriority[])}
              className="flex-wrap gap-2"
            >
              {CASE_PRIORITIES.map((p) => (
                <ToggleGroupItem
                  key={p}
                  value={p}
                  className="flex-none rounded-full! border! px-3 data-[state=on]:font-semibold"
                >
                  {CASE_PRIORITY_LABELS[p]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            {priorities.length === 0 && (
              <span className="text-xs text-muted-foreground">Any priority</span>
            )}
          </div>
        </div>
        <FormField
          control={form.control}
          name="tags"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tags</FormLabel>
              <FormControl>
                <MultiSelect
                  options={tagOptions}
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="Any tag"
                  emptyText={tags.isError ? 'Tags could not be loaded' : 'No tags'}
                />
              </FormControl>
              <FormDescription>Cases with at least one of these tags</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-sm font-medium">Review status of the cases</legend>
          <p className="text-xs text-muted-foreground">Only approved (ready) cases by default</p>
          <div className="mt-1 flex flex-wrap gap-5">
            {CASE_STATUS_CHOICES.map((s) => {
              const id = `run-case-status-${s}`;
              return (
                <div key={s} className="flex items-center gap-2">
                  <Checkbox
                    id={id}
                    checked={caseStatuses.includes(s)}
                    aria-invalid={statusError ? true : undefined}
                    onCheckedChange={(checked) =>
                      setValue(
                        'caseStatuses',
                        checked
                          ? [...caseStatuses, s]
                          : caseStatuses.filter((x: SelectableStatus) => x !== s),
                        { shouldValidate: form.formState.isSubmitted },
                      )
                    }
                  />
                  <Label htmlFor={id} className="font-normal">
                    {CASE_STATUS_LABELS[s]}
                  </Label>
                </div>
              );
            })}
          </div>
          {statusError && <p className="text-xs text-destructive">{statusError}</p>}
        </fieldset>

        <LabeledDivider label="Test environment" />
        <EnvEditor
          value={environment}
          onChange={(rows) =>
            setValue('environment', rows, { shouldValidate: form.formState.isSubmitted })
          }
          errorOf={(i, part) => errorAt(form.formState.errors, `environment.${i}.${part}`)}
          emptyText={
            suite
              ? 'This suite has no environment template. Add the items you record for this configuration.'
              : 'Choose a suite — its environment template fills this list.'
          }
        />

        <FormButtons
          onCancel={() => onDone()}
          submitLabel="Create run"
          loading={create.isPending}
        />
      </form>
    </Form>
  );
}

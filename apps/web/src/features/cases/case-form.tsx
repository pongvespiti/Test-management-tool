'use client';

import {
  CASE_PRIORITIES,
  CASE_STATUS_LABELS,
  CASE_TYPES,
  formatMinutes,
  type CaseStatus,
  type CaseTemplate,
  type SectionTreeDTO,
  type SuiteDTO,
  type TestCaseDTO,
} from '@tmt/shared';
import { Info, TriangleAlert, WandSparkles } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { CasePriorityLabel } from '@/components/common/case-priority-label';
import { useSectionOptions } from '@/components/common/section-tree';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api/client';
import { useCreateCase, useFetchCase, useUpdateCase } from '@/lib/api/library';
import { useTags } from '@/lib/api/shared-steps';
import { notifyError, notifySuccess } from '@/lib/notify';
import { routes } from '@/lib/routes';
import { useProject } from '@/providers/project-provider';
import {
  changedKeys,
  EDITABLE_STATUSES,
  editorStepsToText,
  insertSharedStep,
  plainStep,
  REVIEWABLE_KEYS,
  toBody,
  toValues,
  usedSharedStepIds,
  validateCaseForm,
  type CaseBody,
  type CaseFormValues,
  type EditorStep,
} from './case-form-model';
import { ComboboxSelect } from '@/components/common/combobox-select';
import { CustomFieldInput } from './custom-field-input';
import { errorAt, flatResolver } from '@/lib/form-errors';
import { SegmentedControl } from '@/components/common/list-controls';
import { SharedStepPicker } from './shared-step-picker';
import { StepsEditor } from './steps-editor';
import { textToSteps } from './steps-text';
import { TagsInput } from './tags-input';

const resolver = flatResolver(validateCaseForm);
const TYPE_OPTIONS = CASE_TYPES.map((t) => ({ value: t, label: t }));
const TEMPLATE_OPTIONS: { value: CaseTemplate; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'steps', label: 'Steps' },
];

interface CaseFormProps {
  projectId: number;
  suite: SuiteDTO;
  tree: SectionTreeDTO | undefined;
  /** null = new case. */
  testCase: TestCaseDTO | null;
  defaultSectionId: number | null;
  onDone: (saved?: TestCaseDTO) => void;
}

/**
 * Create or edit a library test case: fields, tags, estimate, text or step-by-step template (with
 * shared steps) and the suite's custom fields. Edits are version-checked and send only the fields
 * that changed; review rules (project `requireCaseReview`) shape the status choices.
 */
function CaseForm({ projectId, suite, tree, testCase, defaultSectionId, onDone }: CaseFormProps) {
  const { project, can } = useProject();
  /** Under review rules only leads make cases ready (others submit them for review). */
  const reviewGated = project.requireCaseReview && !can('reviewCases');
  const create = useCreateCase(projectId);
  const update = useUpdateCase(projectId);
  const fetchCase = useFetchCase(projectId);
  const tagsQuery = useTags(projectId);
  const sectionOptions = useSectionOptions(tree, true);
  const typeLabelId = useId();
  const templateLabelId = useId();
  const [version, setVersion] = useState(testCase?.version);
  const [conflict, setConflict] = useState(false);
  const [initial, setInitial] = useState(() =>
    toValues(testCase, defaultSectionId, reviewGated ? 'draft' : 'ready'),
  );
  const form = useForm<CaseFormValues>({ defaultValues: initial, resolver });
  const [offer, setOffer] = useState<'toSteps' | 'toText' | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  // All fields have defaults, so the watched values are complete.
  const values = useWatch({ control: form.control }) as CaseFormValues;
  const errors = form.formState.errors;

  const initialBody = useMemo(() => toBody(initial), [initial]);
  const changed = testCase ? changedKeys(initialBody, toBody(values)) : [];
  const backToDraft =
    reviewGated &&
    !!testCase &&
    initial.status === 'ready' &&
    values.status === 'ready' &&
    changed.some((k) => REVIEWABLE_KEYS.includes(k));

  const inReview = initial.status === 'in_review';
  const statusOptions = useMemo(() => {
    const options: { value: CaseStatus; label: string; disabled: boolean }[] =
      EDITABLE_STATUSES.map((s) => ({
        value: s,
        label: CASE_STATUS_LABELS[s],
        // Choosing `ready` would need a lead (403 REVIEW_REQUIRED); keeping it is fine.
        disabled: s === 'ready' && reviewGated && initial.status !== 'ready',
      }));
    return inReview
      ? [
          { value: 'in_review' as const, label: CASE_STATUS_LABELS.in_review, disabled: true },
          ...options,
        ]
      : options;
  }, [inReview, reviewGated, initial.status]);
  const statusHint = inReview
    ? 'Decided in review'
    : reviewGated && initial.status !== 'ready'
      ? 'Ready after a lead’s review'
      : undefined;

  const tagSuggestions = useMemo(() => (tagsQuery.data ?? []).map((t) => t.tag), [tagsQuery.data]);
  const usedSharedIds = useMemo(() => usedSharedStepIds(values.steps), [values.steps]);

  const setSteps = (steps: EditorStep[]) => {
    form.setValue('steps', steps, { shouldDirty: true });
    form.clearErrors('steps');
  };

  const onSubmit = form.handleSubmit(async (v) => {
    const body = toBody(v);
    try {
      let saved: TestCaseDTO;
      if (testCase) {
        const keys = changedKeys(initialBody, body);
        if (keys.length === 0) {
          onDone();
          return;
        }
        const patch = Object.fromEntries(keys.map((k) => [k, body[k]])) as Partial<CaseBody>;
        saved = await update.mutateAsync({ caseId: testCase.id, version, ...patch });
      } else {
        saved = await create.mutateAsync({ suiteId: suite.id, ...body });
      }
      if (testCase && initial.status === 'ready' && saved.status === 'draft' && reviewGated) {
        notifySuccess(
          `${saved.displayId} saved and moved back to Draft. Submit it for review when it is ready.`,
        );
      } else {
        notifySuccess(testCase ? `${saved.displayId} saved.` : `${saved.displayId} created.`);
      }
      onDone(saved);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'VERSION_CONFLICT') setConflict(true);
      else if (err instanceof ApiError && err.code === 'CASE_CODE_TAKEN')
        form.setError('code', { message: 'Another case in this suite uses this code' });
      else if (err instanceof ApiError && err.code === 'BAD_SHARED_STEP')
        form.setError('steps', {
          message: 'A shared step no longer exists in this project — remove it and try again.',
        });
      else notifyError(err, 'Could not save the test case');
    }
  });

  const loadLatest = async () => {
    if (!testCase) return;
    try {
      const latest = await fetchCase(testCase.id);
      const next = toValues(latest, null, 'draft');
      setInitial(next);
      form.reset(next);
      setVersion(latest.version);
      setConflict(false);
      setOffer(null);
    } catch (err) {
      notifyError(err, 'Could not load the latest version');
    }
  };

  const onTemplateChange = (template: CaseTemplate) => {
    form.setValue('template', template, { shouldDirty: true });
    const hasText = values.procedure.trim() !== '' || values.expected.trim() !== '';
    if (template === 'steps') {
      if (values.steps.length === 0) {
        if (hasText) setOffer('toSteps');
        else {
          setSteps([plainStep()]);
          setOffer(null);
        }
      } else setOffer(null);
    } else {
      setOffer(values.steps.some((s) => s.kind === 'shared' || s.action.trim()) ? 'toText' : null);
    }
  };

  const convertToSteps = () => {
    const steps = textToSteps(values.procedure, values.expected);
    setSteps(steps.length > 0 ? steps.map((s) => plainStep(s.action, s.expected)) : [plainStep()]);
    setOffer(null);
  };

  const convertToText = () => {
    const text = editorStepsToText(values.steps);
    form.setValue('procedure', text.procedure, { shouldDirty: true });
    form.setValue('expected', text.expected, { shouldDirty: true });
    setOffer(null);
  };

  const estimateMinutes = Number.parseInt(values.estimate, 10);
  const textHasContent = values.procedure.trim() !== '' || values.expected.trim() !== '';

  return (
    <>
      <Form {...form}>
        <form onSubmit={onSubmit} noValidate className="flex min-w-0 flex-col gap-4">
          {conflict && (
            <Alert variant="warning">
              <TriangleAlert />
              <AlertTitle>Changed by someone else</AlertTitle>
              <AlertDescription>
                <p>
                  Another person saved this case while you were editing. Load their version to
                  continue (copy your text first if you need it), or cancel.
                </p>
                <Button
                  type="button"
                  size="sm"
                  className="mt-1 bg-warning text-white hover:bg-warning/90"
                  onClick={() => void loadLatest()}
                >
                  Load latest version
                </Button>
              </AlertDescription>
            </Alert>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="sectionId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Section</FormLabel>
                  <FormControl>
                    <ComboboxSelect
                      options={sectionOptions}
                      value={field.value}
                      onChange={(v) => field.onChange(v ?? '')}
                      searchPlaceholder="Search sections…"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Case code</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormDescription>Your own number, e.g. 3-2-1</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Title</FormLabel>
                <FormControl>
                  <Input required autoFocus {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="flex flex-wrap items-start gap-x-6 gap-y-4">
            <div className="grid gap-2">
              <span id={typeLabelId} className="text-sm leading-none font-medium">
                Type
              </span>
              <SegmentedControl
                aria-labelledby={typeLabelId}
                options={TYPE_OPTIONS}
                value={values.caseType}
                onChange={(v) => form.setValue('caseType', v, { shouldDirty: true })}
              />
            </div>
            <FormField
              control={form.control}
              name="priority"
              render={({ field }) => (
                <FormItem className="w-[160px]">
                  <FormLabel>Priority</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {CASE_PRIORITIES.map((p) => (
                        <SelectItem key={p} value={p}>
                          <CasePriorityLabel priority={p} />
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem className="w-[180px]">
                  <FormLabel>Status</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled={inReview}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {statusOptions.map((o) => (
                        <SelectItem key={o.value} value={o.value} disabled={o.disabled}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {statusHint && <FormDescription>{statusHint}</FormDescription>}
                </FormItem>
              )}
            />
          </div>
          {reviewGated && !inReview && initial.status !== 'ready' && (
            <p className="-mt-2 text-xs text-muted-foreground">
              This project reviews test cases: save the case as Draft, then use “Submit for review”.
              A lead’s approval makes it Ready.
            </p>
          )}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-12">
            <FormField
              control={form.control}
              name="tags"
              render={({ field }) => (
                <FormItem className="col-span-2 sm:col-span-5">
                  <FormLabel>Tags</FormLabel>
                  <FormControl>
                    <TagsInput
                      value={field.value}
                      onChange={field.onChange}
                      suggestions={tagSuggestions}
                      maxTags={30}
                      placeholder="e.g. smoke, wifi"
                    />
                  </FormControl>
                  <FormDescription>Enter or comma adds a tag</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="estimate"
              render={({ field }) => (
                <FormItem className="sm:col-span-3">
                  <FormLabel>Estimate</FormLabel>
                  <div className="relative">
                    <FormControl>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={100000}
                        step={1}
                        className="pr-11"
                        {...field}
                      />
                    </FormControl>
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground"
                    >
                      min
                    </span>
                  </div>
                  <FormDescription>
                    {estimateMinutes > 0 ? formatMinutes(estimateMinutes) : 'In minutes'}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="references"
              render={({ field }) => (
                <FormItem className="sm:col-span-4">
                  <FormLabel>References</FormLabel>
                  <FormControl>
                    <Input placeholder="REQ-12, ACS-345" {...field} />
                  </FormControl>
                  <FormDescription>Requirement ids, Jira keys, spec</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="precondition"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Precondition</FormLabel>
                <FormControl>
                  <Textarea rows={2} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p id={templateLabelId} className="text-sm font-medium">
                  Test steps
                </p>
                <p className="text-xs text-muted-foreground">
                  {values.template === 'text'
                    ? 'Procedure and expected result as free text (like the Excel sheets).'
                    : 'Numbered steps, each with its own expected result; testers record a result per step.'}
                </p>
              </div>
              <SegmentedControl
                aria-labelledby={templateLabelId}
                options={TEMPLATE_OPTIONS}
                value={values.template}
                onChange={onTemplateChange}
              />
            </div>
            {offer === 'toSteps' && values.template === 'steps' && (
              <Alert variant="info">
                <WandSparkles />
                <AlertDescription>
                  <p>
                    This case has its procedure as text. Numbered lines (“1.” or “1)”) can become
                    steps; expected-result lines go to the step with the same number. The text
                    version stays with the case.
                  </p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <Button type="button" size="sm" onClick={convertToSteps}>
                      Convert numbered lines to steps
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setSteps([plainStep()]);
                        setOffer(null);
                      }}
                    >
                      Start with empty steps
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            )}
            {offer === 'toText' && values.template === 'text' && (
              <Alert variant={textHasContent ? 'warning' : 'info'}>
                <Info />
                <AlertDescription>
                  <p>
                    {textHasContent
                      ? 'This case also has steps. You can replace the procedure and expected result below with the steps written as numbered lines.'
                      : 'This case has steps. Write them into the procedure and expected result as numbered lines?'}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className={textHasContent ? 'bg-warning text-white hover:bg-warning/90' : ''}
                      onClick={convertToText}
                    >
                      {textHasContent
                        ? 'Replace the text with the steps'
                        : 'Fill procedure and expected result from the steps'}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setOffer(null)}>
                      Keep the text as it is
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            )}
            {values.template === 'text' ? (
              <>
                <FormField
                  control={form.control}
                  name="procedure"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Procedure</FormLabel>
                      <FormControl>
                        <Textarea rows={3} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="expected"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Expected result</FormLabel>
                      <FormControl>
                        <Textarea rows={3} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            ) : (
              <StepsEditor
                steps={values.steps}
                onChange={(apply) => setSteps(apply(form.getValues('steps')))}
                errorFor={(i, field) => errorAt(errors, `steps.${i}.${field}`)}
                error={errorAt(errors, 'steps')}
                onInsertShared={() => setPickerOpen(true)}
                sharedStepsHref={routes.sharedSteps(projectId)}
              />
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="remark"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Remark</FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="summaryGroup"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Summary group</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormDescription>Groups cases in the report&apos;s summary table</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          {suite.fieldDefs.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              {suite.fieldDefs.map((def) => (
                <FormField
                  key={def.key}
                  control={form.control}
                  name={`custom.${def.key}`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{def.label}</FormLabel>
                      <FormControl>
                        <CustomFieldInput
                          def={def}
                          value={field.value ?? ''}
                          onChange={field.onChange}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
            </div>
          )}
          {backToDraft && (
            <Alert variant="warning">
              <TriangleAlert />
              <AlertTitle>Saving moves this case back to Draft for review</AlertTitle>
              <AlertDescription>
                The case is Ready and its content changed. A lead approves it again after you submit
                it for review.
              </AlertDescription>
            </Alert>
          )}
          <DialogFooter className="mt-1">
            <Button type="button" variant="outline" onClick={() => onDone()}>
              Cancel
            </Button>
            <Button
              type="submit"
              loading={create.isPending || update.isPending}
              disabled={conflict}
            >
              {testCase ? 'Save' : 'Create case'}
            </Button>
          </DialogFooter>
        </form>
      </Form>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-[800px]">
          <DialogHeader>
            <DialogTitle>Insert shared steps</DialogTitle>
          </DialogHeader>
          {pickerOpen && (
            <SharedStepPicker
              usedIds={usedSharedIds}
              onCancel={() => setPickerOpen(false)}
              onPick={(s) => {
                setSteps(insertSharedStep(form.getValues('steps'), s));
                setPickerOpen(false);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Create (`testCase` = null) or edit a library case; clicks outside do not close it. */
export function CaseFormDialog({
  open,
  formKey,
  onClose,
  ...props
}: Omit<CaseFormProps, 'onDone'> & {
  open: boolean;
  /** Changes on every open so the form starts fresh. */
  formKey: number;
  onClose: (saved?: TestCaseDTO) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        aria-describedby={undefined}
        className="sm:max-w-[920px]"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>
            {props.testCase
              ? `Edit ${props.testCase.displayId}`
              : `New test case · ${props.suite.name}`}
          </DialogTitle>
        </DialogHeader>
        <CaseForm key={formKey} {...props} onDone={onClose} />
      </DialogContent>
    </Dialog>
  );
}

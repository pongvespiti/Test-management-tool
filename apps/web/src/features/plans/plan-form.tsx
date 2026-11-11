'use client';

import { createPlanSchema, type PlanDTO } from '@tmt/shared';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { ReleaseSelect } from '@/components/common/release-select';
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
import { flatResolver, schemaErrors } from '@/lib/form-errors';
import { ApiError } from '@/lib/api/client';
import { useCreatePlan, useDocNoSuggestion, useUpdatePlan } from '@/lib/api/plans';
import { useReleases } from '@/lib/api/projects';
import { useTemplates } from '@/lib/api/templates';
import { toId } from '@/lib/forms';
import { notifyError, notifySuccess } from '@/lib/notify';
import { routes } from '@/lib/routes';
import { useProject } from '@/providers/project-provider';
import { templateOptions } from './plan-utils';

export interface PlanFormValues {
  docNo: string;
  title: string;
  releaseId: number | null;
  /** Select value; `'0'` = no specific template (project default at export time). */
  templateId: string;
  purpose: string;
  testMethod: string;
  judgementCriteria: string;
  rawDataPath: string;
}

export function planFormValues(
  plan: PlanDTO | null,
  defaultReleaseId: number | null = null,
): PlanFormValues {
  return {
    docNo: plan?.docNo ?? '',
    title: plan?.title ?? '',
    releaseId: plan ? (plan.release?.id ?? null) : defaultReleaseId,
    templateId: String(plan?.templateId ?? 0),
    purpose: plan?.purpose ?? '',
    testMethod: plan?.testMethod ?? '',
    judgementCriteria: plan?.judgementCriteria ?? '',
    rawDataPath: plan?.rawDataPath ?? '',
  };
}

/** Request body of the form (the built-in default template, id 0, is stored as "no template"). */
export function planBody(v: PlanFormValues) {
  return {
    docNo: v.docNo,
    title: v.title,
    releaseId: v.releaseId,
    templateId: toId(v.templateId),
    purpose: v.purpose,
    testMethod: v.testMethod,
    judgementCriteria: v.judgementCriteria,
    rawDataPath: v.rawDataPath,
  };
}

const resolver = flatResolver<PlanFormValues>((v) => schemaErrors(createPlanSchema, planBody(v)));

interface PlanFormProps {
  projectId: number;
  /** null = new plan. */
  plan: PlanDTO | null;
  /** Release preselected for a new plan. */
  defaultReleaseId?: number | null;
  onDone: (saved?: PlanDTO) => void;
}

/** Create or edit a test plan (header fields of the controlled test report). */
export function PlanForm({ projectId, plan, defaultReleaseId = null, onDone }: PlanFormProps) {
  const create = useCreatePlan(projectId);
  const update = useUpdatePlan(projectId);
  const templates = useTemplates(projectId);
  const suggestion = useDocNoSuggestion(projectId, plan === null);
  const form = useForm<PlanFormValues>({
    defaultValues: planFormValues(plan, defaultReleaseId),
    resolver,
  });

  // Prefill the suggested Doc No. once it arrives, unless the user already typed one.
  const suggested = suggestion.data?.docNo;
  const { getValues, getFieldState, setValue } = form;
  useEffect(() => {
    if (suggested && getValues('docNo') === '' && !getFieldState('docNo').isDirty)
      setValue('docNo', suggested);
  }, [suggested, getValues, getFieldState, setValue]);

  const options = useMemo(
    () => templateOptions(templates.data ?? [], plan?.templateId ?? null),
    [templates.data, plan?.templateId],
  );

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const body = planBody(values);
      const saved = plan
        ? await update.mutateAsync({ planId: plan.id, ...body })
        : await create.mutateAsync(body);
      notifySuccess(plan ? `${saved.docNo} saved.` : `Test plan ${saved.docNo} created.`);
      onDone(saved);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'DOC_NO_TAKEN')
        form.setError('docNo', { message: 'Another test plan in this project uses this Doc No.' });
      else if (err instanceof ApiError && err.code === 'PLAN_LOCKED')
        notifyError(err, 'The plan is completed');
      else notifyError(err, 'Could not save the test plan');
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="docNo"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Doc No.</FormLabel>
                <FormControl>
                  <Input className="font-mono" required {...field} />
                </FormControl>
                <FormDescription>
                  Suggested from the project pattern — use the number from document control
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="releaseId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Release</FormLabel>
                <FormControl>
                  <ReleaseSelect
                    projectId={projectId}
                    placeholder="No release"
                    value={field.value}
                    onChange={field.onChange}
                  />
                </FormControl>
                <FormDescription>Groups plans on the dashboard and in reports</FormDescription>
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
                <Input
                  placeholder="e.g. Unit operation test — ACU18BV1S"
                  required
                  autoFocus
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="purpose"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Purpose</FormLabel>
              <FormControl>
                <Textarea placeholder="To confirm …" rows={2} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="testMethod"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Test method</FormLabel>
              <FormControl>
                <Textarea rows={2} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="judgementCriteria"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Judgement criteria</FormLabel>
              <FormControl>
                <Textarea rows={2} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="rawDataPath"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Raw data path</FormLabel>
                <FormControl>
                  <Input className="font-mono" placeholder="\\server\share\raw-data" {...field} />
                </FormControl>
                <FormDescription>Folder with logs, screenshots and videos</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="templateId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Report template</FormLabel>
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={templates.isPending}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {options.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  Excel form filled when the test report is exported
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <DialogFooter className="mt-1">
          <Button type="button" variant="outline" onClick={() => onDone()}>
            Cancel
          </Button>
          <Button type="submit" loading={create.isPending || update.isPending}>
            {plan ? 'Save' : 'Create test plan'}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

/** Dialog around {@link PlanForm}: "New test plan" or "Edit <doc no.>". */
export function PlanFormDialog({
  open,
  formKey,
  plan,
  defaultReleaseId = null,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** Changes on every open so the form starts fresh. */
  formKey: number;
  plan: PlanDTO | null;
  defaultReleaseId?: number | null;
  onClose: () => void;
  onSaved?: (plan: PlanDTO) => void;
}) {
  const { projectId } = useProject();
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        aria-describedby={undefined}
        className="sm:max-w-[780px]"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{plan ? `Edit ${plan.docNo}` : 'New test plan'}</DialogTitle>
        </DialogHeader>
        <PlanForm
          key={formKey}
          projectId={projectId}
          plan={plan}
          defaultReleaseId={defaultReleaseId}
          onDone={(saved) => {
            onClose();
            if (saved) onSaved?.(saved);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

/** "New test plan" dialog; opens the new plan when it is created. */
export function NewPlanDialog({
  open,
  formKey,
  onClose,
  releaseId,
}: {
  open: boolean;
  formKey: number;
  onClose: () => void;
  /** Release to preselect; default = the active release (if any). */
  releaseId?: number | null;
}) {
  const { projectId } = useProject();
  const router = useRouter();
  const releases = useReleases(projectId);
  const defaultRelease = releaseId ?? releases.data?.find((r) => r.status === 'active')?.id ?? null;
  return (
    <PlanFormDialog
      open={open}
      formKey={formKey}
      plan={null}
      defaultReleaseId={defaultRelease}
      onClose={onClose}
      onSaved={(saved) => router.push(routes.plan(projectId, saved.id))}
    />
  );
}

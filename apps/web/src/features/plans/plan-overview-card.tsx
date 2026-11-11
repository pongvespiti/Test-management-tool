'use client';

import { updatePlanSchema, type PlanDTO } from '@tmt/shared';
import { Pencil } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { CopyButton } from '@/components/common/copy-button';
import { IconButton } from '@/components/common/icon-button';
import { MultilineText } from '@/components/common/multiline-text';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { SectionCard } from '@/features/reports/report-ui';
import { ApiError } from '@/lib/api/client';
import { useUpdatePlan } from '@/lib/api/plans';
import { formResolver } from '@/lib/forms';
import { notifyError, notifySuccess } from '@/lib/notify';

const overviewSchema = updatePlanSchema.pick({
  purpose: true,
  testMethod: true,
  judgementCriteria: true,
  rawDataPath: true,
});

function valuesOf(plan: PlanDTO) {
  return {
    purpose: plan.purpose ?? '',
    testMethod: plan.testMethod ?? '',
    judgementCriteria: plan.judgementCriteria ?? '',
    rawDataPath: plan.rawDataPath ?? '',
  };
}

const TEXT_FIELDS = [
  { name: 'purpose', label: 'Purpose' },
  { name: 'testMethod', label: 'Test method' },
  { name: 'judgementCriteria', label: 'Judgement criteria' },
] as const;

interface Props {
  plan: PlanDTO;
  projectId: number;
  /** Tester or lead and the plan is not completed. */
  editable: boolean;
  /** Why editing is off (tooltip), when the user could edit otherwise. */
  lockedReason?: string;
}

/** Purpose, test method, judgement criteria and raw data path — edited in place. */
export function PlanOverviewCard({ plan, projectId, editable, lockedReason }: Props) {
  const [editing, setEditing] = useState(false);
  const update = useUpdatePlan(projectId);
  const form = useForm({ resolver: formResolver(overviewSchema), defaultValues: valuesOf(plan) });

  const startEditing = () => {
    form.reset(valuesOf(plan));
    setEditing(true);
  };

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await update.mutateAsync({ planId: plan.id, ...values });
      notifySuccess('Test overview saved.');
      setEditing(false);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'PLAN_LOCKED') {
        notifyError(err, 'The plan was completed');
        setEditing(false);
      } else notifyError(err, 'Could not save the test overview');
    }
  });

  const editButton = editing ? null : editable ? (
    <IconButton label="Edit test overview" onClick={startEditing}>
      <Pencil />
    </IconButton>
  ) : lockedReason ? (
    <IconButton label={`Edit test overview: ${lockedReason}`} disabled>
      <Pencil />
    </IconButton>
  ) : null;

  return (
    <SectionCard title="Test overview" actions={editButton} className="h-full">
      {editing ? (
        <Form {...form}>
          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
            {TEXT_FIELDS.map((f, i) => (
              <FormField
                key={f.name}
                control={form.control}
                name={f.name}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{f.label}</FormLabel>
                    <FormControl>
                      <Textarea rows={2} autoFocus={i === 0} {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
            <FormField
              control={form.control}
              name="rawDataPath"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Raw data path</FormLabel>
                  <FormControl>
                    <Input
                      className="font-mono"
                      placeholder="\\server\share\raw-data"
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={update.isPending} disabled={!form.formState.isDirty}>
                Save
              </Button>
            </div>
          </form>
        </Form>
      ) : (
        <dl className="m-0 grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-[minmax(110px,160px)_minmax(0,1fr)] sm:gap-y-3">
          <Term>Purpose</Term>
          <Detail>
            <MultilineText value={plan.purpose} empty="Not set" />
          </Detail>
          <Term>Test method</Term>
          <Detail>
            <MultilineText value={plan.testMethod} empty="Not set" />
          </Detail>
          <Term>Judgement criteria</Term>
          <Detail>
            <MultilineText value={plan.judgementCriteria} empty="Not set" />
          </Detail>
          <Term>Raw data</Term>
          <Detail>
            {plan.rawDataPath ? (
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-auto rounded-md bg-muted px-2.5 py-1.5 font-mono text-xs whitespace-pre-wrap [overflow-wrap:anywhere]">
                  {plan.rawDataPath}
                </code>
                <CopyButton value={plan.rawDataPath} label="Copy path" />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Not set</p>
            )}
          </Detail>
        </dl>
      )}
    </SectionCard>
  );
}

function Term({ children }: { children: ReactNode }) {
  return <dt className="text-sm font-semibold text-muted-foreground">{children}</dt>;
}

function Detail({ children }: { children: ReactNode }) {
  return <dd className="m-0 mb-3 min-w-0 sm:mb-0">{children}</dd>;
}

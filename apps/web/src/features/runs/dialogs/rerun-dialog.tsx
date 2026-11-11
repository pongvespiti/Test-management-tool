'use client';

import {
  RERUN_STATUSES,
  RESULT_LABELS,
  rerunSchema,
  type RerunStatus,
  type RunDTO,
} from '@tmt/shared';
import { TriangleAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import type { z } from 'zod';
import { UserSelect } from '@/components/common/user-select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Switch } from '@/components/ui/switch';
import { useRerun } from '@/lib/api/automation';
import { ApiError } from '@/lib/api/client';
import { pluralize } from '@/lib/format';
import { formResolver } from '@/lib/forms';
import { notifyError, notifySuccess } from '@/lib/notify';
import { routes } from '@/lib/routes';
import { useProject } from '@/providers/project-provider';
import { statusLabelOf, suggestRerunCode } from '../run-cases';

type RerunValues = z.input<typeof rerunSchema>;
type SwitchName = 'copyEnvironment' | 'keepAssignees' | 'refreshFromLibrary';

/** Statuses picked by default: NG and Blocked when the run has such cases. */
export function defaultRerunStatuses(run: Pick<RunDTO, 'counts'>): RerunStatus[] {
  const found = RERUN_STATUSES.filter((s) => (s === 'ng' || s === 'blocked') && run.counts[s] > 0);
  return found.length ? found : ['ng', 'blocked'];
}

function RerunForm({ run, onDone }: { run: RunDTO; onDone: () => void }) {
  const { projectId } = useProject();
  const router = useRouter();
  const rerun = useRerun(projectId);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<RerunValues, unknown, z.output<typeof rerunSchema>>({
    resolver: formResolver(rerunSchema),
    defaultValues: {
      code: suggestRerunCode(run.code),
      scenario: run.scenario ?? '',
      statuses: defaultRerunStatuses(run),
      copyEnvironment: true,
      testerId: run.tester?.id ?? null,
      keepAssignees: true,
      refreshFromLibrary: false,
    },
  });
  const statuses = useWatch({ control: form.control, name: 'statuses' }) ?? [];
  const picked = statuses.reduce((n, s) => n + run.counts[s], 0);

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      const created = await rerun.mutateAsync({ runId: run.id, ...values });
      notifySuccess(`Re-run ${created.code} created.`);
      onDone();
      router.push(routes.run(projectId, created.id));
    } catch (err) {
      if (err instanceof ApiError && err.code === 'RUN_CODE_TAKEN')
        form.setError('code', { message: 'Another run of this plan uses this Test ID' });
      else if (err instanceof ApiError && err.code === 'NO_CASES') setFormError(err.message);
      else notifyError(err, 'Could not create the re-run');
    }
  });

  const toggle = (name: SwitchName, label: string, description?: string) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem className="flex flex-row items-start gap-3">
          <FormControl>
            <Switch checked={field.value ?? false} onCheckedChange={field.onChange} />
          </FormControl>
          <div className="grid gap-1">
            <FormLabel className="font-normal">{label}</FormLabel>
            {description && <FormDescription>{description}</FormDescription>}
          </div>
        </FormItem>
      )}
    />
  );

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {formError && (
          <Alert variant="warning">
            <TriangleAlert />
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="code"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Test ID of the re-run</FormLabel>
                <FormControl>
                  <Input className="font-mono" required autoFocus {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="scenario"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Scenario</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="statuses"
          render={({ field }) => (
            <FormItem>
              <p id="rerun-statuses" className="text-sm font-medium">
                Cases with these current results
              </p>
              <FormDescription>{pluralize(picked, 'case')} will be in the re-run</FormDescription>
              <div
                role="group"
                aria-labelledby="rerun-statuses"
                className="mt-1 flex flex-wrap gap-x-4 gap-y-2"
              >
                {RERUN_STATUSES.map((s) => {
                  const value = field.value ?? [];
                  const label = `${statusLabelOf(s, RESULT_LABELS)} (${run.counts[s]})`;
                  return (
                    <label key={s} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        aria-label={label}
                        checked={value.includes(s)}
                        onCheckedChange={(c) =>
                          field.onChange(
                            c === true
                              ? RERUN_STATUSES.filter((x) => x === s || value.includes(x))
                              : value.filter((x) => x !== s),
                          )
                        }
                      />
                      {label}
                    </label>
                  );
                })}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="testerId"
          render={({ field }) => (
            <FormItem className="sm:w-80">
              <FormLabel>Tester</FormLabel>
              <FormControl>
                <UserSelect
                  projectId={projectId}
                  placeholder="Not set"
                  value={typeof field.value === 'number' ? field.value : null}
                  onChange={field.onChange}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex flex-col gap-3">
          {toggle(
            'copyEnvironment',
            'Copy the environment of this run',
            "Turn off to start with the suite's empty environment template",
          )}
          {toggle('keepAssignees', 'Keep case assignees')}
          {toggle(
            'refreshFromLibrary',
            'Refresh cases from the library',
            'Off: re-test with the same steps the failure was found with. On: take the current library version.',
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          The re-run is added to the same test plan and links back to {run.code}.
        </p>
        <DialogFooter className="mt-1">
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" loading={rerun.isPending} disabled={picked === 0}>
            Create re-run
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

/** New run in the same plan with the cases whose current result is in the chosen statuses. */
export function RerunDialog({
  open,
  run,
  onClose,
}: {
  open: boolean;
  run: RunDTO;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle>Re-run {run.code}</DialogTitle>
        </DialogHeader>
        {open && <RerunForm run={run} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

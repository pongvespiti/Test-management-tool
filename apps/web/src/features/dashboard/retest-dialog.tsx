'use client';

import { runCodeSchema, type NamedRef, type RetestCaseDTO } from '@tmt/shared';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { suggestRerunCode } from '@/features/runs/run-cases';
import { useRerun } from '@/lib/api/automation';
import { ApiError } from '@/lib/api/client';
import { formResolver } from '@/lib/forms';
import { pluralize } from '@/lib/format';
import { notifyError, notifySuccess } from '@/lib/notify';
import { routes } from '@/lib/routes';

/** Failed cases of one run to test again on the build that has the fix. */
export interface RetestTarget {
  runId: number;
  runCode: string;
  build: NamedRef;
  cases: RetestCaseDTO[];
}

const schema = z.object({ code: runCodeSchema });
type Values = z.input<typeof schema>;

function RetestForm({
  projectId,
  target,
  onDone,
}: {
  projectId: number;
  target: RetestTarget;
  onDone: () => void;
}) {
  const router = useRouter();
  const rerun = useRerun(projectId);
  const form = useForm<Values, unknown, z.output<typeof schema>>({
    resolver: formResolver(schema),
    defaultValues: { code: suggestRerunCode(target.runCode) },
  });

  const onSubmit = form.handleSubmit(async ({ code }) => {
    try {
      const created = await rerun.mutateAsync({
        runId: target.runId,
        code,
        buildId: target.build.id,
        runCaseIds: target.cases.map((c) => c.runCaseId),
        statuses: ['ng', 'blocked'],
      });
      notifySuccess(`Retest run ${created.code} created.`, `Tested on ${target.build.name}.`);
      onDone();
      router.push(routes.run(projectId, created.id));
    } catch (err) {
      if (err instanceof ApiError && err.code === 'RUN_CODE_TAKEN') {
        form.setError('code', { message: 'Another run of this plan uses this Test ID' });
      } else if (err instanceof ApiError && err.code === 'PLAN_LOCKED') {
        form.setError('code', { message: 'The plan was completed — reopen it first' });
      } else {
        notifyError(err, 'Could not create the retest run');
      }
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <FormField
          control={form.control}
          name="code"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Test ID of the retest run</FormLabel>
              <FormControl>
                <Input className="font-mono" required autoFocus {...field} />
              </FormControl>
              <FormDescription>
                Added to the same test plan, linked to {target.runCode}.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <ul className="text-sm text-muted-foreground">
          {target.cases.map((c) => (
            <li key={c.runCaseId}>
              <span className="font-mono text-foreground">{c.displayId}</span> {c.title}
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" loading={rerun.isPending}>
            Create retest run
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

/** Creates a run of the failed cases of a resolved defect on the build that contains the fix. */
export function RetestDialog({
  projectId,
  target,
  onClose,
}: {
  projectId: number;
  target: RetestTarget | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={target !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Retest on {target?.build.name}</DialogTitle>
          <DialogDescription>
            {target &&
              `${pluralize(target.cases.length, 'failed case')} of ${target.runCode} will be tested again.`}
          </DialogDescription>
        </DialogHeader>
        {target && <RetestForm projectId={projectId} target={target} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

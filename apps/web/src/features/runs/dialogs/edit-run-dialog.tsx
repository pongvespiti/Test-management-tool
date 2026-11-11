'use client';

import {
  JUDGEMENT_LABELS,
  JUDGEMENTS,
  updateRunSchema,
  type Judgement,
  type RunDTO,
} from '@tmt/shared';
import { Plus, Trash2 } from 'lucide-react';
import { useFieldArray, useForm } from 'react-hook-form';
import { DateInput } from '@/components/common/date-input';
import { IconButton } from '@/components/common/icon-button';
import { UserSelect } from '@/components/common/user-select';
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
import { useUpdateRun, type UpdateRunBody } from '@/lib/api/runs';
import { notifyError, notifySuccess } from '@/lib/notify';
import { useProject } from '@/providers/project-provider';
import { errorAt, flatResolver, schemaErrors } from '@/lib/form-errors';

export interface EditRunValues {
  code: string;
  scenario: string;
  testerId: number | null;
  testedDate: string | null;
  dueDate: string | null;
  judgement: Judgement | 'none';
  judgementNote: string;
  remark: string;
  environment: { label: string; value: string }[];
}

const NONE = 'none';

/** Request body of the form; environment rows left completely empty are dropped. */
export function editRunBody(v: EditRunValues): UpdateRunBody {
  return {
    code: v.code,
    scenario: v.scenario,
    testerId: v.testerId,
    testedDate: v.testedDate ?? '',
    dueDate: v.dueDate ?? '',
    judgement: v.judgement === NONE ? null : v.judgement,
    judgementNote: v.judgementNote,
    remark: v.remark,
    environment: v.environment.filter((e) => e.label.trim() !== '' || e.value.trim() !== ''),
  };
}

const resolver = flatResolver<EditRunValues>((v) => schemaErrors(updateRunSchema, editRunBody(v)));

function EditRunForm({ run, onDone }: { run: RunDTO; onDone: () => void }) {
  const { projectId } = useProject();
  const update = useUpdateRun(projectId);
  const form = useForm<EditRunValues>({
    resolver,
    defaultValues: {
      code: run.code,
      scenario: run.scenario ?? '',
      testerId: run.tester?.id ?? null,
      testedDate: run.testedDate,
      dueDate: run.dueDate,
      judgement: run.judgement ?? NONE,
      judgementNote: run.judgementNote ?? '',
      remark: run.remark ?? '',
      environment: run.environment.map((e) => ({ label: e.label, value: e.value })),
    },
  });
  const env = useFieldArray({ control: form.control, name: 'environment' });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const saved = await update.mutateAsync({ runId: run.id, ...editRunBody(values) });
      notifySuccess(`Run ${saved.code} saved.`);
      onDone();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'RUN_CODE_TAKEN')
        form.setError('code', { message: 'Another run of this plan uses this Test ID' });
      else notifyError(err, 'Could not save the run');
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="code"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Test ID</FormLabel>
                <FormControl>
                  <Input className="font-mono" required autoFocus {...field} />
                </FormControl>
                <FormDescription>Run code, e.g. AFW_01_KR</FormDescription>
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
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="testerId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tester</FormLabel>
                <FormControl>
                  <UserSelect
                    projectId={projectId}
                    placeholder="Not set"
                    value={field.value}
                    onChange={field.onChange}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="dueDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Due date</FormLabel>
                <FormControl>
                  <DateInput value={field.value} onChange={field.onChange} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="testedDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tested date</FormLabel>
                <FormControl>
                  <DateInput value={field.value} onChange={field.onChange} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="judgement"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Judgement</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={NONE}>No judgement yet</SelectItem>
                    {JUDGEMENTS.map((j) => (
                      <SelectItem key={j} value={j}>
                        {JUDGEMENT_LABELS[j]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  {run.suggestedJudgement
                    ? `Suggested from the results: ${JUDGEMENT_LABELS[run.suggestedJudgement]}`
                    : 'No suggestion yet (untested or blocked cases)'}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="judgementNote"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Judgement note</FormLabel>
                <FormControl>
                  <Textarea rows={1} className="min-h-9" {...field} />
                </FormControl>
                <FormDescription>Conditions or reasons for the judgement</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
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

        <fieldset className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <legend className="text-sm font-medium">Environment</legend>
            <span className="text-xs text-muted-foreground">
              Unit model, firmware, router, phone…
            </span>
          </div>
          {env.fields.length === 0 && (
            <p className="text-sm text-muted-foreground">No values yet.</p>
          )}
          {env.fields.map((row, i) => {
            const labelError = errorAt(form.formState.errors, `environment.${i}.label`);
            const valueError = errorAt(form.formState.errors, `environment.${i}.value`);
            return (
              <div key={row.id} className="flex items-start gap-2">
                <div className="flex-[0_1_40%]">
                  <Input
                    aria-label={`Environment label ${i + 1}`}
                    placeholder="Label, e.g. FW version"
                    aria-invalid={Boolean(labelError)}
                    {...form.register(`environment.${i}.label`)}
                  />
                  {labelError && <p className="mt-1 text-xs text-destructive">{labelError}</p>}
                </div>
                <div className="flex-1">
                  <Input
                    aria-label={`Environment value ${i + 1}`}
                    placeholder="Value"
                    aria-invalid={Boolean(valueError)}
                    {...form.register(`environment.${i}.value`)}
                  />
                  {valueError && <p className="mt-1 text-xs text-destructive">{valueError}</p>}
                </div>
                <IconButton
                  type="button"
                  label={`Remove environment value ${i + 1}`}
                  size="icon"
                  onClick={() => env.remove(i)}
                >
                  <Trash2 />
                </IconButton>
              </div>
            );
          })}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-fit"
            onClick={() => env.append({ label: '', value: '' })}
          >
            <Plus />
            Add value
          </Button>
        </fieldset>

        <DialogFooter className="mt-1">
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" loading={update.isPending}>
            Save
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

/** Edit the run: Test ID, scenario, tester, tested date, judgement, remark and environment. */
export function EditRunDialog({
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
      <DialogContent className="sm:max-w-[780px]" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Edit run {run.code}</DialogTitle>
        </DialogHeader>
        {open && <EditRunForm run={run} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

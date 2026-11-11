'use client';

import {
  DEFECT_PRIORITIES,
  DEFECT_PRIORITY_LABELS,
  DEFECT_SEVERITIES,
  DEFECT_SEVERITY_LABELS,
  type DefectDTO,
} from '@tmt/shared';
import { Link2 } from 'lucide-react';
import { useForm, useWatch } from 'react-hook-form';
import { BuildSelect } from '@/components/common/build-select';
import { ReleaseSelect } from '@/components/common/release-select';
import { UserSelect } from '@/components/common/user-select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
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
import { useCreateDefect, useUpdateDefect } from '@/lib/api/defects';
import { formResolver } from '@/lib/forms';
import { notifyError, notifySuccess } from '@/lib/notify';
import {
  defectFormSchema,
  defectFormValues,
  type DefectFormValues,
  type DefectPrefill,
} from './defect-model';

interface Props {
  projectId: number;
  /** null = new defect. */
  defect: DefectDTO | null;
  prefill?: DefectPrefill;
  /** Link the new defect to this run case. */
  runCaseId?: number;
  /** Shown when the run case link is set (e.g. `MBS-036 in run KR_01`). */
  linkLabel?: string;
  /** Manual Jira key field (hidden when the Jira integration manages the key). */
  showExternalKey: boolean;
  onDone: (saved?: DefectDTO) => void;
}

const idValue = (value: unknown) => (typeof value === 'number' ? value : null);

/** Create or edit a defect (severity, priority, assignee, release, reproduction details). */
export function DefectForm({
  projectId,
  defect,
  prefill,
  runCaseId,
  linkLabel,
  showExternalKey,
  onDone,
}: Props) {
  const create = useCreateDefect(projectId);
  const update = useUpdateDefect(projectId);
  const form = useForm<DefectFormValues, unknown, ReturnType<typeof defectFormSchema.parse>>({
    resolver: formResolver(defectFormSchema),
    defaultValues: defectFormValues(defect, prefill, showExternalKey),
  });

  const releaseId = useWatch({ control: form.control, name: 'releaseId' });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const saved = defect
        ? await update.mutateAsync({ defectId: defect.id, ...values })
        : await create.mutateAsync({ ...values, ...(runCaseId !== undefined && { runCaseId }) });
      notifySuccess(defect ? `${saved.key} saved.` : `${saved.key} reported.`);
      onDone(saved);
    } catch (err) {
      notifyError(err, defect ? 'Could not save the defect' : 'Could not create the defect');
    }
  });

  const text = (
    name: 'description' | 'steps' | 'expected' | 'actual' | 'environment',
    label: string,
    rows: number,
  ) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Textarea rows={rows} {...field} value={field.value ?? ''} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {linkLabel && (
          <Alert variant="info">
            <Link2 />
            <AlertDescription>The defect will be linked to {linkLabel}.</AlertDescription>
          </Alert>
        )}
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FormField
            control={form.control}
            name="severity"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Severity</FormLabel>
                <Select value={field.value ?? 'major'} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {DEFECT_SEVERITIES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {DEFECT_SEVERITY_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="priority"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Priority</FormLabel>
                <Select value={field.value ?? 'medium'} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {DEFECT_PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {DEFECT_PRIORITY_LABELS[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="assigneeId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Assignee</FormLabel>
                <FormControl>
                  <UserSelect
                    projectId={projectId}
                    placeholder="Unassigned"
                    value={idValue(field.value)}
                    onChange={field.onChange}
                  />
                </FormControl>
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
                    value={idValue(field.value)}
                    onChange={field.onChange}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {(['foundInBuildId', 'fixedInBuildId'] as const).map((name) => (
            <FormField
              key={name}
              control={form.control}
              name={name}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {name === 'foundInBuildId' ? 'Found in build' : 'Fixed in build'}
                  </FormLabel>
                  <FormControl>
                    <BuildSelect
                      projectId={projectId}
                      releaseId={idValue(releaseId)}
                      value={idValue(field.value)}
                      onChange={field.onChange}
                    />
                  </FormControl>
                  <FormDescription>
                    {name === 'foundInBuildId'
                      ? 'Application build the defect was seen on'
                      : 'Build that contains the fix'}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          ))}
        </div>
        {text('description', 'Description', 2)}
        {text('steps', 'Steps to reproduce', 3)}
        <div className="grid gap-4 sm:grid-cols-2">
          {text('expected', 'Expected result', 2)}
          {text('actual', 'Actual result', 2)}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="foundIn"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Found in</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ''} />
                </FormControl>
                <FormDescription>Build / firmware / app version</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="fixedIn"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Fixed in</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ''} />
                </FormControl>
                <FormDescription>Filled when the fix is delivered</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        {text('environment', 'Environment', 2)}
        {showExternalKey && (
          <FormField
            control={form.control}
            name="externalKey"
            render={({ field }) => (
              <FormItem className="sm:w-80">
                <FormLabel>External key</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ''} />
                </FormControl>
                <FormDescription>Jira or other tracker reference, e.g. TEAM-123</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
        <div className="mt-1 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onDone()}>
            Cancel
          </Button>
          <Button type="submit" loading={create.isPending || update.isPending}>
            {defect ? 'Save' : 'Create defect'}
          </Button>
        </div>
      </form>
    </Form>
  );
}

'use client';

import {
  RELEASE_STATUS_LABELS,
  RELEASE_STATUSES,
  releaseSchema,
  type ReleaseDTO,
} from '@tmt/shared';
import { useForm } from 'react-hook-form';
import { DateInput } from '@/components/common/date-input';
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
import { useCreateRelease, useUpdateRelease } from '@/lib/api/projects';
import { formResolver } from '@/lib/forms';
import { notifyError, notifySuccess } from '@/lib/notify';

/** Release fields plus the date-order rule of the form. */
export const releaseFormSchema = releaseSchema.superRefine((v, ctx) => {
  if (v.startDate && v.endDate && v.endDate < v.startDate) {
    ctx.addIssue({
      code: 'custom',
      path: ['endDate'],
      message: 'The end date is before the start date',
    });
  }
});

function defaults(release: ReleaseDTO | null) {
  return {
    name: release?.name ?? '',
    description: release?.description ?? '',
    startDate: release?.startDate ?? null,
    endDate: release?.endDate ?? null,
    status: release?.status ?? 'planned',
  };
}

function ReleaseForm({
  projectId,
  release,
  onDone,
}: {
  projectId: number;
  release: ReleaseDTO | null;
  onDone: () => void;
}) {
  const create = useCreateRelease(projectId);
  const update = useUpdateRelease(projectId);
  const form = useForm({
    resolver: formResolver(releaseFormSchema),
    defaultValues: defaults(release),
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      if (release) await update.mutateAsync({ releaseId: release.id, ...values });
      else await create.mutateAsync(values);
      notifySuccess(release ? `Release ${values.name} saved.` : `Release ${values.name} created.`);
      onDone();
    } catch (err) {
      notifyError(err, 'Could not save the release');
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input placeholder="e.g. FW 2.4.0" required autoFocus {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea rows={2} {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="startDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Start date</FormLabel>
                <FormControl>
                  <DateInput value={field.value} onChange={field.onChange} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="endDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>End date</FormLabel>
                <FormControl>
                  <DateInput value={field.value} onChange={field.onChange} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem className="w-[200px]">
              <FormLabel>Status</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {RELEASE_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {RELEASE_STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <DialogFooter className="mt-2">
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" loading={create.isPending || update.isPending}>
            {release ? 'Save' : 'Create release'}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

/** Create (`release` = null) or edit a release. */
export function ReleaseFormDialog({
  open,
  projectId,
  release,
  formKey,
  onClose,
}: {
  open: boolean;
  projectId: number;
  release: ReleaseDTO | null;
  /** Changes on every open so the form starts fresh. */
  formKey: number;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>{release ? 'Edit release' : 'New release'}</DialogTitle>
        </DialogHeader>
        <ReleaseForm key={formKey} projectId={projectId} release={release} onDone={onClose} />
      </DialogContent>
    </Dialog>
  );
}

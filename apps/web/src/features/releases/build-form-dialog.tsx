'use client';

import { buildSchema, type BuildDTO } from '@tmt/shared';
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
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api/client';
import { useCreateBuild, useUpdateBuild } from '@/lib/api/builds';
import { formResolver } from '@/lib/forms';
import { notifyError, notifySuccess } from '@/lib/notify';

function defaults(build: BuildDTO | null) {
  return {
    name: build?.name ?? '',
    notes: build?.notes ?? '',
    builtDate: build?.builtDate ?? null,
  };
}

function BuildForm({
  projectId,
  releaseId,
  build,
  onDone,
}: {
  projectId: number;
  releaseId: number;
  build: BuildDTO | null;
  onDone: () => void;
}) {
  const create = useCreateBuild(projectId);
  const update = useUpdateBuild(projectId);
  const form = useForm({
    resolver: formResolver(buildSchema),
    defaultValues: defaults(build),
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      if (build) await update.mutateAsync({ buildId: build.id, ...values });
      else await create.mutateAsync({ releaseId, ...values });
      notifySuccess(build ? `Build ${values.name} saved.` : `Build ${values.name} added.`);
      onDone();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'BUILD_NAME_TAKEN') {
        form.setError('name', { type: 'server', message: 'This release already has this build' });
        return;
      }
      notifyError(err, 'Could not save the build');
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
              <FormLabel>Build</FormLabel>
              <FormControl>
                <Input placeholder="e.g. 1.1.7(2.0.0)" required autoFocus {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="builtDate"
          render={({ field }) => (
            <FormItem className="w-[220px]">
              <FormLabel>Build date</FormLabel>
              <FormControl>
                <DateInput value={field.value} onChange={field.onChange} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <Textarea
                  rows={2}
                  placeholder="What changed in this build (e.g. bug fixes)"
                  {...field}
                  value={field.value ?? ''}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <DialogFooter className="mt-2">
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" loading={create.isPending || update.isPending}>
            {build ? 'Save' : 'Add build'}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

/** Add (`build` = null) or edit a build of a release. */
export function BuildFormDialog({
  open,
  projectId,
  releaseId,
  build,
  formKey,
  onClose,
}: {
  open: boolean;
  projectId: number;
  releaseId: number;
  build: BuildDTO | null;
  /** Changes on every open so the form starts fresh. */
  formKey: number;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{build ? 'Edit build' : 'New build'}</DialogTitle>
        </DialogHeader>
        <BuildForm
          key={formKey}
          projectId={projectId}
          releaseId={releaseId}
          build={build}
          onDone={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}

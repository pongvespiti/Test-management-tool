'use client';

import { createSuiteSchema, type SuiteDTO } from '@tmt/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
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
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api/client';
import { useCreateSuite } from '@/lib/api/library';
import { formResolver } from '@/lib/forms';
import { notifyError, notifySuccess } from '@/lib/notify';
import { suggestPrefix } from '@/lib/slug';

/** Body of the "New suite" dialog. Fields and environment labels are edited afterwards. */
function CreateSuiteForm({
  projectId,
  onCreated,
  onCancel,
}: {
  projectId: number;
  onCreated: (suite: SuiteDTO) => void;
  onCancel: () => void;
}) {
  const create = useCreateSuite(projectId);
  const [prefixEdited, setPrefixEdited] = useState(false);
  const form = useForm({
    resolver: formResolver(createSuiteSchema),
    defaultValues: { name: '', prefix: '', description: '', topic: '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const suite = await create.mutateAsync(values);
      notifySuccess(`Suite ${suite.name} created.`);
      onCreated(suite);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'SUITE_PREFIX_TAKEN')
        form.setError('prefix', { message: 'Another suite of this project uses this prefix' });
      else notifyError(err, 'Could not create the suite');
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Modbus system test"
                    required
                    autoFocus
                    {...field}
                    onChange={(e) => {
                      const name = e.currentTarget.value;
                      field.onChange(name);
                      if (!prefixEdited) form.setValue('prefix', suggestPrefix(name));
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="prefix"
            render={({ field }) => (
              <FormItem>
                <FormLabel>ID prefix</FormLabel>
                <FormControl>
                  <Input
                    placeholder="MBS"
                    required
                    {...field}
                    onChange={(e) => {
                      setPrefixEdited(true);
                      field.onChange(e.currentTarget.value.toUpperCase());
                    }}
                  />
                </FormControl>
                <FormDescription>System ids: PREFIX-001</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="topic"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Topic</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ''} />
              </FormControl>
              <FormDescription>
                Suites of one topic are listed together (e.g. one suite per unit model). Empty = the
                suite name.
              </FormDescription>
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
        <DialogFooter className="mt-1">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" loading={create.isPending}>
            Create suite
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

/** "New suite" dialog. */
export function CreateSuiteDialog({
  open,
  formKey,
  projectId,
  onClose,
  onCreated,
}: {
  open: boolean;
  formKey: number;
  projectId: number;
  onClose: () => void;
  onCreated: (suite: SuiteDTO) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>New suite</DialogTitle>
          <DialogDescription>
            A suite is one family of test cases, usually one Excel workbook (e.g. Unit operation
            test, Modbus system test).
          </DialogDescription>
        </DialogHeader>
        <CreateSuiteForm
          key={formKey}
          projectId={projectId}
          onCancel={onClose}
          onCreated={onCreated}
        />
      </DialogContent>
    </Dialog>
  );
}

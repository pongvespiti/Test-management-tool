'use client';

import type { SuiteDTO } from '@tmt/shared';
import { Archive, ArchiveRestore, Download, Ellipsis, Trash2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { confirmAction, confirmDelete } from '@/components/common/confirm-host';
import { MonoId } from '@/components/common/mono-id';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { downloadSuiteExport, useDeleteSuite, useUpdateSuite } from '@/lib/api/library';
import { pluralize } from '@/lib/format';
import { notifyError, notifySuccess } from '@/lib/notify';
import { cn } from '@/lib/utils';
import { flatResolver } from '@/lib/form-errors';
import { EnvTemplateEditor } from './env-template-editor';
import { FieldDefsEditor } from './field-defs-editor';
import {
  savedFormValues,
  toFormValues,
  toSuiteBody,
  validateSuiteForm,
  type SuiteFormValues,
} from './suite-form';

const resolver = flatResolver(validateSuiteForm);

interface SuiteEditorProps {
  projectId: number;
  suite: SuiteDTO;
  readOnly: boolean;
  onDeleted: () => void;
}

/** Name/prefix, custom fields and environment template of one suite. Mount with `key={suite.id}`. */
export function SuiteEditor({ projectId, suite, readOnly, onDeleted }: SuiteEditorProps) {
  const update = useUpdateSuite(projectId);
  const remove = useDeleteSuite(projectId);
  const form = useForm<SuiteFormValues>({ defaultValues: toFormValues(suite), resolver });
  const dirty = form.formState.isDirty;

  const save = async (values: SuiteFormValues) => {
    try {
      await update.mutateAsync({ suiteId: suite.id, ...toSuiteBody(values) });
      form.reset(savedFormValues(values));
      notifySuccess(`Suite ${values.name} saved.`);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'SUITE_PREFIX_TAKEN')
        form.setError('prefix', { message: 'Another suite of this project uses this prefix' });
      else notifyError(err, 'Could not save the suite');
    }
  };

  const onSubmit = form.handleSubmit(async (values) => {
    const keep = new Set(values.fieldDefs.map((r) => r.key));
    const removed = suite.fieldDefs.filter((d) => !keep.has(d.key));
    if (removed.length === 0) return save(values);
    confirmAction({
      title: `Remove ${pluralize(removed.length, 'field')}?`,
      message: `Values of ${removed.map((d) => `“${d.label}”`).join(', ')} are deleted from all ${pluralize(
        suite.caseCount,
        'case',
      )} of this suite when you save.`,
      confirmLabel: 'Save and remove',
      danger: true,
      onConfirm: () => save(values),
    });
  });

  const setArchived = async (isArchived: boolean) => {
    try {
      await update.mutateAsync({ suiteId: suite.id, isArchived });
      notifySuccess(isArchived ? `Suite ${suite.name} archived.` : `Suite ${suite.name} restored.`);
    } catch (err) {
      notifyError(err, 'Could not change the suite');
    }
  };

  const onDelete = () =>
    confirmDelete(
      `suite “${suite.name}”`,
      async () => {
        try {
          await remove.mutateAsync(suite.id);
          notifySuccess(`Suite ${suite.name} deleted.`);
          onDeleted();
        } catch (err) {
          if (err instanceof ApiError && err.code === 'SUITE_IN_USE')
            notifyError(
              new Error('Test runs use this suite. Archive it instead to hide it from new plans.'),
              'Suite is in use',
            );
          else notifyError(err, 'Could not delete the suite');
        }
      },
      <span className="mt-2 block">{`Its ${pluralize(suite.caseCount, 'test case')} and sections are deleted too.`}</span>,
    );

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} noValidate className="flex min-w-0 flex-col gap-5">
        <Card className="px-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold">{suite.name}</h2>
                {suite.isArchived && <Badge variant="secondary">Archived</Badge>}
              </div>
              <p className="text-sm text-muted-foreground">
                {pluralize(suite.caseCount, 'test case')} · system ids like{' '}
                <MonoId>{`${suite.prefix}-001`}</MonoId>
              </p>
            </div>
            {/* Not modal: the items open confirmations. */}
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="icon" aria-label="More suite actions">
                  <Ellipsis />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() =>
                    void downloadSuiteExport(projectId, suite).catch((e) =>
                      notifyError(e, 'Export failed'),
                    )
                  }
                >
                  <Download />
                  Export cases (.xlsx)
                </DropdownMenuItem>
                {!readOnly && (
                  <>
                    <DropdownMenuItem onSelect={() => void setArchived(!suite.isArchived)}>
                      {suite.isArchived ? <ArchiveRestore /> : <Archive />}
                      {suite.isArchived ? 'Restore suite' : 'Archive suite'}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                      <Trash2 />
                      Delete suite
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input required readOnly={readOnly} {...field} />
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
                        required
                        readOnly={readOnly}
                        {...field}
                        onChange={(e) => field.onChange(e.currentTarget.value.toUpperCase())}
                      />
                    </FormControl>
                    <FormDescription>1–10 letters/digits</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea rows={2} readOnly={readOnly} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </Card>

        <Card className="gap-1 px-5">
          <h3 className="font-semibold">Custom fields</h3>
          <p className="mb-3 text-sm text-muted-foreground">
            Extra columns of this suite&apos;s test cases. Fields marked “Show in table” appear as
            columns in the library.
          </p>
          <FieldDefsEditor form={form} readOnly={readOnly} />
        </Card>

        <Card className="gap-1 px-5">
          <h3 className="font-semibold">Environment template</h3>
          <p className="mb-3 text-sm text-muted-foreground">
            Labels a tester fills in for every test run of this suite (shown in the run header and
            the exported report).
          </p>
          <EnvTemplateEditor form={form} readOnly={readOnly} />
        </Card>

        {!readOnly && (
          <Card
            className={cn(
              'sticky bottom-4 z-[5] flex-row flex-wrap items-center justify-between gap-3 px-5 py-3',
              dirty && 'shadow-md',
            )}
          >
            <p className={cn('text-sm', dirty ? 'text-foreground' : 'text-muted-foreground')}>
              {dirty ? 'You have unsaved changes.' : 'All changes saved.'}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={!dirty}
                onClick={() => form.reset()}
              >
                Discard
              </Button>
              <Button type="submit" disabled={!dirty} loading={update.isPending}>
                Save suite
              </Button>
            </div>
          </Card>
        )}
      </form>
    </Form>
  );
}

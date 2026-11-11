'use client';

import { createSectionSchema, type SectionNode, type SectionTreeDTO } from '@tmt/shared';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useSectionOptions } from '@/components/common/section-tree';
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
import { useCreateSection, useUpdateSection } from '@/lib/api/library';
import { formResolver, toId } from '@/lib/forms';
import { notifyError, notifySuccess } from '@/lib/notify';
import { ComboboxSelect } from '@/components/common/combobox-select';

export type SectionDialog =
  { mode: 'create'; parentId: number | null } | { mode: 'edit'; node: SectionNode };

/** The node and all its descendants (a section cannot move below itself). */
export function descendantIds(node: SectionNode, out = new Set<number>()): Set<number> {
  out.add(node.id);
  node.children.forEach((c) => descendantIds(c, out));
  return out;
}

interface SectionFormProps {
  projectId: number;
  suiteId: number;
  tree: SectionTreeDTO;
  dialog: SectionDialog;
  onDone: (section?: SectionNode) => void;
}

/** Create a (sub-)section or rename/move one. */
function SectionForm({ projectId, suiteId, tree, dialog, onDone }: SectionFormProps) {
  const create = useCreateSection(projectId);
  const update = useUpdateSection(projectId);
  const editing = dialog.mode === 'edit' ? dialog.node : null;
  const allOptions = useSectionOptions(tree, true);
  const parentOptions = useMemo(() => {
    const blocked = editing ? descendantIds(editing) : new Set<number>();
    return allOptions
      .filter((o) => !blocked.has(Number(o.value)))
      .map((o) => (o.value === '' ? { ...o, label: '(Top level)' } : o));
  }, [allOptions, editing]);

  const form = useForm({
    resolver: formResolver(createSectionSchema),
    defaultValues: {
      name: editing?.name ?? '',
      code: editing?.code ?? '',
      parentId: editing ? editing.parentId : dialog.mode === 'create' ? dialog.parentId : null,
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const section = editing
        ? await update.mutateAsync({ sectionId: editing.id, ...values })
        : await create.mutateAsync({ suiteId, ...values });
      notifySuccess(editing ? `Section ${values.name} saved.` : `Section ${values.name} created.`);
      onDone(section);
    } catch (err) {
      notifyError(err, 'Could not save the section');
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
                  <Input required autoFocus {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="code"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Code</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ''} />
                </FormControl>
                <FormDescription>Optional, e.g. 3.2 or A-01</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="parentId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Parent section</FormLabel>
              <FormControl>
                <ComboboxSelect
                  options={parentOptions}
                  value={
                    field.value === null || field.value === undefined ? '' : String(field.value)
                  }
                  onChange={(v) => field.onChange(toId(v))}
                  searchPlaceholder="Search sections…"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <DialogFooter className="mt-1">
          <Button type="button" variant="outline" onClick={() => onDone()}>
            Cancel
          </Button>
          <Button type="submit" loading={create.isPending || update.isPending}>
            {editing ? 'Save' : 'Create section'}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

/** "New section" / "Edit section" dialog. */
export function SectionFormDialog({
  open,
  formKey,
  onClose,
  ...props
}: Omit<SectionFormProps, 'onDone'> & {
  open: boolean;
  formKey: number;
  onClose: (section?: SectionNode) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{props.dialog.mode === 'edit' ? 'Edit section' : 'New section'}</DialogTitle>
        </DialogHeader>
        <SectionForm key={formKey} {...props} onDone={onClose} />
      </DialogContent>
    </Dialog>
  );
}

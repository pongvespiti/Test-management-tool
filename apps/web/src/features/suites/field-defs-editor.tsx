'use client';

import type { FieldType } from '@tmt/shared';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useFieldArray, useWatch, type UseFormReturn } from 'react-hook-form';
import { IconButton } from '@/components/common/icon-button';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
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
import { slugKey } from '@/lib/slug';
import { errorAt } from '@/lib/form-errors';
import { TagsInput } from '@/features/cases/tags-input';
import {
  FIELD_TYPE_OPTIONS,
  MAX_FIELDS,
  newFieldRow,
  type FieldRow,
  type SuiteFormValues,
} from './suite-form';

/** Editor for a suite's custom fields (extra Excel columns such as "Test ID", "Register", "Value"). */
export function FieldDefsEditor({
  form,
  readOnly,
}: {
  form: UseFormReturn<SuiteFormValues>;
  readOnly: boolean;
}) {
  const { fields, append, remove, move } = useFieldArray({
    control: form.control,
    name: 'fieldDefs',
  });
  const rows = useWatch({ control: form.control, name: 'fieldDefs' }) as FieldRow[];
  const listError = errorAt(form.formState.errors, 'fieldDefs');

  /** Row errors are positional: start over after the rows moved. */
  const restructure = (change: () => void) => {
    change();
    form.clearErrors('fieldDefs');
  };

  return (
    <div className="flex flex-col gap-3">
      {fields.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No custom fields. Add fields for extra columns of your Excel sheets (e.g. Test ID,
          Register address, Setting value).
        </p>
      )}
      {fields.map((item, index) => {
        const row = rows[index] ?? item;
        const name = row.label || 'field';
        return (
          <div key={item.id} className="rounded-lg border p-3">
            <div className="flex flex-wrap items-start gap-3">
              <FormField
                control={form.control}
                name={`fieldDefs.${index}.label`}
                render={({ field }) => (
                  <FormItem className="min-w-0 flex-[2_1_200px]">
                    <FormLabel>Label</FormLabel>
                    <FormControl>
                      <Input
                        required
                        readOnly={readOnly}
                        {...field}
                        onChange={(e) => {
                          const label = e.currentTarget.value;
                          field.onChange(label);
                          if (row.isNew && !row.keyEdited) {
                            const others = rows.filter((_, i) => i !== index).map((r) => r.key);
                            form.setValue(`fieldDefs.${index}.key`, slugKey(label, others), {
                              shouldDirty: true,
                            });
                          }
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={`fieldDefs.${index}.key`}
                render={({ field }) => (
                  <FormItem className="min-w-0 flex-[1_1_150px]">
                    <FormLabel>Key</FormLabel>
                    <FormControl>
                      <Input
                        className="font-mono"
                        readOnly={readOnly || !row.isNew}
                        title={
                          row.isNew || readOnly
                            ? undefined
                            : 'The key of a saved field cannot change'
                        }
                        {...field}
                        onChange={(e) => {
                          field.onChange(e.currentTarget.value);
                          form.setValue(`fieldDefs.${index}.keyEdited`, true);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={`fieldDefs.${index}.type`}
                render={({ field }) => (
                  <FormItem className="min-w-0 flex-[1_1_150px]">
                    <FormLabel>Type</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={(v) => field.onChange(v as FieldType)}
                      disabled={readOnly}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {FIELD_TYPE_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={`fieldDefs.${index}.showInTable`}
                render={({ field }) => (
                  <FormItem className="mt-[30px] flex flex-row items-center gap-2">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={(v) => field.onChange(v === true)}
                        disabled={readOnly}
                      />
                    </FormControl>
                    <FormLabel className="font-normal">Show in table</FormLabel>
                  </FormItem>
                )}
              />
              {!readOnly && (
                <div className="mt-[26px] flex gap-0.5">
                  <IconButton
                    type="button"
                    label={`Move ${name} up`}
                    disabled={index === 0}
                    onClick={() => restructure(() => move(index, index - 1))}
                  >
                    <ArrowUp />
                  </IconButton>
                  <IconButton
                    type="button"
                    label={`Move ${name} down`}
                    disabled={index === fields.length - 1}
                    onClick={() => restructure(() => move(index, index + 1))}
                  >
                    <ArrowDown />
                  </IconButton>
                  <IconButton
                    type="button"
                    label={`Remove ${name}`}
                    tone="danger"
                    onClick={() => restructure(() => remove(index))}
                  >
                    <Trash2 />
                  </IconButton>
                </div>
              )}
            </div>
            {row.type === 'select' && (
              <FormField
                control={form.control}
                name={`fieldDefs.${index}.options`}
                render={({ field }) => (
                  <FormItem className="mt-3">
                    <FormLabel>Options</FormLabel>
                    <FormControl>
                      <TagsInput
                        value={field.value}
                        onChange={field.onChange}
                        readOnly={readOnly}
                        placeholder="Add option"
                        splitChars={[',']}
                      />
                    </FormControl>
                    <FormDescription>Press Enter after each option</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </div>
        );
      })}
      {listError && <p className="text-sm text-destructive">{listError}</p>}
      {!readOnly && (
        <Button
          type="button"
          variant="outline"
          className="w-fit"
          disabled={fields.length >= MAX_FIELDS}
          onClick={() => restructure(() => append(newFieldRow(rows.map((r) => r.key))))}
        >
          <Plus />
          Add field
        </Button>
      )}
    </div>
  );
}

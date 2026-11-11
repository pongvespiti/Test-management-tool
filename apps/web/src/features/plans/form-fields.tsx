'use client';

import { TriangleAlert } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import type { Control, FieldPath, FieldValues } from 'react-hook-form';
import { DateInput } from '@/components/common/date-input';
import { UserSelect } from '@/components/common/user-select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

interface FieldProps<V extends FieldValues> {
  control: Control<V>;
  name: FieldPath<V>;
  label: string;
  description?: ReactNode;
}

/** Single-line text field (`mono` for codes and paths). */
export function TextField<V extends FieldValues>({
  control,
  name,
  label,
  description,
  mono = false,
  ...input
}: FieldProps<V> & { mono?: boolean } & Pick<
    ComponentProps<'input'>,
    'placeholder' | 'required' | 'autoFocus'
  >) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              className={mono ? 'font-mono' : undefined}
              {...input}
              {...field}
              value={(field.value as string | null | undefined) ?? ''}
            />
          </FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/** Multi-line text field. */
export function TextareaField<V extends FieldValues>({
  control,
  name,
  label,
  description,
  rows = 2,
  placeholder,
}: FieldProps<V> & { rows?: number; placeholder?: string }) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Textarea
              rows={rows}
              placeholder={placeholder}
              {...field}
              value={(field.value as string | null | undefined) ?? ''}
            />
          </FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/** Project member who tests the run. */
export function TesterField<V extends FieldValues>({
  control,
  name,
  projectId,
  label = 'Tester',
}: Omit<FieldProps<V>, 'label'> & { projectId: number; label?: string }) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <UserSelect
              projectId={projectId}
              value={(field.value as number | null) ?? null}
              onChange={field.onChange}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/** `YYYY-MM-DD` date field. */
export function DateField<V extends FieldValues>({ control, name, label }: FieldProps<V>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <DateInput value={field.value as string | null} onChange={field.onChange} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/** On/off option with a label and an optional explanation. */
export function SwitchField<V extends FieldValues>({
  control,
  name,
  label,
  description,
}: FieldProps<V>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className="flex items-start gap-3">
          <FormControl>
            <Switch
              checked={field.value === true}
              onCheckedChange={field.onChange}
              className="mt-0.5"
            />
          </FormControl>
          <div className="grid gap-1">
            <FormLabel className="font-normal">{label}</FormLabel>
            {description && <FormDescription>{description}</FormDescription>}
          </div>
        </FormItem>
      )}
    />
  );
}

/** Orange box above a form for errors that belong to no single field. */
export function FormAlert({ message, title }: { message: string | null; title: string }) {
  if (!message) return null;
  return (
    <Alert variant="warning">
      <TriangleAlert />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

/** Cancel + submit of a dialog form. */
export function FormButtons({
  onCancel,
  submitLabel,
  loading,
  disabled,
}: {
  onCancel: () => void;
  submitLabel: string;
  loading: boolean;
  disabled?: boolean;
}) {
  return (
    <DialogFooter className="mt-1">
      <Button type="button" variant="outline" onClick={onCancel}>
        Cancel
      </Button>
      <Button type="submit" loading={loading} disabled={disabled}>
        {submitLabel}
      </Button>
    </DialogFooter>
  );
}

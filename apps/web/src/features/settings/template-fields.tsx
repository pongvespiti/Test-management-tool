'use client';

import type { SuiteDTO } from '@tmt/shared';
import { useId } from 'react';
import type { Control } from 'react-hook-form';
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
import { Textarea } from '@/components/ui/textarea';

export interface TemplateFormValues {
  name: string;
  description: string;
  /** Select value (suite id as string); null = all suites. */
  suiteId: string | null;
  runSheet: string;
  isDefault: boolean;
}

const ALL_SUITES = '__all__';

/** Error for a run sheet that is not in the workbook (only when the sheet names are known). */
export function runSheetError(runSheet: string, sheets: readonly string[] | null | undefined) {
  const name = runSheet.trim().toLowerCase();
  if (!name || !sheets || sheets.length === 0) return null;
  return sheets.some((s) => s.toLowerCase() === name)
    ? null
    : 'The workbook has no sheet with this name';
}

/** Suites a template can be made for: active ones, plus the current one when it is archived. */
export function suiteOptions(
  suites: readonly SuiteDTO[] | undefined,
  keepId: number | null = null,
) {
  return (suites ?? [])
    .filter((s) => !s.isArchived || s.id === keepId)
    .map((s) => ({ value: String(s.id), label: `${s.name} (${s.prefix})` }));
}

/** Name, suite, description and run sheet — shared by the upload and edit dialogs. */
export function TemplateFields({
  control,
  suites,
  sheets,
  keepSuiteId = null,
}: {
  control: Control<TemplateFormValues>;
  suites: readonly SuiteDTO[] | undefined;
  /** Sheet names of the workbook (suggestions for the run sheet), when known. */
  sheets: readonly string[] | null | undefined;
  keepSuiteId?: number | null;
}) {
  const sheetListId = useId();
  const sheetList = sheets && sheets.length > 0 ? sheets : null;
  const options = suiteOptions(suites, keepSuiteId);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          control={control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input placeholder="Test report (controlled form)" required {...field} />
              </FormControl>
              <FormDescription>Shown when choosing a template for an export</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="suiteId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Suite</FormLabel>
              <Select
                value={field.value ?? ALL_SUITES}
                onValueChange={(v) => field.onChange(v === ALL_SUITES ? null : v)}
              >
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="All suites" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value={ALL_SUITES}>All suites</SelectItem>
                  {options.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>Optional — for a form made for one suite</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <FormField
        control={control}
        name="description"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Description</FormLabel>
            <FormControl>
              <Textarea
                placeholder="Which document / revision of the controlled form this is"
                rows={2}
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name="runSheet"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Run sheet</FormLabel>
            <FormControl>
              {/* Free text with the workbook's sheet names as suggestions. */}
              <Input
                className="font-mono"
                placeholder={sheetList ? 'Choose or type a sheet name' : 'e.g. RUN'}
                list={sheetList ? sheetListId : undefined}
                autoComplete="off"
                {...field}
              />
            </FormControl>
            {sheetList && (
              <datalist id={sheetListId}>
                {sheetList.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            )}
            <FormDescription>
              {sheetList
                ? `Copied once per test run and renamed to the run code. Sheets in this workbook: ${sheetList.join(', ')}`
                : 'Copied once per test run and renamed to the run code. Leave empty when the form has no per-run sheet.'}
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}

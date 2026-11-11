'use client';

import { ArrowDown, ArrowUp, ClipboardPaste, Plus, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';
import { useFieldArray, useWatch, type UseFormReturn } from 'react-hook-form';
import { IconButton } from '@/components/common/icon-button';
import { Button } from '@/components/ui/button';
import { FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { errorAt } from '@/lib/form-errors';
import { MAX_LABELS, mergeEnvLabels, type EnvRow, type SuiteFormValues } from './suite-form';

/** Ordered environment labels (device models, FW versions …) that every run of the suite asks for. */
export function EnvTemplateEditor({
  form,
  readOnly,
}: {
  form: UseFormReturn<SuiteFormValues>;
  readOnly: boolean;
}) {
  const { fields, append, remove, move, replace } = useFieldArray({
    control: form.control,
    name: 'envTemplate',
  });
  const rows = useWatch({ control: form.control, name: 'envTemplate' }) as EnvRow[];
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasted, setPasted] = useState('');
  const pasteId = useId();
  const full = fields.length >= MAX_LABELS;
  const listError = errorAt(form.formState.errors, 'envTemplate');

  /** Row errors are positional: start over after the rows moved. */
  const restructure = (change: () => void) => {
    change();
    form.clearErrors('envTemplate');
  };

  return (
    <div className="flex flex-col gap-2">
      {fields.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No environment labels. Add the items your reports list under “Test environment”, e.g.
          Indoor unit model, Adapter FW version, Modbus master.
        </p>
      )}
      {fields.map((item, index) => {
        const name = rows[index]?.label || 'label';
        return (
          <div key={item.id} className="flex items-start gap-2">
            <span
              aria-hidden
              className="mt-2 w-7 shrink-0 text-right text-sm text-muted-foreground"
            >
              {index + 1}.
            </span>
            <FormField
              control={form.control}
              name={`envTemplate.${index}.label`}
              render={({ field }) => (
                <FormItem className="min-w-0 flex-1 gap-1">
                  <FormControl>
                    <Input
                      aria-label={`Environment label ${index + 1}`}
                      readOnly={readOnly}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {!readOnly && (
              <div className="mt-0.5 flex shrink-0 gap-0.5">
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
        );
      })}
      {listError && <p className="text-sm text-destructive">{listError}</p>}
      {!readOnly && (
        <div className="mt-1 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={full}
            onClick={() => restructure(() => append({ label: '' }))}
          >
            <Plus />
            Add label
          </Button>
          <Popover open={pasteOpen} onOpenChange={setPasteOpen}>
            <PopoverTrigger asChild>
              <Button type="button" variant="ghost" className="text-primary" disabled={full}>
                <ClipboardPaste />
                Paste a list…
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[360px]">
              <div className="flex flex-col gap-2">
                <Label htmlFor={pasteId}>One label per line</Label>
                <Textarea
                  id={pasteId}
                  aria-describedby={`${pasteId}-description`}
                  rows={6}
                  value={pasted}
                  onChange={(e) => setPasted(e.currentTarget.value)}
                  autoFocus
                />
                <p id={`${pasteId}-description`} className="text-xs text-muted-foreground">
                  Copy the label column from Excel and paste it here
                </p>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setPasteOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      restructure(() => replace(mergeEnvLabels(rows, pasted.split(/\r?\n|\t/))));
                      setPasted('');
                      setPasteOpen(false);
                    }}
                  >
                    Add labels
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      )}
    </div>
  );
}

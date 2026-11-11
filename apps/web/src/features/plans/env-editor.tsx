'use client';

import { envKey, valuesFor } from '@tmt/shared';
import { Plus, Trash2 } from 'lucide-react';
import { useId } from 'react';
import { IconButton } from '@/components/common/icon-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useEnvDimensions } from '@/lib/api/env-dimensions';
import { useOptionalProject } from '@/providers/project-provider';
import { emptyEnvRow, MAX_ENV_ROWS, type EnvRow } from './env-rows';

interface EnvEditorProps {
  value: EnvRow[];
  onChange: (rows: EnvRow[]) => void;
  /** Error of a row's label / value input. */
  errorOf?: (index: number, part: 'label' | 'value') => string | undefined;
  /** Shown when there are no rows. */
  emptyText?: string;
}

const ROW = 'grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_32px] items-start gap-2';

/** Editable test environment (configuration): item name + value per line. */
export function EnvEditor({ value, onChange, errorOf, emptyText }: EnvEditorProps) {
  const update = (index: number, patch: Partial<EnvRow>) =>
    onChange(value.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  // The project's lists suggest labels and values (a value list may depend on another row).
  const listId = useId();
  const project = useOptionalProject();
  const lists = useEnvDimensions(project?.projectId ?? null).data?.dimensions ?? [];
  const suggestionsFor = (row: EnvRow): string[] => {
    const dim = lists.find((d) => envKey(d.label) === envKey(row.label));
    const parentRow = dim?.parent
      ? value.find((r) => envKey(r.label) === envKey(dim.parent!))
      : undefined;
    return valuesFor(dim, parentRow?.value.trim() || null);
  };

  return (
    <div className="flex flex-col gap-2">
      {lists.length > 0 && (
        <datalist id={`${listId}-labels`}>
          {lists.map((d) => (
            <option key={d.label} value={d.label} />
          ))}
        </datalist>
      )}
      {value.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {emptyText ??
            'No environment items. Add what you record for this configuration, e.g. unit model, adapter FW, phone and OS.'}
        </p>
      ) : (
        <div aria-hidden className={ROW}>
          <span className="text-xs font-semibold text-muted-foreground">Item</span>
          <span className="text-xs font-semibold text-muted-foreground">Value</span>
        </div>
      )}
      {value.map((row, index) => {
        const name = row.label.trim() || `item ${index + 1}`;
        const labelError = errorOf?.(index, 'label');
        const valueError = errorOf?.(index, 'value');
        return (
          <div key={row.uid} className={ROW}>
            <div>
              <Input
                aria-label={`Environment item ${index + 1}`}
                placeholder="Item"
                value={row.label}
                aria-invalid={labelError ? true : undefined}
                list={lists.length > 0 ? `${listId}-labels` : undefined}
                onChange={(e) => update(index, { label: e.currentTarget.value })}
              />
              {labelError && <p className="mt-1 text-xs text-destructive">{labelError}</p>}
            </div>
            <div>
              <Input
                aria-label={`Value of ${name}`}
                placeholder="Value"
                value={row.value}
                aria-invalid={valueError ? true : undefined}
                list={suggestionsFor(row).length > 0 ? `${listId}-${row.uid}` : undefined}
                onChange={(e) => update(index, { value: e.currentTarget.value })}
              />
              {suggestionsFor(row).length > 0 && (
                <datalist id={`${listId}-${row.uid}`}>
                  {suggestionsFor(row).map((v) => (
                    <option key={v} value={v} />
                  ))}
                </datalist>
              )}
              {valueError && <p className="mt-1 text-xs text-destructive">{valueError}</p>}
            </div>
            <IconButton
              label={`Remove ${name}`}
              tone="danger"
              className="mt-0.5"
              onClick={() => onChange(value.filter((_, i) => i !== index))}
            >
              <Trash2 />
            </IconButton>
          </div>
        );
      })}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-fit text-primary"
        disabled={value.length >= MAX_ENV_ROWS}
        onClick={() => onChange([...value, emptyEnvRow()])}
      >
        <Plus />
        Add item
      </Button>
    </div>
  );
}

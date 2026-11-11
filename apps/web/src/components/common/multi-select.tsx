'use client';

import { Check, ChevronsUpDown, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { matchLabel } from '@/components/common/combobox-select';

export interface MultiOption {
  value: string;
  /** Leading spaces indent the option in the list (tree levels); trimmed in the chips. */
  label: string;
  /** Small text at the right of the option (e.g. a count). */
  hint?: ReactNode;
}

/** Multi-select with chips in the field and an optional search box (Popover + Command). */
export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  searchable = true,
  emptyText = 'Nothing found',
  maxValues,
  disabled,
  className,
  id,
  ...aria
}: {
  options: readonly MultiOption[];
  value: readonly string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  searchable?: boolean;
  emptyText?: string;
  maxValues?: number;
  disabled?: boolean;
  className?: string;
  id?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.filter((o) => value.includes(o.value));
  const toggle = (v: string) => {
    if (value.includes(v)) onChange(value.filter((x) => x !== v));
    else if (maxValues === undefined || value.length < maxValues) onChange([...value, v]);
  };

  return (
    <div className={cn('relative', className)}>
      <Popover open={open} onOpenChange={setOpen} modal>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              'h-auto min-h-9 w-full justify-between px-3 py-1.5 font-normal',
              value.length > 0 && 'pr-14',
            )}
            {...aria}
          >
            <span className="flex min-w-0 flex-1 flex-wrap gap-1">
              {selected.length === 0 ? (
                <span className="truncate text-muted-foreground">{placeholder}</span>
              ) : (
                selected.map((o) => (
                  <Badge key={o.value} variant="secondary" className="max-w-full font-normal">
                    <span className="truncate">{o.label.trim()}</span>
                  </Badge>
                ))
              )}
            </span>
            <ChevronsUpDown className="opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-(--radix-popover-trigger-width) min-w-[240px] p-0"
        >
          <Command filter={matchLabel}>
            {searchable && <CommandInput placeholder="Search…" />}
            <CommandList>
              <CommandEmpty>{emptyText}</CommandEmpty>
              {options.map((o) => {
                const on = value.includes(o.value);
                return (
                  <CommandItem
                    key={o.value}
                    value={`opt:${o.value}`}
                    keywords={[o.label.trim()]}
                    aria-checked={on}
                    onSelect={() => toggle(o.value)}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'flex size-4 shrink-0 items-center justify-center rounded-[4px] border',
                        on ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
                      )}
                    >
                      {on && <Check className="size-3 text-current" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate whitespace-pre">{o.label}</span>
                    {o.hint !== undefined && (
                      <span className="text-xs text-muted-foreground">{o.hint}</span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value.length > 0 && !disabled && (
        <button
          type="button"
          aria-label="Clear selection"
          onClick={() => onChange([])}
          className="absolute top-1/2 right-8 flex size-6 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      )}
    </div>
  );
}

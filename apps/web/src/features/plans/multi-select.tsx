'use client';

import { Check, ChevronsUpDown } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { matchLabel } from '@/components/common/combobox-select';
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

export interface MultiOption {
  value: string;
  label: string;
  /** Indentation level in the list (section trees). */
  depth?: number;
  /** Small text at the right of the option (e.g. a count). */
  hint?: ReactNode;
}

/** Indentation per depth level (literal classes so Tailwind generates them). */
const INDENT = ['pl-2', 'pl-5', 'pl-8', 'pl-11', 'pl-14', 'pl-17'];
const MAX_CHIPS = 3;

interface MultiSelectProps {
  options: readonly MultiOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean | 'true' | 'false';
}

/** Several values from a searchable list (Popover + Command); the trigger shows them as chips. */
export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  emptyText = 'Nothing found',
  disabled,
  ...trigger
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const selected = new Set(value);
  const chosen = options.filter((o) => selected.has(o.value));
  const toggle = (v: string) =>
    onChange(selected.has(v) ? value.filter((x) => x !== v) : [...value, v]);

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="h-auto min-h-9 w-full justify-between px-3 py-1.5 font-normal"
          {...trigger}
        >
          <span className="flex min-w-0 flex-wrap items-center gap-1">
            {chosen.length === 0 ? (
              <span className="truncate text-muted-foreground">{placeholder}</span>
            ) : (
              <>
                {chosen.slice(0, MAX_CHIPS).map((o) => (
                  <Badge key={o.value} variant="secondary" className="max-w-[220px] font-normal">
                    <span className="truncate">{o.label}</span>
                  </Badge>
                ))}
                {chosen.length > MAX_CHIPS && (
                  <Badge variant="outline" className="font-normal">
                    +{chosen.length - MAX_CHIPS}
                  </Badge>
                )}
              </>
            )}
          </span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-[240px] p-0">
        <Command filter={matchLabel}>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            {value.length > 0 && (
              <CommandItem
                value="clear:"
                keywords={['Clear selection']}
                onSelect={() => onChange([])}
              >
                <span className="text-muted-foreground">Clear selection</span>
              </CommandItem>
            )}
            {options.map((o) => (
              <CommandItem
                key={o.value}
                value={`opt:${o.value}`}
                keywords={[o.label]}
                onSelect={() => toggle(o.value)}
                className={INDENT[Math.min(o.depth ?? 0, INDENT.length - 1)]}
              >
                <Check
                  className={cn('shrink-0', selected.has(o.value) ? 'opacity-100' : 'opacity-0')}
                />
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {o.hint !== undefined && (
                  <span className="text-xs text-muted-foreground">{o.hint}</span>
                )}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

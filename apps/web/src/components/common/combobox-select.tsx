'use client';

import { Check, ChevronsUpDown } from 'lucide-react';
import { useState, type ReactNode } from 'react';
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

export interface ComboOption {
  value: string;
  label: string;
  disabled?: boolean;
  /** Rendered instead of the label (list and button). */
  content?: ReactNode;
  /** Small text at the right of the option (e.g. a count). */
  hint?: ReactNode;
}

/** Case-insensitive substring match on the option label (keywords), like the old selects. */
export function matchLabel(_value: string, search: string, keywords?: string[]): number {
  const needle = search.trim().toLowerCase();
  if (!needle) return 1;
  return (keywords ?? []).some((k) => k.toLowerCase().includes(needle)) ? 1 : 0;
}

interface ComboboxSelectProps {
  options: readonly ComboOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  /** Adds a first item with this label that clears the value (e.g. "All tags"). */
  clearLabel?: string;
  /** Shows a search box above the options. */
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyText?: string;
  icon?: ReactNode;
  disabled?: boolean;
  className?: string;
  id?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean | 'true' | 'false';
}

/** Select with an optional search box (Popover + Command), for long or filterable lists. */
export function ComboboxSelect({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  clearLabel,
  searchable = true,
  searchPlaceholder = 'Search…',
  emptyText = 'Nothing found',
  icon,
  disabled,
  className,
  ...trigger
}: ComboboxSelectProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value) ?? null;
  const pick = (next: string | null) => {
    onChange(next);
    setOpen(false);
  };

  return (
    // `modal`: the list scrolls with the wheel also inside dialogs.
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn('w-full justify-between px-3 font-normal', className)}
          {...trigger}
        >
          <span className="flex min-w-0 items-center gap-2">
            {icon}
            {selected ? (
              (selected.content ?? <span className="truncate">{selected.label.trim()}</span>)
            ) : (
              <span className="truncate text-muted-foreground">{placeholder}</span>
            )}
          </span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-[220px] p-0">
        <Command filter={matchLabel}>
          {searchable && <CommandInput placeholder={searchPlaceholder} />}
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            {clearLabel && (
              <CommandItem value="clear:" keywords={[clearLabel]} onSelect={() => pick(null)}>
                <span className="truncate">{clearLabel}</span>
                <Check className={cn('ml-auto', value === null ? 'opacity-100' : 'opacity-0')} />
              </CommandItem>
            )}
            {options.map((o) => (
              <CommandItem
                key={o.value}
                // cmdk identifies items by value: prefixed so that '' and duplicates stay distinct.
                value={`opt:${o.value}`}
                keywords={[o.label.trim()]}
                disabled={o.disabled}
                onSelect={() => pick(o.value)}
              >
                <span className="min-w-0 flex-1 truncate whitespace-pre">
                  {o.content ?? o.label}
                </span>
                {o.hint !== undefined && (
                  <span className="text-xs text-muted-foreground">{o.hint}</span>
                )}
                <Check className={cn(o.value === value ? 'opacity-100' : 'opacity-0')} />
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

'use client';

import { ChevronDown } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface CheckOption<T extends string> {
  value: T;
  label: string;
  count?: number;
  /** Shown before the label (e.g. a colour dot). */
  icon?: ReactNode;
}

/** Coloured dot of a filter option (status colours come from lib/status). */
export function Dot({ color, outline = false }: { color: string; outline?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn('size-[9px] shrink-0 rounded-full', outline && 'border border-[#adb5bd]')}
      style={{ background: color }}
    />
  );
}

/** Compact multi-select filter: a button "Result: NG, Untested" opening a checkbox list. */
export function CheckMenu<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: {
  label: string;
  options: CheckOption<T>[];
  value: T[];
  onChange: (value: T[]) => void;
  /** Width of the dropdown. */
  className?: string;
}) {
  const id = useId();
  const summary =
    value.length === 0
      ? 'All'
      : value.length <= 2
        ? value.map((v) => options.find((o) => o.value === v)?.label ?? v).join(', ')
        : `${value.length} selected`;
  const toggle = (v: T, on: boolean) =>
    onChange(
      on
        ? options.map((o) => o.value).filter((x) => x === v || value.includes(x))
        : value.filter((x) => x !== v),
    );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          aria-label={`${label}: ${summary}`}
          className="max-w-[260px] min-w-0 gap-1 font-normal"
        >
          <span className="text-muted-foreground">{label}:</span>
          <span className="min-w-0 truncate font-semibold">{summary}</span>
          <ChevronDown className="opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className={cn('w-[230px] p-2', className)}>
        <div role="group" aria-label={label} className="flex flex-col gap-0.5">
          {options.map((o) => (
            <label
              key={o.value}
              htmlFor={`${id}-${o.value}`}
              className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-muted"
            >
              <Checkbox
                id={`${id}-${o.value}`}
                aria-label={o.label}
                checked={value.includes(o.value)}
                onCheckedChange={(c) => toggle(o.value, c === true)}
              />
              {o.icon}
              <span className="flex-1">{o.label}</span>
              {o.count !== undefined && (
                <span className="text-xs text-muted-foreground">{o.count}</span>
              )}
            </label>
          ))}
          {value.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="mt-1 h-6 w-fit px-2 text-xs"
              onClick={() => onChange([])}
            >
              Clear
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

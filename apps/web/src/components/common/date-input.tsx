'use client';

import { format, isValid, parseISO, type Locale } from 'date-fns';
import { CalendarDays, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

/** `YYYY-MM-DD` ↔ Date (local calendar day, no time zone shift). */
export function parseDateOnly(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const d = parseISO(value);
  return isValid(d) ? d : undefined;
}

export function toDateOnly(date: Date | undefined): string | null {
  return date ? format(date, 'yyyy-MM-dd') : null;
}

interface DateInputProps {
  /** `YYYY-MM-DD` or null. */
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  placeholder?: string;
  clearable?: boolean;
  disabled?: boolean;
  id?: string;
  className?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
  /** Shows the chosen day (default `Oct 21, 2026`). */
  formatValue?: (value: string) => string;
  /** date-fns locale of the calendar (month and day names). */
  locale?: Locale;
}

/** Date picker field (popover calendar) that reads and writes `YYYY-MM-DD` strings. */
export function DateInput({
  value,
  onChange,
  placeholder = 'Pick a date',
  clearable = true,
  disabled,
  id,
  className,
  formatValue = formatDate,
  locale,
  ...aria
}: DateInputProps) {
  const [open, setOpen] = useState(false);
  const selected = parseDateOnly(value);

  return (
    <div className={cn('relative', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn(
              'w-full justify-start font-normal',
              !selected && 'text-muted-foreground',
              clearable && selected && 'pr-9',
            )}
            {...aria}
          >
            <CalendarDays className="text-muted-foreground" />
            {selected && value ? formatValue(value) : placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected}
            captionLayout="dropdown"
            locale={locale}
            onSelect={(date) => {
              onChange(toDateOnly(date));
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
      {clearable && selected && !disabled && (
        <button
          type="button"
          aria-label="Clear date"
          onClick={() => onChange(null)}
          className="absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      )}
    </div>
  );
}

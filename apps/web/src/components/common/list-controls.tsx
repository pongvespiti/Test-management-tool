'use client';

import { Search, X } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { Spinner } from '@/components/common/error-alert';
import { Input } from '@/components/ui/input';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { Separator } from '@/components/ui/separator';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';

/** Small upper-case caption above a value (detail panels, step columns, side lists). */
export function FieldCaption({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        'mb-1 text-xs font-semibold tracking-[0.04em] text-muted-foreground uppercase',
        className,
      )}
    >
      {children}
    </p>
  );
}

/** Divider with a caption on the left. */
export function LabeledDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <Separator className="flex-1" />
    </div>
  );
}

/** A few mutually exclusive choices shown side by side (segmented control). */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  size = 'sm',
  className,
  ...aria
}: {
  value: T;
  onChange: (value: T) => void;
  options: readonly { value: T; label: string }[];
  size?: 'sm' | 'default';
  className?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size={size}
      value={value}
      // Clicking the active item would clear the value: a segmented control always has one.
      onValueChange={(v) => v && onChange(v as T)}
      className={cn('bg-card', className)}
      {...aria}
    >
      {options.map((o) => (
        <ToggleGroupItem
          key={o.value}
          value={o.value}
          className="px-3 data-[state=on]:font-semibold"
        >
          {o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/** Search box with a magnifier and a clear button. */
export function SearchInput({
  value,
  onValueChange,
  onClear,
  className,
  ...props
}: Omit<ComponentProps<'input'>, 'value' | 'onChange'> & {
  value: string;
  onValueChange: (value: string) => void;
  onClear?: () => void;
}) {
  return (
    <div className={cn('relative', className)}>
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        {...props}
        value={value}
        onChange={(e) => onValueChange(e.currentTarget.value)}
        className="pr-9 pl-9"
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={onClear ?? (() => onValueChange(''))}
          className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

/** Dims a list while it reloads (the previous rows stay visible). */
export function LoadingOverlay({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div aria-hidden className="absolute inset-0 z-10 flex justify-center bg-card/40 pt-8">
      <Spinner className="size-4 animate-spin text-muted-foreground" />
    </div>
  );
}

/** Blue bar above a list with the number of selected rows and the actions on them. */
export function SelectionBar({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#a5d8ff] bg-accent px-4 py-2">
      <p className="text-sm font-semibold text-accent-foreground">{label}</p>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

const range = (from: number, to: number) =>
  Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);

/** Page buttons with gaps: first/last page, the current page and its neighbours. */
export function pageRange(total: number, current: number, siblings = 1): (number | 'dots')[] {
  if (siblings * 2 + 5 >= total) return range(1, total);
  const left = Math.max(current - siblings, 1);
  const right = Math.min(current + siblings, total - 1);
  const leftDots = left > 3;
  const rightDots = right < total - 2;
  if (!leftDots) return [...range(1, siblings * 2 + 3), 'dots', total];
  if (!rightDots) return [1, 'dots', ...range(total - siblings * 2 - 2, total)];
  return [1, 'dots', ...range(left, right), 'dots', total];
}

/** Page navigation under a paged list. */
export function PagePagination({
  page,
  pages,
  onChange,
}: {
  page: number;
  pages: number;
  onChange: (page: number) => void;
}) {
  return (
    <Pagination>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious disabled={page <= 1} onClick={() => onChange(page - 1)} />
        </PaginationItem>
        {pageRange(pages, page).map((p, i) => (
          <PaginationItem key={p === 'dots' ? `dots-${i}` : p}>
            {p === 'dots' ? (
              <PaginationEllipsis />
            ) : (
              <PaginationLink
                size="icon-sm"
                isActive={p === page}
                aria-label={`Page ${p}`}
                onClick={() => onChange(p)}
              >
                {p}
              </PaginationLink>
            )}
          </PaginationItem>
        ))}
        <PaginationItem>
          <PaginationNext disabled={page >= pages} onClick={() => onChange(page + 1)} />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}

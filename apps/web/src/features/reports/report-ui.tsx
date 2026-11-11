'use client';

/**
 * Building blocks shared by the dashboard, test plan and report pages: section cards, stat tiles,
 * report loading/error states, chart cards with a table view, legends and bar lists.
 */
import { ChartColumn, Table2 } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { ErrorAlert, Spinner } from '@/components/common/error-alert';
import { Card } from '@/components/ui/card';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

// ------------------------------------------------------------------ tables & cards

/** Header cell of the compact report tables: small muted text on a subtle band. */
export const TH = 'h-9 bg-muted text-xs font-semibold text-muted-foreground';
/** Header row of the compact report tables (top hairline, no hover). */
export const HEAD_ROW = 'border-t hover:bg-transparent';

interface SectionCardProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Controls at the right of the heading (links, buttons, view toggles). */
  actions?: ReactNode;
  children: ReactNode;
  /** No body padding — tables and lists that run edge to edge. */
  flush?: boolean;
  className?: string;
}

/** White card with an `h2` heading row; tables inside run edge to edge when `flush`. */
export function SectionCard({
  title,
  subtitle,
  actions,
  children,
  flush = false,
  className,
}: SectionCardProps) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        'flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xs',
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="min-w-0">
          <h2 id={headingId} className="text-base leading-6 font-semibold">
            {title}
          </h2>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {flush ? children : <div className="px-5 pb-5">{children}</div>}
    </section>
  );
}

/** KPI tile: label, a large value and an optional footer (progress bar, breakdown …). */
export function StatTile({
  label,
  value,
  children,
}: {
  label: string;
  value: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Card className="gap-1.5 px-5 py-[18px]">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="text-[30px] leading-[38px] font-bold">{value}</p>
      {children}
    </Card>
  );
}

// ------------------------------------------------------------------ report query states

interface QueryLike {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
  isPlaceholderData?: boolean;
}

/** Dims its content while newer data loads (no layout jump). */
export function Refreshing({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <div
      aria-busy={active || undefined}
      className={cn('transition-opacity duration-150', active && 'opacity-55')}
    >
      {children}
    </div>
  );
}

/**
 * Loading / error / content for report data. While a new scope loads, the previous render stays
 * (dimmed) instead of flashing a spinner.
 */
export function ReportState({
  query,
  children,
  className = 'min-h-40',
}: {
  query: QueryLike;
  children: ReactNode;
  /** Height of the loading state (e.g. `min-h-80`). */
  className?: string;
}) {
  if (query.isPending)
    return (
      <div className={cn('flex items-center justify-center', className)}>
        <Spinner />
      </div>
    );
  if (query.isError) return <ErrorAlert error={query.error} onRetry={() => void query.refetch()} />;
  return <Refreshing active={query.isPlaceholderData === true}>{children}</Refreshing>;
}

// ------------------------------------------------------------------ legends & toggles

export interface LegendItem {
  label: string;
  color: string;
  /** Dashed outline swatch (e.g. "never run"). */
  outline?: boolean;
  /** Light fill that needs a border to be seen (e.g. "untested"). */
  bordered?: boolean;
  /** Line key instead of a box (line series). */
  line?: boolean;
}

/** Series legend (always shown for two or more series, so colour is never the only key). */
export function SeriesLegend({ items }: { items: readonly LegendItem[] }) {
  return (
    <ul aria-label="Legend" className="m-0 flex list-none flex-wrap gap-x-3.5 gap-y-1 p-0">
      {items.map((item) => (
        <li key={item.label} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className={cn(
              'inline-block box-border',
              item.line ? 'h-0.5 w-3.5 rounded-[1px]' : 'size-2.5 rounded-[3px]',
              item.outline && 'border border-dashed bg-card',
              item.bordered && !item.outline && 'border border-[#ced4da]',
            )}
            style={item.outline ? { borderColor: item.color } : { background: item.color }}
          />
          <span className="text-xs text-muted-foreground">{item.label}</span>
        </li>
      ))}
    </ul>
  );
}

export type ChartView = 'chart' | 'table';

/** Chart / table switch: every chart has a table twin with the same numbers. */
export function ViewToggle({
  value,
  onChange,
}: {
  value: ChartView;
  onChange: (view: ChartView) => void;
}) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      aria-label="View as"
      value={value}
      onValueChange={(v) => v && onChange(v as ChartView)}
      className="bg-card"
    >
      <ToggleGroupItem value="chart" className="gap-1 px-2.5 text-xs">
        <ChartColumn aria-hidden className="size-3.5" />
        Chart
      </ToggleGroupItem>
      <ToggleGroupItem value="table" className="gap-1 px-2.5 text-xs">
        <Table2 aria-hidden className="size-3.5" />
        Table
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

/** Section card holding one chart, its legend and a table view of the same data. */
export function ChartCard({
  title,
  subtitle,
  legend,
  chart,
  table,
  actions,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  legend?: ReactNode;
  chart: ReactNode;
  table: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  const [view, setView] = useState<ChartView>('chart');
  return (
    <SectionCard
      title={title}
      subtitle={subtitle}
      className={className}
      actions={
        <>
          {actions}
          <ViewToggle value={view} onChange={setView} />
        </>
      }
    >
      {view === 'chart' ? (
        <>
          {legend && <div className="mb-3">{legend}</div>}
          {chart}
        </>
      ) : (
        table
      )}
    </SectionCard>
  );
}

// ------------------------------------------------------------------ bar lists

export interface BarListItem {
  key: string;
  label: ReactNode;
  value: number;
  color: string;
  /** Muted text after the value (e.g. "(12)"). */
  note?: ReactNode;
}

/** Horizontal bars with the label left and the value at the bar tip — for short breakdowns. */
export function BarList({
  items,
  format = formatNumber,
  empty = 'Nothing to show.',
}: {
  items: readonly BarListItem[];
  format?: (value: number) => string;
  empty?: ReactNode;
}) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="m-0 grid list-none gap-2.5 p-0">
      {items.map((item) => (
        <li
          key={item.key}
          className="grid grid-cols-[minmax(90px,34%)_minmax(40px,1fr)_auto] items-center gap-3"
        >
          <div className="truncate text-sm">{item.label}</div>
          <div aria-hidden className="h-2 overflow-hidden rounded-full bg-secondary">
            <div
              className={cn('h-full rounded-full', item.value > 0 && 'min-w-[3px]')}
              style={{ width: `${(item.value / max) * 100}%`, background: item.color }}
            />
          </div>
          <p className="min-w-9 text-right text-sm font-semibold whitespace-nowrap tabular-nums">
            <span className="sr-only">: </span>
            {format(item.value)}
            {item.note && (
              <span className="ml-1 text-xs font-normal text-muted-foreground">{item.note}</span>
            )}
          </p>
        </li>
      ))}
    </ul>
  );
}

/** Coloured dot + text, used as a bar-list label (severity, status …). */
export function DotLabel({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span
        aria-hidden
        className="size-[9px] shrink-0 rounded-full"
        style={{ background: color }}
      />
      <span className="truncate">{children}</span>
    </span>
  );
}

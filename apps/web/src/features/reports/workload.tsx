'use client';

/** Workload per person (effective assignee) — table and stacked bar chart. */
import { formatMinutes, type WorkloadRowDTO } from '@tmt/shared';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import Link from 'next/link';
import { formatNumber } from '@/lib/format';
import { routes } from '@/lib/routes';
import { useProject } from '@/providers/project-provider';
import { RESULT_TONES } from '@/lib/status';
import { cn } from '@/lib/utils';
import {
  chartConfig,
  GRID_COLOR,
  meterPercent,
  personName,
  sortWorkload,
  WORKLOAD_SERIES,
  workloadRows,
} from './report-format';
import { HEAD_ROW, TH, type LegendItem } from './report-ui';

export const WORKLOAD_LEGEND: LegendItem[] = WORKLOAD_SERIES.map((s) => ({
  label: s.label,
  color: s.color,
  bordered: s.key === 'untested',
}));

const workloadConfig = chartConfig(WORKLOAD_SERIES);

/** Executed share of a person's run cases as a thin bar + number. */
function Meter({ value, total }: { value: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      <div
        aria-hidden
        className="h-1.5 w-[72px] shrink-0 overflow-hidden rounded-full"
        style={{ background: RESULT_TONES.untested.bar }}
      >
        <div className="h-full bg-primary" style={{ width: `${meterPercent(value, total)}%` }} />
      </div>
      <span className="text-sm tabular-nums">{formatNumber(value)}</span>
    </div>
  );
}

export function WorkloadTable({
  rows,
  compact = false,
}: {
  rows: WorkloadRowDTO[];
  /** Dashboard version: person, untested, remaining estimate, last 7 days. */
  compact?: boolean;
}) {
  const { projectId } = useProject();
  const sorted = sortWorkload(rows);
  const right = cn(TH, 'text-right');
  return (
    <Table className={compact ? 'min-w-[400px]' : 'min-w-[820px]'}>
      <TableHeader>
        <TableRow className={HEAD_ROW}>
          <TableHead className={cn(TH, 'pl-5')}>Person</TableHead>
          {!compact && <TableHead className={right}>Run cases</TableHead>}
          {!compact && <TableHead className={TH}>Executed</TableHead>}
          {!compact && <TableHead className={right}>NG</TableHead>}
          <TableHead className={right}>Untested</TableHead>
          <TableHead className={right} title="Sum of the estimates of the untested cases">
            {compact ? 'Est. left' : 'Est. remaining'}
          </TableHead>
          <TableHead className={cn(right, 'pr-5')} title="Results recorded in the last 7 days">
            {compact ? '7 days' : 'Last 7 days'}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody className="tabular-nums">
        {sorted.map((r) => (
          <TableRow key={r.user?.id ?? 'unassigned'}>
            <TableCell className="pl-5 whitespace-nowrap">
              {r.user ? (
                <Link
                  href={routes.myWork(projectId, { user: r.user.id })}
                  className="text-sm font-medium text-primary hover:underline"
                  title="Open this person's waiting cases and day / week summary"
                >
                  {personName(r.user)}
                </Link>
              ) : (
                <p className="text-sm text-muted-foreground">{personName(r.user)}</p>
              )}
              {compact && (
                <p className="text-xs text-muted-foreground">
                  {formatNumber(r.executed)} of {formatNumber(r.runCases)} executed
                </p>
              )}
            </TableCell>
            {!compact && <TableCell className="text-right">{formatNumber(r.runCases)}</TableCell>}
            {!compact && (
              <TableCell>
                <Meter value={r.executed} total={r.runCases} />
              </TableCell>
            )}
            {!compact && (
              <TableCell
                className={cn(
                  'text-right',
                  r.ng ? 'font-semibold text-destructive' : 'text-muted-foreground',
                )}
              >
                {formatNumber(r.ng)}
              </TableCell>
            )}
            <TableCell className="text-right font-semibold">{formatNumber(r.untested)}</TableCell>
            <TableCell className="text-right">
              {formatMinutes(r.remainingEstimateMinutes) || '—'}
            </TableCell>
            <TableCell className="pr-5 text-right">{formatNumber(r.executedLast7Days)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** One horizontal stacked bar per person: executed, NG, untested. */
export function WorkloadChart({ rows }: { rows: WorkloadRowDTO[] }) {
  const data = workloadRows(rows);
  return (
    <ChartContainer config={workloadConfig} height={Math.max(140, 48 + data.length * 40)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid horizontal={false} stroke={GRID_COLOR} />
        <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="person" width={140} tickLine={false} axisLine={false} />
        <ChartTooltip isAnimationActive={false} content={<ChartTooltipContent hideZero />} />
        {WORKLOAD_SERIES.map((s) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.key}
            stackId="workload"
            fill={s.color}
            stroke="#FFFFFF"
            strokeWidth={1}
            maxBarSize={20}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ChartContainer>
  );
}

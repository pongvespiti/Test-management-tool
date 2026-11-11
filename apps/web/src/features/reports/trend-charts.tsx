'use client';

/**
 * Execution trend charts (reports page + dashboard). Three small charts on one time axis instead of
 * one dual-axis chart: executed per day (stacked by result), remaining untested (burndown), pass rate.
 */
import { formatPercent, type TrendPointDTO } from '@tmt/shared';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  burndownRows,
  chartConfig,
  EXECUTED_SERIES,
  executedRows,
  formatDay,
  GRID_COLOR,
  passRateRows,
  PRIMARY,
} from './report-format';
import { HEAD_ROW, TH, type LegendItem } from './report-ui';

export const EXECUTED_LEGEND: LegendItem[] = EXECUTED_SERIES.map((s) => ({
  label: s.label,
  color: s.color,
}));

const executedConfig = chartConfig(EXECUTED_SERIES);
const MARGIN = { top: 8, right: 8, bottom: 0, left: 0 };
/** Axis look shared by the grid charts: muted ticks, no tick or axis lines. */
const AXIS = { tickLine: false, axisLine: false, tickMargin: 6 } as const;

export function ExecutedPerDayChart({
  points,
  height = 220,
}: {
  points: TrendPointDTO[];
  height?: number;
}) {
  return (
    <ChartContainer config={executedConfig} height={height}>
      <BarChart data={executedRows(points)} margin={MARGIN}>
        <CartesianGrid vertical={false} stroke={GRID_COLOR} />
        <XAxis dataKey="date" minTickGap={18} {...AXIS} />
        <YAxis allowDecimals={false} width={36} {...AXIS} />
        <ChartTooltip
          isAnimationActive={false}
          content={
            <ChartTooltipContent
              hideZero
              labelFormatter={(label, payload) =>
                payload.some((p) => Number(p.value) > 0) ? label : `${String(label)} · no results`
              }
            />
          }
        />
        {EXECUTED_SERIES.map((s) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.key}
            stackId="executed"
            fill={s.color}
            // A thin surface-coloured gap separates the stacked segments.
            stroke="#FFFFFF"
            strokeWidth={1}
            maxBarSize={24}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ChartContainer>
  );
}

/** One series as a line with a light wash below (burndown, open defects). */
export function AreaTrend({
  data,
  dataKey,
  label,
  height = 220,
  color = PRIMARY,
}: {
  data: Record<string, unknown>[];
  /** Key of the value; `date` is the x-axis key. */
  dataKey: string;
  label: string;
  height?: number;
  color?: string;
}) {
  return (
    <ChartContainer config={{ [dataKey]: { label, color } }} height={height}>
      <AreaChart data={data} margin={MARGIN}>
        <CartesianGrid vertical={false} stroke={GRID_COLOR} />
        <XAxis dataKey="date" minTickGap={18} {...AXIS} />
        <YAxis allowDecimals={false} width={36} {...AXIS} />
        <ChartTooltip isAnimationActive={false} content={<ChartTooltipContent />} />
        <Area
          dataKey={dataKey}
          name={dataKey}
          type="linear"
          stroke={color}
          strokeWidth={2}
          fill={color}
          fillOpacity={0.1}
          dot={data.length <= 31 ? { r: 3, fill: color, stroke: color } : false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ChartContainer>
  );
}

export function BurndownChart({
  points,
  height = 220,
}: {
  points: TrendPointDTO[];
  height?: number;
}) {
  return (
    <AreaTrend
      data={burndownRows(points)}
      dataKey="remaining"
      label="Remaining untested"
      height={height}
    />
  );
}

export function PassRateChart({
  points,
  height = 220,
}: {
  points: TrendPointDTO[];
  height?: number;
}) {
  return (
    <ChartContainer config={{ passRate: { label: 'Pass rate', color: PRIMARY } }} height={height}>
      <LineChart data={passRateRows(points)} margin={MARGIN}>
        <CartesianGrid vertical={false} stroke={GRID_COLOR} />
        <XAxis dataKey="date" minTickGap={18} {...AXIS} />
        <YAxis domain={[0, 100]} width={44} tickFormatter={(v: number) => `${v}%`} {...AXIS} />
        <ChartTooltip
          isAnimationActive={false}
          content={<ChartTooltipContent valueFormatter={(v) => `${v}%`} />}
        />
        <Line
          dataKey="passRate"
          name="passRate"
          type="linear"
          stroke={PRIMARY}
          strokeWidth={2}
          connectNulls
          dot={points.length <= 31 ? { r: 3, fill: PRIMARY, stroke: PRIMARY } : false}
          isAnimationActive={false}
        />
      </LineChart>
    </ChartContainer>
  );
}

/** Table twin of the trend charts (newest day first). */
export function TrendTable({
  points,
  statuses = true,
  remaining = true,
  passRate = true,
}: {
  points: TrendPointDTO[];
  statuses?: boolean;
  remaining?: boolean;
  passRate?: boolean;
}) {
  const rows = points.toReversed();
  const head = cn(TH, 'sticky top-0 z-[1] text-right');
  return (
    <div className="max-h-[380px] overflow-auto">
      <table
        className={cn(
          'w-full caption-bottom text-sm',
          statuses ? 'min-w-[760px]' : 'min-w-[320px]',
        )}
      >
        <TableHeader>
          <TableRow className={HEAD_ROW}>
            <TableHead className={cn(TH, 'sticky top-0 z-[1]')}>Date</TableHead>
            <TableHead className={head}>Executed</TableHead>
            {statuses &&
              EXECUTED_SERIES.map((s) => (
                <TableHead key={s.key} className={head}>
                  {s.label}
                </TableHead>
              ))}
            {remaining && <TableHead className={head}>Remaining</TableHead>}
            {passRate && <TableHead className={head}>Pass rate</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody className="tabular-nums">
          {rows.map((p) => (
            <TableRow key={p.date}>
              <TableCell className="py-1.5 whitespace-nowrap">{formatDay(p.date)}</TableCell>
              <TableCell className="py-1.5 text-right">{formatNumber(p.executed)}</TableCell>
              {statuses &&
                EXECUTED_SERIES.map((s) => (
                  <TableCell
                    key={s.key}
                    className={cn(
                      'py-1.5 text-right',
                      !p.byStatus[s.key] && 'text-muted-foreground',
                    )}
                  >
                    {formatNumber(p.byStatus[s.key])}
                  </TableCell>
                ))}
              {remaining && (
                <TableCell className="py-1.5 text-right">{formatNumber(p.remaining)}</TableCell>
              )}
              {passRate && (
                <TableCell className="py-1.5 text-right">{formatPercent(p.passRate, 1)}</TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </table>
    </div>
  );
}

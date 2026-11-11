'use client';

import {
  CASE_PRIORITIES,
  CASE_PRIORITY_LABELS,
  formatPercent,
  type CoverageRowDTO,
} from '@tmt/shared';
import { Target } from 'lucide-react';
import Link from 'next/link';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { EmptyState } from '@/components/common/empty-state';
import { MonoId } from '@/components/common/mono-id';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useCoverageReport } from '@/lib/api/reports';
import { formatNumber } from '@/lib/format';
import { routes } from '@/lib/routes';
import { CASE_PRIORITY_DOTS } from '@/lib/status';
import { cn } from '@/lib/utils';
import {
  chartConfig,
  COVERAGE_SERIES,
  coverageRows,
  coverageTotals,
  GRID_COLOR,
  NEVER_RUN_COLOR,
  share,
} from './report-format';
import {
  HEAD_ROW,
  ReportState,
  SectionCard,
  SeriesLegend,
  StatTile,
  TH,
  type LegendItem,
} from './report-ui';

const COVERAGE_LEGEND: LegendItem[] = COVERAGE_SERIES.map((s) => ({
  label: s.label,
  color: s.color,
  outline: s.key === 'neverRun',
  bordered: s.key === 'notExecuted',
}));
const coverageConfig = chartConfig(COVERAGE_SERIES);

/** Per suite: how much of the library ran in the scope, and with which latest results. */
export function CoverageTab({
  projectId,
  releaseId,
}: {
  projectId: number;
  releaseId: number | null;
}) {
  const coverage = useCoverageReport(projectId, { releaseId });
  const rows = coverage.data ?? [];
  return (
    <ReportState query={coverage} className="min-h-80">
      {rows.length === 0 ? (
        <EmptyState
          icon={<Target className="size-6" strokeWidth={1.6} />}
          title="No suites yet"
          description="Coverage compares each suite's test cases with the runs of the chosen release."
        />
      ) : (
        <CoverageContent rows={rows} projectId={projectId} />
      )}
    </ReportState>
  );
}

function CoverageContent({ rows, projectId }: { rows: CoverageRowDTO[]; projectId: number }) {
  const totals = coverageTotals(rows);
  const right = cn(TH, 'text-right');
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 min-[576px]:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Test cases" value={formatNumber(totals.cases)}>
          <p className="text-sm text-muted-foreground">Library cases that are not deprecated</p>
        </StatTile>
        <StatTile label="In scope" value={formatPercent(share(totals.inScope, totals.cases))}>
          <p className="text-sm text-muted-foreground">
            {formatNumber(totals.inScope)} cases in at least one run
          </p>
        </StatTile>
        <StatTile label="Executed" value={formatPercent(share(totals.executed, totals.inScope))}>
          <p className="text-sm text-muted-foreground">
            {formatNumber(totals.executed)} of the cases in scope have a result
          </p>
        </StatTile>
        <StatTile label="Never run" value={formatNumber(totals.neverRun)}>
          <p className="text-sm text-muted-foreground">Cases without any run in this scope</p>
        </StatTile>
      </div>

      <SectionCard
        title="Coverage per suite"
        subtitle="Latest result of each library case in the scope"
      >
        <div className="mb-3">
          <SeriesLegend items={COVERAGE_LEGEND} />
        </div>
        <ChartContainer config={coverageConfig} height={Math.max(140, 56 + rows.length * 44)}>
          <BarChart
            data={coverageRows(rows)}
            layout="vertical"
            margin={{ top: 4, right: 12, bottom: 0, left: 0 }}
          >
            <CartesianGrid horizontal={false} stroke={GRID_COLOR} />
            <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="suite" width={180} tickLine={false} axisLine={false} />
            <ChartTooltip isAnimationActive={false} content={<ChartTooltipContent hideZero />} />
            {COVERAGE_SERIES.map((s) =>
              s.key === 'neverRun' ? (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.key}
                  stackId="coverage"
                  fill="#FFFFFF"
                  stroke={NEVER_RUN_COLOR}
                  strokeDasharray="3 2"
                  strokeWidth={1}
                  maxBarSize={22}
                  isAnimationActive={false}
                />
              ) : (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.key}
                  stackId="coverage"
                  fill={s.color}
                  stroke="#FFFFFF"
                  strokeWidth={1}
                  maxBarSize={22}
                  isAnimationActive={false}
                />
              ),
            )}
          </BarChart>
        </ChartContainer>
      </SectionCard>

      <SectionCard title="Suites" flush>
        <Table className="min-w-[980px]">
          <TableHeader>
            <TableRow className={HEAD_ROW}>
              <TableHead className={cn(TH, 'pl-5')}>Suite</TableHead>
              <TableHead className={right}>Cases</TableHead>
              <TableHead className={right}>In scope</TableHead>
              <TableHead className={right}>Executed</TableHead>
              <TableHead className={right}>Passed</TableHead>
              <TableHead className={right}>NG / blocked</TableHead>
              <TableHead className={right}>Never run</TableHead>
              <TableHead className={cn(TH, 'pr-5')}>By priority</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="tabular-nums">
            {rows.map((r) => (
              <TableRow key={r.suite.id}>
                <TableCell className="pl-5">
                  <Link
                    href={routes.cases(projectId, { suite: r.suite.id })}
                    className="text-sm font-semibold text-foreground hover:underline"
                  >
                    {r.suite.name}
                  </Link>
                  <MonoId className="block text-muted-foreground">{r.suite.prefix}</MonoId>
                </TableCell>
                <TableCell className="text-right">{formatNumber(r.cases)}</TableCell>
                <TableCell className="text-right">
                  {formatNumber(r.inScope)}
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    {formatPercent(share(r.inScope, r.cases))}
                  </span>
                </TableCell>
                <TableCell className="text-right">{formatNumber(r.executed)}</TableCell>
                <TableCell className="text-right">{formatNumber(r.passed)}</TableCell>
                <TableCell
                  className={cn('text-right', r.failed > 0 && 'font-semibold text-destructive')}
                >
                  {formatNumber(r.failed)}
                </TableCell>
                <TableCell className="text-right">{formatNumber(r.neverRun)}</TableCell>
                <TableCell className="pr-5">
                  <div className="flex items-center gap-3">
                    {CASE_PRIORITIES.map((p) => (
                      <span
                        key={p}
                        title={CASE_PRIORITY_LABELS[p]}
                        className="inline-flex items-center gap-1"
                      >
                        <span
                          aria-hidden
                          className="size-2 rounded-full"
                          style={{ background: CASE_PRIORITY_DOTS[p] }}
                        />
                        <span className="sr-only">{CASE_PRIORITY_LABELS[p]}:</span>
                        <span className="text-sm">{r.byPriority[p]}</span>
                      </span>
                    ))}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionCard>
    </div>
  );
}

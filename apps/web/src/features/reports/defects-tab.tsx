'use client';

import {
  DEFECT_SEVERITIES,
  DEFECT_SEVERITY_LABELS,
  DEFECT_STATUS_LABELS,
  DEFECT_STATUSES,
  type DefectReportDTO,
} from '@tmt/shared';
import { Bug } from 'lucide-react';
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
import { useDefectReport } from '@/lib/api/reports';
import { formatNumber } from '@/lib/format';
import { routes } from '@/lib/routes';
import { DEFECT_STATUS_TONES, SEVERITY_DOTS } from '@/lib/status';
import { cn } from '@/lib/utils';
import {
  byOpenDefects,
  chartConfig,
  defectFlowRows,
  defectTotals,
  FLOW_SERIES,
  GRID_COLOR,
  personName,
  PRIMARY,
} from './report-format';
import {
  BarList,
  ChartCard,
  DotLabel,
  HEAD_ROW,
  ReportState,
  SectionCard,
  SeriesLegend,
  StatTile,
  TH,
} from './report-ui';
import { AreaTrend } from './trend-charts';

const flowConfig = chartConfig(FLOW_SERIES);

/** Defect flow (opened / closed / open), breakdowns and the cases with most defects. */
export function DefectsTab({
  projectId,
  releaseId,
  days,
}: {
  projectId: number;
  releaseId: number | null;
  days: number;
}) {
  const report = useDefectReport(projectId, { releaseId, days });
  return (
    <ReportState query={report} className="min-h-80">
      {report.data && <DefectsContent data={report.data} projectId={projectId} days={days} />}
    </ReportState>
  );
}

function DefectsContent({
  data,
  projectId,
  days,
}: {
  data: DefectReportDTO;
  projectId: number;
  days: number;
}) {
  const { total, open, opened, closed } = defectTotals(data);
  const flow = defectFlowRows(data.trend);

  if (total === 0 && opened === 0)
    return (
      <EmptyState
        icon={<Bug className="size-6" strokeWidth={1.6} />}
        title="No defects in this scope"
        description="Defects reported against this release (or the project) appear here."
      />
    );

  const flowTable = <FlowTable trend={data.trend} />;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 min-[576px]:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Open defects" value={formatNumber(open)}>
          <p className="text-sm text-muted-foreground">New, open, in progress or reopened</p>
        </StatTile>
        <StatTile label={`Opened in ${days} days`} value={formatNumber(opened)} />
        <StatTile label={`Closed in ${days} days`} value={formatNumber(closed)} />
        <StatTile label="All defects" value={formatNumber(total)}>
          <p className="text-sm text-muted-foreground">Any status, in this scope</p>
        </StatTile>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          title="Opened and closed per day"
          legend={<SeriesLegend items={FLOW_SERIES} />}
          chart={
            <ChartContainer config={flowConfig} height={240}>
              <BarChart data={flow} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke={GRID_COLOR} />
                <XAxis dataKey="date" minTickGap={18} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} width={32} tickLine={false} axisLine={false} />
                <ChartTooltip isAnimationActive={false} content={<ChartTooltipContent />} />
                {FLOW_SERIES.map((s) => (
                  <Bar
                    key={s.key}
                    dataKey={s.key}
                    name={s.key}
                    fill={s.color}
                    maxBarSize={12}
                    isAnimationActive={false}
                  />
                ))}
              </BarChart>
            </ChartContainer>
          }
          table={flowTable}
        />
        <ChartCard
          title="Open defects over time"
          subtitle="Open at the end of each day"
          chart={<AreaTrend data={flow} dataKey="open" label="Open defects" height={240} />}
          table={flowTable}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <SectionCard title="Open by severity" subtitle="All defects in brackets">
          <BarList
            items={DEFECT_SEVERITIES.map((s) => ({
              key: s,
              label: <DotLabel color={SEVERITY_DOTS[s]}>{DEFECT_SEVERITY_LABELS[s]}</DotLabel>,
              value: data.openBySeverity[s],
              color: SEVERITY_DOTS[s],
              note: `(${data.bySeverity[s]})`,
            }))}
          />
        </SectionCard>
        <SectionCard title="By status">
          <BarList
            items={DEFECT_STATUSES.map((s) => ({
              key: s,
              label: DEFECT_STATUS_LABELS[s],
              value: data.byStatus[s],
              color: DEFECT_STATUS_TONES[s].fg,
            }))}
          />
        </SectionCard>
        <SectionCard title="Open by assignee">
          <BarList
            empty="No open defects."
            items={byOpenDefects(data.byAssignee).map((a) => ({
              key: String(a.user?.id ?? 'none'),
              label: personName(a.user),
              value: a.open,
              color: PRIMARY,
            }))}
          />
        </SectionCard>
      </div>

      <SectionCard
        title="Test cases with the most defects"
        subtitle="Library cases by number of linked defects (top 10)"
        flush
      >
        {data.topCases.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-muted-foreground">
            No defect is linked to a test case yet.
          </p>
        ) : (
          <Table className="min-w-[520px]">
            <TableHeader>
              <TableRow className={HEAD_ROW}>
                <TableHead className={cn(TH, 'w-[140px] pl-5')}>Case</TableHead>
                <TableHead className={TH}>Title</TableHead>
                <TableHead className={cn(TH, 'w-[110px] pr-5 text-right')}>Defects</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.topCases.map((c) => (
                <TableRow key={c.testCaseId}>
                  <TableCell className="pl-5">
                    <Link
                      href={routes.cases(projectId, { case: c.testCaseId })}
                      className="text-primary hover:underline"
                    >
                      <MonoId>{c.displayId}</MonoId>
                    </Link>
                  </TableCell>
                  <TableCell className="whitespace-normal">{c.title}</TableCell>
                  <TableCell className="pr-5 text-right font-semibold">{c.defectCount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>
    </div>
  );
}

/** Table twin of the defect flow charts (newest day first). */
function FlowTable({ trend }: { trend: DefectReportDTO['trend'] }) {
  const head = cn(TH, 'sticky top-0 z-[1]');
  return (
    <div className="max-h-[380px] overflow-auto">
      <table className="w-full min-w-[360px] caption-bottom text-sm">
        <TableHeader>
          <TableRow className={HEAD_ROW}>
            <TableHead className={head}>Date</TableHead>
            <TableHead className={cn(head, 'text-right')}>Opened</TableHead>
            <TableHead className={cn(head, 'text-right')}>Closed</TableHead>
            <TableHead className={cn(head, 'text-right')}>Open at end of day</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="tabular-nums">
          {defectFlowRows(trend.toReversed()).map((p) => (
            <TableRow key={p.date}>
              <TableCell className="py-1.5">{p.date}</TableCell>
              <TableCell className="py-1.5 text-right">{p.opened}</TableCell>
              <TableCell className="py-1.5 text-right">{p.closed}</TableCell>
              <TableCell className="py-1.5 text-right">{p.open}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </table>
    </div>
  );
}

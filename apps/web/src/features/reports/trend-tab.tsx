'use client';

import { formatPercent, type ReportTrendDTO } from '@tmt/shared';
import { ChartLine } from 'lucide-react';
import { EmptyState } from '@/components/common/empty-state';
import { useTrendReport, type ReportScope } from '@/lib/api/reports';
import { formatNumber } from '@/lib/format';
import { formatDay, trendTotals } from './report-format';
import { ChartCard, ReportState, SeriesLegend, StatTile } from './report-ui';
import {
  BurndownChart,
  EXECUTED_LEGEND,
  ExecutedPerDayChart,
  PassRateChart,
  TrendTable,
} from './trend-charts';

/** Executed per day (stacked by result), remaining untested (burndown) and pass rate. */
export function TrendTab({
  projectId,
  scope,
  days,
}: {
  projectId: number;
  scope: ReportScope;
  days: number;
}) {
  const trend = useTrendReport(projectId, { ...scope, days });
  return (
    <ReportState query={trend} className="min-h-80">
      {trend.data && <TrendContent data={trend.data} days={days} />}
    </ReportState>
  );
}

function TrendContent({ data, days }: { data: ReportTrendDTO; days: number }) {
  const points = data.points;
  const { executed, last, period } = trendTotals(data);

  if (data.total === 0 && executed === 0)
    return (
      <EmptyState
        icon={<ChartLine className="size-6" strokeWidth={1.6} />}
        title="No run cases in this scope"
        description="Create runs in a test plan of this release (or choose another scope) to see the trend."
      />
    );

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 min-[576px]:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Run cases in scope" value={formatNumber(data.total)}>
          <p className="text-sm text-muted-foreground">Current runs of the plans in scope</p>
        </StatTile>
        <StatTile label={`Executed in ${days} days`} value={formatNumber(executed)}>
          <p className="text-sm text-muted-foreground">Results recorded {period}</p>
        </StatTile>
        <StatTile label="Remaining untested" value={formatNumber(last?.remaining ?? 0)}>
          <p className="text-sm text-muted-foreground">
            At the end of {last ? formatDay(last.date) : 'today'}
          </p>
        </StatTile>
        <StatTile label="Pass rate" value={formatPercent(last?.passRate ?? null, 1)}>
          <p className="text-sm text-muted-foreground">
            Latest result per run case · N/A and N/T excluded
          </p>
        </StatTile>
      </div>

      <ChartCard
        title="Executed per day"
        subtitle={`Results recorded each day, by result · ${period} (${data.timezone})`}
        legend={<SeriesLegend items={EXECUTED_LEGEND} />}
        chart={<ExecutedPerDayChart points={points} height={280} />}
        table={<TrendTable points={points} remaining={false} passRate={false} />}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          title="Remaining untested (burndown)"
          subtitle="Run cases without a result at the end of each day"
          chart={<BurndownChart points={points} height={240} />}
          table={<TrendTable points={points} statuses={false} passRate={false} />}
        />
        <ChartCard
          title="Pass rate"
          subtitle="Latest result per run case at the end of each day"
          chart={<PassRateChart points={points} height={240} />}
          table={<TrendTable points={points} statuses={false} remaining={false} />}
        />
      </div>
    </div>
  );
}

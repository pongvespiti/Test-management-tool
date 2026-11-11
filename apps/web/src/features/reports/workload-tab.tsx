'use client';

import { formatMinutes } from '@tmt/shared';
import { Users } from 'lucide-react';
import { EmptyState } from '@/components/common/empty-state';
import { useWorkloadReport, type ReportScope } from '@/lib/api/reports';
import { formatNumber } from '@/lib/format';
import { workloadTotals } from './report-format';
import { ReportState, SectionCard, SeriesLegend, StatTile } from './report-ui';
import { WORKLOAD_LEGEND, WorkloadChart, WorkloadTable } from './workload';

/** Open work per person: stacked bars + the full table. */
export function WorkloadTab({ projectId, scope }: { projectId: number; scope: ReportScope }) {
  const workload = useWorkloadReport(projectId, scope);
  const rows = workload.data ?? [];
  const totals = workloadTotals(rows);

  return (
    <ReportState query={workload} className="min-h-80">
      {rows.length === 0 ? (
        <EmptyState
          icon={<Users className="size-6" strokeWidth={1.6} />}
          title="No open work in this scope"
          description="Workload counts the run cases of plans that are not completed yet."
        />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-4 min-[576px]:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Run cases" value={formatNumber(totals.runCases)}>
              <p className="text-sm text-muted-foreground">In plans that are not completed</p>
            </StatTile>
            <StatTile label="Untested" value={formatNumber(totals.untested)}>
              <p className="text-sm text-muted-foreground">
                {totals.unassigned
                  ? `${formatNumber(totals.unassigned.untested)} without an assignee or run tester`
                  : 'Everything has an assignee'}
              </p>
            </StatTile>
            <StatTile
              label="Estimated work left"
              value={formatMinutes(totals.remainingEstimateMinutes) || '—'}
            >
              <p className="text-sm text-muted-foreground">
                Sum of the estimates of untested cases
              </p>
            </StatTile>
            <StatTile label="Executed in 7 days" value={formatNumber(totals.executedLast7Days)}>
              <p className="text-sm text-muted-foreground">Results recorded by everyone</p>
            </StatTile>
          </div>

          <SectionCard
            title="Run cases per person"
            subtitle="Effective assignee: the run case's assignee, else the run's tester"
          >
            <div className="mb-3">
              <SeriesLegend items={WORKLOAD_LEGEND} />
            </div>
            <WorkloadChart rows={rows} />
          </SectionCard>

          <SectionCard title="Workload details" flush>
            <WorkloadTable rows={rows} />
          </SectionCard>
        </div>
      )}
    </ReportState>
  );
}

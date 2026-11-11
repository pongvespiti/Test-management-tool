'use client';

import type { DashboardDTO } from '@tmt/shared';
import { ChartLine, ClipboardList, Plus } from 'lucide-react';
import Link from 'next/link';
import { Suspense, useState } from 'react';
import { ReleaseStatusBadge } from '@/components/common/badges';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorAlert, Spinner } from '@/components/common/error-alert';
import { PageHeader } from '@/components/common/page-header';
import { ResultLegend } from '@/components/common/stacked-progress';
import { Button } from '@/components/ui/button';
import { ComboboxSelect } from '@/components/common/combobox-select';
import { useUrlSearchParams } from '@/hooks/use-url-search-params';
import { NewPlanDialog } from '@/features/plans/plan-form';
import { PlanTable } from '@/features/plans/plan-table';
import { isIdle, reportLink } from '@/features/reports/report-format';
import {
  ReportState,
  Refreshing,
  SectionCard,
  SeriesLegend,
  ViewToggle,
  type ChartView,
} from '@/features/reports/report-ui';
import {
  BurndownChart,
  EXECUTED_LEGEND,
  ExecutedPerDayChart,
  TrendTable,
} from '@/features/reports/trend-charts';
import { WorkloadTable } from '@/features/reports/workload';
import { useModalTarget } from '@/hooks/use-modal-target';
import { useDashboard } from '@/lib/api/collab';
import { useTrendReport, useWorkloadReport } from '@/lib/api/reports';
import { toId } from '@/lib/forms';
import { routes, toQueryString } from '@/lib/routes';
import { useProject } from '@/providers/project-provider';
import { BuildsCard } from './builds-card';
import { AttentionList, OpenDefectsList } from './dashboard-lists';
import { periodOf, releaseLabel } from './dashboard-format';
import { KpiTiles } from './kpi-tiles';
import { RetestCard } from './retest-card';

const TREND_DAYS = 14;
const LINK = 'text-sm font-semibold text-primary hover:underline';

/** Release overview: KPIs, plans, NG / conditional results, open defects, trend and workload. */
export function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      }
    >
      <Dashboard />
    </Suspense>
  );
}

function Dashboard() {
  const { project, projectId, can } = useProject();
  const [params, setParams] = useUrlSearchParams();
  const releaseParam = toId(params.get('release'));
  const dashboard = useDashboard(projectId, releaseParam);
  const creator = useModalTarget<true>();

  // Keep the previous release on screen (dimmed) while another one loads — no spinner flash.
  const [shown, setShown] = useState<DashboardDTO | undefined>(undefined);
  if (dashboard.data && dashboard.data !== shown) setShown(dashboard.data);
  const data = dashboard.data ?? (dashboard.isError ? undefined : shown);

  const selectRelease = (id: string | null) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (id) next.set('release', id);
      else next.delete('release');
      return next;
    });

  const newPlanButton = can('writePlans') && (
    <Button onClick={() => creator.open(true)}>
      <Plus />
      New test plan
    </Button>
  );

  if (!data) {
    return (
      <>
        <PageHeader eyebrow={project.name} title="Dashboard" />
        {dashboard.isError ? (
          <div className="flex max-w-[640px] flex-col gap-4">
            <ErrorAlert error={dashboard.error} onRetry={() => void dashboard.refetch()} />
            {releaseParam !== null && (
              <Button variant="outline" className="w-fit" onClick={() => selectRelease(null)}>
                Show the current release
              </Button>
            )}
          </div>
        ) : (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        )}
      </>
    );
  }

  const release = data.release;
  const releaseId = release?.id ?? null;
  const scope = release ? 'this release' : 'the project';

  return (
    <>
      <PageHeader
        eyebrow={project.name}
        title={release ? `Release overview — ${release.name}` : 'Project overview'}
        badges={release && <ReleaseStatusBadge status={release.status} />}
        subtitle={release ? periodOf(release) : 'All test plans of the project (no releases yet)'}
        actions={
          <>
            {data.releases.length > 0 && (
              <div className="flex items-center gap-2">
                <label
                  htmlFor="dashboard-release"
                  className="text-sm font-medium text-muted-foreground"
                >
                  Release
                </label>
                <ComboboxSelect
                  id="dashboard-release"
                  className="w-[220px]"
                  options={data.releases.map((r) => ({
                    value: String(r.id),
                    label: releaseLabel(r),
                  }))}
                  value={releaseId === null ? null : String(releaseId)}
                  onChange={selectRelease}
                  searchable={data.releases.length > 8}
                  emptyText="No releases"
                />
              </div>
            )}
            {newPlanButton}
          </>
        }
      />

      <Refreshing active={!dashboard.data}>
        <div className="flex flex-col gap-6">
          <KpiTiles kpis={data.kpis} />

          <SectionCard
            title={release ? 'Test plans in this release' : 'Test plans'}
            actions={
              <div className="flex flex-wrap items-center gap-4">
                <ResultLegend />
                <Link
                  href={`${routes.plans(projectId)}${toQueryString({ release: releaseId })}`}
                  className={LINK}
                >
                  All plans
                </Link>
              </div>
            }
            flush
          >
            {data.plans.length === 0 ? (
              <EmptyState
                compact
                icon={<ClipboardList className="size-6" strokeWidth={1.6} />}
                title={release ? 'No test plans in this release yet' : 'No test plans yet'}
                description="A test plan holds the Doc No., purpose and judgement criteria of one test report, with a run per configuration."
                action={newPlanButton}
              />
            ) : (
              <PlanTable plans={data.plans} runs="chips" />
            )}
          </SectionCard>

          {release && (
            <BuildsCard projectId={projectId} releaseName={release.name} builds={data.builds} />
          )}

          {release && (
            <RetestCard
              projectId={projectId}
              total={data.retest.total}
              items={data.retest.items}
              canCreate={can('writePlans')}
            />
          )}

          <div className="grid items-stretch gap-6 lg:grid-cols-12">
            <div className="min-w-0 lg:col-span-7">
              <AttentionList items={data.attention} scope={scope} />
            </div>
            <div className="min-w-0 lg:col-span-5">
              <OpenDefectsList
                defects={data.openDefects}
                total={data.kpis.openDefects}
                scope={scope}
              />
            </div>
          </div>

          <div className="grid items-stretch gap-6 xl:grid-cols-12">
            <div className="min-w-0 xl:col-span-7">
              <TrendCard projectId={projectId} releaseId={releaseId} />
            </div>
            <div className="min-w-0 xl:col-span-5">
              <WorkloadCard projectId={projectId} releaseId={releaseId} />
            </div>
          </div>
        </div>
      </Refreshing>

      <NewPlanDialog
        open={creator.opened}
        formKey={creator.key}
        onClose={creator.close}
        releaseId={releaseId}
      />
    </>
  );
}

/** Last 14 days: results per day (stacked by status) and remaining untested run cases. */
function TrendCard({ projectId, releaseId }: { projectId: number; releaseId: number | null }) {
  const trend = useTrendReport(projectId, { releaseId, days: TREND_DAYS });
  const [view, setView] = useState<ChartView>('chart');
  const points = trend.data?.points ?? [];
  return (
    <SectionCard
      title={`Execution — last ${TREND_DAYS} days`}
      subtitle="Results recorded per day and run cases still untested (burndown)"
      actions={
        <>
          <Link href={reportLink(projectId, 'trend', releaseId)} className={LINK}>
            Reports
          </Link>
          <ViewToggle value={view} onChange={setView} />
        </>
      }
      className="h-full"
    >
      <ReportState query={trend} className="min-h-60">
        {trend.data &&
          (isIdle(points) ? (
            <EmptyState
              compact
              icon={<ChartLine className="size-6" strokeWidth={1.6} />}
              title={
                trend.data.total === 0
                  ? 'No run cases yet'
                  : `No activity in the last ${TREND_DAYS} days`
              }
              description={
                trend.data.total === 0
                  ? 'The trend appears once the plans have runs.'
                  : 'Nothing was executed and nothing is waiting. Reports show longer periods.'
              }
            />
          ) : view === 'table' ? (
            <TrendTable points={points} passRate={false} />
          ) : (
            <div className="flex flex-col gap-3">
              <SeriesLegend items={EXECUTED_LEGEND} />
              <div className="grid gap-8 md:grid-cols-2">
                <div className="min-w-0">
                  <p className="mb-2 text-sm font-semibold">Executed per day</p>
                  <ExecutedPerDayChart points={points} height={200} />
                </div>
                <div className="min-w-0">
                  <p className="mb-2 text-sm font-semibold">
                    Remaining untested{' '}
                    <span className="text-xs font-normal text-muted-foreground">
                      · {trend.data.total} run cases in scope
                    </span>
                  </p>
                  <BurndownChart points={points} height={200} />
                </div>
              </div>
            </div>
          ))}
      </ReportState>
    </SectionCard>
  );
}

/** Untested work per person over the plans of the release that are not completed. */
function WorkloadCard({ projectId, releaseId }: { projectId: number; releaseId: number | null }) {
  const workload = useWorkloadReport(projectId, { releaseId });
  const rows = workload.data ?? [];
  return (
    <SectionCard
      title="Workload"
      subtitle="Open plans · effective assignee"
      actions={
        <Link href={reportLink(projectId, 'workload', releaseId)} className={LINK}>
          Details
        </Link>
      }
      flush
      className="h-full"
    >
      <div className={workload.isError ? 'px-5 pb-5' : undefined}>
        <ReportState query={workload}>
          {rows.length === 0 ? (
            <EmptyState
              compact
              title="No open work"
              description="No untested run cases in plans that are still open."
            />
          ) : (
            <WorkloadTable rows={rows} compact />
          )}
        </ReportState>
      </div>
    </SectionCard>
  );
}

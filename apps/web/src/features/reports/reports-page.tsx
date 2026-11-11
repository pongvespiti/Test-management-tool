'use client';

import {
  Bug,
  CalendarRange,
  ChartLine,
  Flag,
  GitCompareArrows,
  Grid3x3,
  Link2,
  RotateCcw,
  Target,
  Users,
} from 'lucide-react';
import { Suspense, useMemo, type ReactNode } from 'react';
import { Spinner } from '@/components/common/error-alert';
import { PageHeader } from '@/components/common/page-header';
import { ReleaseSelect } from '@/components/common/release-select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ComboboxSelect } from '@/components/common/combobox-select';
import { SegmentedControl } from '@/components/common/list-controls';
import { useUrlSearchParams } from '@/hooks/use-url-search-params';
import { usePlans } from '@/lib/api/plans';
import { toId } from '@/lib/forms';
import { useProject } from '@/providers/project-provider';
import { CompareTab } from './compare-tab';
import { CoverageTab } from './coverage-tab';
import { DefectsTab } from './defects-tab';
import { ReleasesTab } from './releases-tab';
import {
  DEFAULT_DAYS,
  parseDays,
  parseTab,
  REPORT_DAYS,
  scopeNote,
  TAB_SCOPE,
  type ReportTab,
} from './report-format';
import { ReopensTab } from './reopens-tab';
import { ScheduleTab } from './schedule-tab';
import { SummaryTab } from './summary-tab';
import { TraceabilityTab } from './traceability-tab';
import { TrendTab } from './trend-tab';
import { WorkloadTab } from './workload-tab';

const TAB_ITEMS: { value: ReportTab; label: string; icon: ReactNode }[] = [
  { value: 'trend', label: 'Trend', icon: <ChartLine /> },
  { value: 'summary', label: 'Summary', icon: <Grid3x3 /> },
  { value: 'schedule', label: 'Schedule', icon: <CalendarRange /> },
  { value: 'workload', label: 'Workload', icon: <Users /> },
  { value: 'defects', label: 'Defects', icon: <Bug /> },
  { value: 'reopens', label: 'Reopens', icon: <RotateCcw /> },
  { value: 'compare', label: 'Compare', icon: <GitCompareArrows /> },
  { value: 'releases', label: 'Releases', icon: <Flag /> },
  { value: 'coverage', label: 'Coverage', icon: <Target /> },
  { value: 'traceability', label: 'Traceability', icon: <Link2 /> },
];

/** Underlined tabs as in the approved mockup (instead of the default pill tabs). */
const TAB_LIST =
  'h-auto w-full justify-start gap-1 overflow-x-auto rounded-none border-b bg-transparent p-0';
const TAB_TRIGGER =
  'h-10 flex-none rounded-none border-0 border-b-2 border-transparent px-3 text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none';

/** Execution trend, workload, defects, release comparison and coverage for a release / plan scope. */
export function ReportsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      }
    >
      <Reports />
    </Suspense>
  );
}

function Reports() {
  const { project, projectId } = useProject();
  const [params, setParams] = useUrlSearchParams();
  const tab = parseTab(params.get('tab'));
  const releaseId = toId(params.get('release'));
  const requestedPlan = toId(params.get('plan'));
  const days = parseDays(params.get('days'));
  const plans = usePlans(projectId, releaseId);
  const uses = TAB_SCOPE[tab];

  // A plan outside the chosen release does not count.
  const planList = useMemo(() => plans.data ?? [], [plans.data]);
  const planInScope = planList.some((p) => p.id === requestedPlan);
  const planId = requestedPlan !== null && (planInScope || plans.isPending) ? requestedPlan : null;

  const update = (patch: Record<string, string | null>) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      return next;
    });

  const note = scopeNote(tab, planId !== null);
  const scope = { releaseId, planId: uses.plan ? planId : null };

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle={`${project.name} · trend, summary by environment, workload, defects, releases, coverage and traceability`}
      />
      <Tabs
        value={tab}
        onValueChange={(v) => update({ tab: v === 'trend' ? null : v })}
        className="gap-0"
      >
        <TabsList className={TAB_LIST}>
          {TAB_ITEMS.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className={TAB_TRIGGER}>
              {t.icon}
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <div
          role="group"
          aria-label="Report scope"
          className="my-5 flex flex-wrap items-center gap-3"
        >
          <div className="w-[220px]">
            <label htmlFor="reports-release" className="sr-only">
              Release
            </label>
            <ReleaseSelect
              id="reports-release"
              projectId={projectId}
              placeholder="All releases"
              value={releaseId}
              onChange={(id) => update({ release: id ? String(id) : null, plan: null })}
              disabled={!uses.release}
            />
          </div>
          <ComboboxSelect
            aria-label="Test plan"
            className="w-[320px] max-w-full"
            options={planList.map((p) => ({
              value: String(p.id),
              label: `${p.docNo} · ${p.title}`,
            }))}
            value={planId === null ? null : String(planId)}
            onChange={(v) => update({ plan: v })}
            placeholder={releaseId ? 'All plans of the release' : 'All plans'}
            clearLabel={releaseId ? 'All plans of the release' : 'All plans'}
            emptyText="No plans"
            disabled={!uses.plan}
          />
          {uses.days && (
            <SegmentedControl
              aria-label="Period"
              value={String(days)}
              onChange={(v) => update({ days: Number(v) === DEFAULT_DAYS ? null : v })}
              options={REPORT_DAYS.map((d) => ({ value: String(d), label: `${d} days` }))}
            />
          )}
          {note && <p className="text-sm text-muted-foreground">{note}</p>}
        </div>

        <TabsContent value="trend">
          <TrendTab projectId={projectId} scope={scope} days={days} />
        </TabsContent>
        <TabsContent value="summary">
          <SummaryTab projectId={projectId} releaseId={releaseId} planId={planId} />
        </TabsContent>
        <TabsContent value="schedule">
          <ScheduleTab projectId={projectId} releaseId={releaseId} />
        </TabsContent>
        <TabsContent value="workload">
          <WorkloadTab projectId={projectId} scope={scope} />
        </TabsContent>
        <TabsContent value="defects">
          <DefectsTab projectId={projectId} releaseId={releaseId} days={days} />
        </TabsContent>
        <TabsContent value="reopens">
          <ReopensTab projectId={projectId} releaseId={releaseId} />
        </TabsContent>
        <TabsContent value="compare">
          <CompareTab projectId={projectId} />
        </TabsContent>
        <TabsContent value="releases">
          <ReleasesTab />
        </TabsContent>
        <TabsContent value="coverage">
          <CoverageTab projectId={projectId} releaseId={releaseId} />
        </TabsContent>
        <TabsContent value="traceability">
          <TraceabilityTab projectId={projectId} releaseId={releaseId} />
        </TabsContent>
      </Tabs>
    </>
  );
}

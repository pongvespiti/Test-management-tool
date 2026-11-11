'use client';

import { PLAN_STATUS_LABELS, PLAN_STATUSES, type PlanStatus } from '@tmt/shared';
import { ClipboardList, FunnelX, Plus } from 'lucide-react';
import { Suspense, useMemo, useState } from 'react';
import { EmptyState } from '@/components/common/empty-state';
import { QueryState, Spinner } from '@/components/common/error-alert';
import { PageHeader } from '@/components/common/page-header';
import { ReleaseSelect } from '@/components/common/release-select';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SearchInput, SegmentedControl } from '@/components/common/list-controls';
import { useUrlSearchParams } from '@/hooks/use-url-search-params';
import { Refreshing } from '@/features/reports/report-ui';
import { useDebouncedCallback } from '@/hooks/use-debounce';
import { useModalTarget } from '@/hooks/use-modal-target';
import { usePlans } from '@/lib/api/plans';
import { toId } from '@/lib/forms';
import { useProject } from '@/providers/project-provider';
import { NewPlanDialog } from './plan-form';
import { PlanTable } from './plan-table';
import { countByStatus, oneOf, planMatches } from './plan-utils';

/** Test plans of the project: release / status / text filters (kept in the URL) and "New test plan". */
export function PlansPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      }
    >
      <PlansList />
    </Suspense>
  );
}

function PlansList() {
  const { project, projectId, can } = useProject();
  const [params, setParams] = useUrlSearchParams();
  const releaseId = toId(params.get('release'));
  const status = oneOf(PLAN_STATUSES, params.get('status'));
  const q = params.get('q') ?? '';
  const plans = usePlans(projectId, releaseId);
  const creator = useModalTarget<true>();
  const canWrite = can('writePlans');

  const setParam = (key: string, value: string | null) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    });

  // Search filters instantly; the URL follows after a short pause.
  const [text, setText] = useState(q);
  const [syncedQ, setSyncedQ] = useState(q);
  if (q !== syncedQ) {
    // The URL changed (our own commit, the back button or a link): show its text.
    setSyncedQ(q);
    if (text.trim() !== q) setText(q);
  }
  const commitText = useDebouncedCallback((value: string) => setParam('q', value.trim()), 300);

  const all = useMemo(() => plans.data ?? [], [plans.data]);
  const needle = text.trim().toLowerCase();
  const byText = useMemo(() => all.filter((p) => planMatches(p, needle)), [all, needle]);
  const statusCounts = useMemo(() => countByStatus(byText), [byText]);
  const visible = status ? byText.filter((p) => p.status === status) : byText;
  const filtering = needle !== '' || status !== null || releaseId !== null;

  const clearFilters = () => {
    commitText.cancel();
    setText('');
    setParams(() => new URLSearchParams());
  };

  const newButton = canWrite && (
    <Button onClick={() => creator.open(true)}>
      <Plus />
      New test plan
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Test plans"
        subtitle={`${project.name} · one plan per controlled test report, with a run per configuration`}
        actions={newButton}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput
          aria-label="Search test plans"
          placeholder="Search doc no., title or run code"
          value={text}
          onValueChange={(v) => {
            setText(v);
            commitText.run(v);
          }}
          onClear={() => {
            commitText.cancel();
            setText('');
            setParam('q', null);
          }}
          className="max-w-[380px] min-w-0 flex-[1_1_260px]"
        />
        <div className="w-[220px]">
          <label htmlFor="plans-release" className="sr-only">
            Filter by release
          </label>
          <ReleaseSelect
            id="plans-release"
            projectId={projectId}
            placeholder="All releases"
            value={releaseId}
            onChange={(id) => setParam('release', id ? String(id) : null)}
          />
        </div>
        <SegmentedControl<'all' | PlanStatus>
          aria-label="Filter by status"
          value={status ?? 'all'}
          onChange={(v) => setParam('status', v === 'all' ? null : v)}
          options={[
            { value: 'all', label: `All (${byText.length})` },
            ...PLAN_STATUSES.map((s) => ({
              value: s,
              label: `${PLAN_STATUS_LABELS[s]} (${statusCounts[s]})`,
            })),
          ]}
        />
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        <QueryState query={plans}>
          {all.length === 0 && releaseId === null ? (
            <EmptyState
              icon={<ClipboardList className="size-6" strokeWidth={1.6} />}
              title="No test plans yet"
              description="A test plan carries the Doc No., purpose, test method and judgement criteria of one test report. Add a run for each configuration you test."
              action={newButton}
            />
          ) : visible.length === 0 ? (
            <EmptyState
              compact
              icon={<FunnelX className="size-6" strokeWidth={1.6} />}
              title={filtering ? 'No test plans match your filters' : 'No test plans'}
              description={
                releaseId !== null && all.length === 0
                  ? 'This release has no test plans yet.'
                  : undefined
              }
              action={
                filtering ? (
                  <Button variant="outline" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <Refreshing active={plans.isPlaceholderData}>
              <PlanTable plans={visible} showRelease showUpdated />
            </Refreshing>
          )}
        </QueryState>
      </Card>

      <NewPlanDialog
        open={creator.opened}
        formKey={creator.key}
        onClose={creator.close}
        releaseId={releaseId}
      />
    </>
  );
}

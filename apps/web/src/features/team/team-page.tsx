'use client';

import type { TopicSuiteDTO } from '@tmt/shared';
import { Layers, ShieldAlert, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { ComboboxSelect } from '@/components/common/combobox-select';
import { EmptyState } from '@/components/common/empty-state';
import { QueryState } from '@/components/common/error-alert';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Refreshing, SectionCard } from '@/features/reports/report-ui';
import { WorkloadTable } from '@/features/reports/workload';
import { TopicTree } from '@/features/topics/topic-tree';
import { useUrlSearchParams } from '@/hooks/use-url-search-params';
import { useWorkloadReport } from '@/lib/api/reports';
import { useTopics } from '@/lib/api/topics';
import { useProject } from '@/providers/project-provider';
import { AssignSuiteDialog } from './assign-dialog';

/** Managers and leads: who holds which topic, how far they are, and who still needs one. */
export function TeamPage() {
  const { project, projectId, can } = useProject();
  if (!can('viewTeam')) {
    return (
      <>
        <PageHeader eyebrow={project.name} title="Team" />
        <EmptyState
          icon={<ShieldAlert className="size-6" strokeWidth={1.6} />}
          title="Only managers and leads can open this page"
          description="Ask a lead of the project to change your role if you need it."
        />
      </>
    );
  }
  return <Team projectId={projectId} projectName={project.name} />;
}

function Team({ projectId, projectName }: { projectId: number; projectName: string }) {
  const { can } = useProject();
  const [params, setParams] = useUrlSearchParams();
  const releaseParam = Number(params.get('release'));
  const releaseId = Number.isInteger(releaseParam) && releaseParam > 0 ? releaseParam : null;
  const query = useTopics(projectId, releaseId, null);
  const data = query.data;
  const workload = useWorkloadReport(projectId, { releaseId: data?.release?.id ?? releaseId });
  const [target, setTarget] = useState<{ topic: string; suite: TopicSuiteDTO } | null>(null);
  const canAssign = can('assignTopics');

  const pickRelease = (next: number | null) =>
    setParams((prev) => {
      const out = new URLSearchParams(prev);
      if (next) out.set('release', String(next));
      else out.delete('release');
      return out;
    });

  const unassigned =
    data?.topics.flatMap((g) =>
      g.suites.flatMap((s) =>
        s.runs.filter((r) => !r.tester).map((r) => ({ topic: g.topic, suite: s, run: r })),
      ),
    ) ?? [];

  return (
    <>
      <PageHeader
        eyebrow={projectName}
        title="Team"
        subtitle="Who holds which topic in a release, how far they are, and what still has no owner."
        actions={
          data && data.releases.length > 0 ? (
            <div className="flex items-center gap-2">
              <label htmlFor="team-release" className="text-sm font-medium text-muted-foreground">
                Release
              </label>
              <ComboboxSelect
                id="team-release"
                className="w-[220px]"
                options={data.releases.map((r) => ({ value: String(r.id), label: r.name }))}
                value={data.release ? String(data.release.id) : null}
                onChange={(v) => pickRelease(v ? Number(v) : null)}
                searchable={data.releases.length > 8}
                emptyText="No releases"
              />
            </div>
          ) : undefined
        }
      />
      <div className="flex flex-col gap-6">
        <SectionCard title="Load per person" subtitle="Open work in the release.">
          <QueryState query={workload}>
            {workload.data && workload.data.length > 0 ? (
              <WorkloadTable rows={workload.data} />
            ) : (
              <p className="px-5 py-4 text-sm text-muted-foreground">
                No open work in this release.
              </p>
            )}
          </QueryState>
        </SectionCard>

        <SectionCard
          title="Topics"
          subtitle="Topic → suite → run → section → case. Hand a suite to one person with its button."
        >
          <QueryState query={query}>
            {data && (
              <Refreshing active={query.isFetching}>
                {data.topics.length === 0 ? (
                  <EmptyState
                    compact
                    icon={<Layers className="size-6" strokeWidth={1.6} />}
                    title="No runs in this release"
                    description="Create runs under a plan of the release, then hand their suites out here."
                  />
                ) : (
                  <TopicTree
                    projectId={projectId}
                    topics={data.topics}
                    userId={null}
                    action={
                      canAssign && data.release
                        ? (suite) => (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setTarget({
                                  topic:
                                    data.topics.find((g) => g.suites.includes(suite))?.topic ?? '',
                                  suite,
                                })
                              }
                            >
                              <UserPlus className="size-4" /> Assign
                            </Button>
                          )
                        : undefined
                    }
                  />
                )}
              </Refreshing>
            )}
          </QueryState>
        </SectionCard>

        {data && (unassigned.length > 0 || data.suitesWithoutRuns.length > 0) && (
          <SectionCard
            title="Not handed out yet"
            subtitle="Runs without a tester, and suites that have no run in this release."
          >
            <ul className="flex flex-col divide-y px-5 text-sm" aria-label="Not handed out">
              {unassigned.map(({ topic, suite, run }) => (
                <li key={run.id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="font-medium">{topic}</span>
                  <span className="text-muted-foreground">
                    {suite.suite.name} · {run.code}
                  </span>
                </li>
              ))}
              {data.suitesWithoutRuns.map((s) => (
                <li key={`s${s.id}`} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="font-medium">{s.topic}</span>
                  <span className="text-muted-foreground">{s.name} · no run yet</span>
                </li>
              ))}
            </ul>
          </SectionCard>
        )}
      </div>
      {target && data?.release && (
        <AssignSuiteDialog
          projectId={projectId}
          releaseId={data.release.id}
          topic={target.topic}
          suite={target.suite}
          onClose={() => setTarget(null)}
        />
      )}
    </>
  );
}

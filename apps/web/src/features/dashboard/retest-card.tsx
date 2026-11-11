'use client';

import type { RetestCaseDTO, RetestItemDTO } from '@tmt/shared';
import { Hammer } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { EmptyState } from '@/components/common/empty-state';
import { MonoId } from '@/components/common/mono-id';
import { Button } from '@/components/ui/button';
import { SectionCard } from '@/features/reports/report-ui';
import { pluralize } from '@/lib/format';
import { routes } from '@/lib/routes';
import { SEVERITY_DOTS } from '@/lib/status';
import { RetestDialog, type RetestTarget } from './retest-dialog';

/** Failed cases of one defect grouped by the run they failed in (one retest run per source run). */
export function groupBySourceRun(cases: RetestCaseDTO[]): Map<number, RetestCaseDTO[]> {
  const groups = new Map<number, RetestCaseDTO[]>();
  for (const c of cases) groups.set(c.runId, [...(groups.get(c.runId) ?? []), c]);
  return groups;
}

/** Resolved defects whose fix build has not been tested on their failed cases yet. */
export function RetestCard({
  projectId,
  total,
  items,
  canCreate,
}: {
  projectId: number;
  total: number;
  items: RetestItemDTO[];
  canCreate: boolean;
}) {
  const [target, setTarget] = useState<RetestTarget | null>(null);
  return (
    <SectionCard
      title="Waiting for retest"
      subtitle="Resolved defects with a fix build whose failed cases are not tested on that build yet."
      flush
    >
      {items.length === 0 ? (
        <EmptyState
          compact
          icon={<Hammer className="size-6" strokeWidth={1.6} />}
          title="No fixes are waiting for a retest"
          description="Set “Fixed in build” and resolve a defect: its failed cases show up here until they are tested on that build."
        />
      ) : (
        <ul>
          {items.map((item) => (
            <RetestRow
              key={item.defect.id}
              item={item}
              projectId={projectId}
              canCreate={canCreate}
              onRetest={setTarget}
            />
          ))}
        </ul>
      )}
      {total > items.length && (
        <p className="border-t border-divider px-5 py-3 text-sm text-muted-foreground">
          Showing {items.length} of {total} defects (most severe first).
        </p>
      )}
      <RetestDialog projectId={projectId} target={target} onClose={() => setTarget(null)} />
    </SectionCard>
  );
}

function RetestRow({
  item,
  projectId,
  canCreate,
  onRetest,
}: {
  item: RetestItemDTO;
  projectId: number;
  canCreate: boolean;
  onRetest: (target: RetestTarget) => void;
}) {
  const todo = item.cases.filter((c) => c.scheduledRun === null);
  return (
    <li className="flex flex-col gap-2 border-t border-divider px-5 py-3 first:border-t-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span
          aria-hidden="true"
          className="size-2.5 rounded-full"
          style={{ background: SEVERITY_DOTS[item.defect.severity] }}
        />
        <MonoId>{item.defect.key}</MonoId>
        <Link
          href={routes.defect(projectId, item.defect.id)}
          className="text-sm font-semibold [overflow-wrap:anywhere] hover:underline"
        >
          {item.defect.title}
        </Link>
        <span className="text-sm text-muted-foreground">
          fixed in <span className="font-mono">{item.fixedInBuild.name}</span>
        </span>
      </div>
      <ul className="flex flex-col gap-1.5 pl-5">
        {[...groupBySourceRun(item.cases)].map(([runId, cases]) => {
          const first = cases[0]!;
          const needsRun = cases.filter((c) => c.scheduledRun === null);
          return (
            <li key={runId} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="text-muted-foreground">
                {pluralize(cases.length, 'case')} failed in{' '}
                <Link href={routes.run(projectId, runId)} className="font-mono hover:underline">
                  {first.runCode}
                </Link>{' '}
                ({first.planDocNo}):
              </span>
              {cases.map((c) => (
                <span key={c.runCaseId} className="inline-flex items-center gap-1">
                  <MonoId>{c.displayId}</MonoId>
                  {c.scheduledRun && (
                    <Link
                      href={routes.run(projectId, c.scheduledRun.id)}
                      className="text-xs text-primary hover:underline"
                    >
                      in {c.scheduledRun.code}
                    </Link>
                  )}
                </span>
              ))}
              {needsRun.length > 0 &&
                (first.planStatus === 'completed' ? (
                  <span className="text-xs text-muted-foreground">
                    Plan completed — reopen it to add a retest run
                  </span>
                ) : (
                  canCreate && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        onRetest({
                          runId,
                          runCode: first.runCode,
                          build: item.fixedInBuild,
                          cases: needsRun,
                        })
                      }
                    >
                      Create retest run
                    </Button>
                  )
                ))}
            </li>
          );
        })}
      </ul>
      {todo.length === 0 && (
        <p className="pl-5 text-xs text-muted-foreground">
          Retest runs exist; record their results to close this.
        </p>
      )}
    </li>
  );
}

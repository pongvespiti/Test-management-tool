'use client';

import type { TopicGroupDTO, TopicRunDTO, TopicSuiteDTO } from '@tmt/shared';
import { ChevronDown, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { ResultBadge } from '@/components/common/badges';
import { Spinner } from '@/components/common/error-alert';
import { MonoId } from '@/components/common/mono-id';
import { StackedProgress } from '@/components/common/stacked-progress';
import { effectiveAssignee, groupBySection, PATH_SEP } from '@/features/runs/run-cases';
import { useRunCases } from '@/lib/api/runs';
import { formatDate } from '@/lib/format';
import { routes } from '@/lib/routes';
import { cn } from '@/lib/utils';
import { TopicStatePill } from './topic-state';

function DueText({ date, overdue }: { date: string | null; overdue: boolean }) {
  if (!date) return <span className="text-muted-foreground">No due date</span>;
  return (
    <span className={cn(overdue && 'font-medium text-destructive')}>Due {formatDate(date)}</span>
  );
}

function Toggle({ open, onClick, label }: { open: boolean; onClick: () => void; label: string }) {
  const Icon = open ? ChevronDown : ChevronRight;
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-label={label}
      onClick={onClick}
      className="flex size-6 flex-none items-center justify-center rounded text-muted-foreground hover:bg-muted"
    >
      <Icon className="size-4" />
    </button>
  );
}

/** Sections of a run with their progress, and the cases of a section (loaded when opened). */
function RunSections({
  projectId,
  run,
  userId,
}: {
  projectId: number;
  run: TopicRunDTO;
  userId: number | null;
}) {
  const query = useRunCases(projectId, run.id);
  const [open, setOpen] = useState<Set<string>>(new Set());
  if (query.isPending) {
    return (
      <div className="flex justify-center py-3">
        <Spinner />
      </div>
    );
  }
  if (query.isError)
    return <p className="py-2 text-sm text-destructive">Could not load the cases.</p>;
  // A person's list shows their cases only (assigned to them, else the run's tester).
  const cases = (query.data ?? []).filter(
    (rc) => userId === null || effectiveAssignee(rc, { tester: run.tester }).user?.id === userId,
  );
  const groups = groupBySection(cases);
  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  return (
    <ul className="flex flex-col gap-1 py-2" aria-label={`Sections of ${run.code}`}>
      {groups.map((g) => {
        const isOpen = open.has(g.key);
        return (
          <li key={g.key} className="rounded-md border bg-card">
            <div className="flex items-center gap-2 px-2 py-1.5">
              <Toggle
                open={isOpen}
                onClick={() => toggle(g.key)}
                label={`${isOpen ? 'Hide' : 'Show'} cases of ${g.path.join(PATH_SEP) || 'no section'}`}
              />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {g.path.join(PATH_SEP) || 'No section'}
              </span>
              <div className="w-[220px] flex-none">
                <StackedProgress counts={g.counts} showSummary />
              </div>
            </div>
            {isOpen && (
              <ul className="divide-y border-t">
                {g.cases.map((rc) => (
                  <li key={rc.id} className="flex items-center gap-3 px-3 py-1.5 text-sm">
                    <MonoId>{rc.displayId}</MonoId>
                    <Link
                      href={routes.run(projectId, run.id, { case: rc.id })}
                      className="min-w-0 flex-1 truncate text-primary hover:underline"
                    >
                      {rc.title}
                    </Link>
                    <ResultBadge status={rc.status} size="sm" />
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function RunRow({
  projectId,
  run,
  userId,
  showTester,
}: {
  projectId: number;
  run: TopicRunDTO;
  userId: number | null;
  showTester: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <li className="border-t first:border-t-0">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
        <Toggle
          open={open}
          onClick={() => setOpen((v) => !v)}
          label={`${open ? 'Hide' : 'Show'} sections of ${run.code}`}
        />
        <div className="min-w-[180px] flex-1">
          <Link
            href={routes.run(projectId, run.id)}
            className="font-mono text-[13px] font-medium text-primary hover:underline"
          >
            {run.code}
          </Link>
          <span className="ml-2 text-sm text-muted-foreground">
            {[run.scenario, run.build?.name].filter(Boolean).join(' · ')}
          </span>
          <p className="text-xs text-muted-foreground">{run.planDocNo}</p>
        </div>
        {showTester && (
          <span className="w-[150px] flex-none text-sm">
            {run.tester?.displayName ?? <span className="text-muted-foreground">Not assigned</span>}
          </span>
        )}
        <span className="w-[130px] flex-none text-sm">
          <DueText date={run.dueDate} overdue={run.overdue} />
        </span>
        <div className="w-[230px] flex-none">
          <StackedProgress counts={run.counts} showSummary />
        </div>
        <span className="w-[130px] flex-none">
          <TopicStatePill state={run.state} overdue={run.overdue} />
        </span>
      </div>
      {open && (
        <div className="px-3 pb-2 pl-11">
          <RunSections projectId={projectId} run={run} userId={userId} />
        </div>
      )}
    </li>
  );
}

function SuiteBlock({
  projectId,
  suite,
  userId,
  showTester,
  action,
}: {
  projectId: number;
  suite: TopicSuiteDTO;
  userId: number | null;
  showTester: boolean;
  action?: (suite: TopicSuiteDTO) => ReactNode;
}) {
  return (
    <div className="rounded-lg border">
      <div className="flex flex-wrap items-center gap-3 bg-muted/50 px-3 py-2">
        <p className="min-w-0 flex-1 text-sm font-semibold">
          {suite.suite.name} <MonoId>{suite.suite.prefix}</MonoId>
        </p>
        <span className="text-sm">
          <DueText date={suite.dueDate} overdue={suite.overdue} />
        </span>
        <TopicStatePill state={suite.state} overdue={suite.overdue} />
        {action?.(suite)}
      </div>
      <ul aria-label={`Runs of ${suite.suite.name}`}>
        {suite.runs.map((run) => (
          <RunRow
            key={run.id}
            projectId={projectId}
            run={run}
            userId={userId}
            showTester={showTester}
          />
        ))}
      </ul>
    </div>
  );
}

/**
 * Topic → suite → run → section → case, with progress at every level. `userId` = a person's own
 * list (their cases only); null = the whole team, which also shows each run's tester.
 */
export function TopicTree({
  projectId,
  topics,
  userId,
  action,
}: {
  projectId: number;
  topics: readonly TopicGroupDTO[];
  userId: number | null;
  /** Extra control in each suite header (e.g. "Assign"). */
  action?: (suite: TopicSuiteDTO) => ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5">
      {topics.map((group) => (
        <section key={group.topic} aria-label={group.topic} className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-base font-semibold">{group.topic}</h3>
            <TopicStatePill state={group.state} />
            <div className="w-[260px]">
              <StackedProgress counts={group.counts} showSummary />
            </div>
          </div>
          <div className="flex flex-col gap-3">
            {group.suites.map((suite) => (
              <SuiteBlock
                key={suite.suite.id}
                projectId={projectId}
                suite={suite}
                userId={userId}
                showTester={userId === null}
                action={action}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

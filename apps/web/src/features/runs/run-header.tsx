'use client';

import {
  executedOf,
  formatMinutes,
  formatPercent,
  JUDGEMENT_LABELS,
  passRateOf,
  progressOf,
  RESULT_LABELS,
  totalOf,
  type ResultStatus,
  type RunDTO,
} from '@tmt/shared';
import {
  ChevronDown,
  ChevronRight,
  Download,
  Ellipsis,
  FileChartColumn,
  FileCode,
  ListPlus,
  Lock,
  Pencil,
  Repeat,
} from 'lucide-react';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { JudgementBadge, PlanStatusBadge } from '@/components/common/badges';
import { EnvGrid } from '@/components/common/env-grid';
import { MonoId } from '@/components/common/mono-id';
import { PageHeader } from '@/components/common/page-header';
import { StackedProgress } from '@/components/common/stacked-progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import { downloadRunReport } from '@/lib/api/automation';
import { formatDate } from '@/lib/format';
import { notifyError } from '@/lib/notify';
import { routes } from '@/lib/routes';
import { RESULT_BAR_ORDER, RESULT_TONES } from '@/lib/status';
import { storageGet, storageSet } from '@/lib/storage';
import { cn } from '@/lib/utils';
import { useProject } from '@/providers/project-provider';
import { runDue } from './due';
import { statusLabelOf } from './run-cases';

const ENV_OPEN_KEY = 'tmt:run-env-open';

export interface RunActions {
  onEdit?: () => void;
  onAddCases?: () => void;
  onRerun?: () => void;
  onJunit?: () => void;
}

/** Breadcrumbs, title, run actions and the read-only notice of a completed plan. */
export function RunHeader({ run, actions }: { run: RunDTO; actions: RunActions }) {
  const { projectId } = useProject();
  const [downloading, setDownloading] = useState(false);
  const locked = run.planStatus === 'completed';
  const due = runDue(run);
  const more = [actions.onJunit, actions.onAddCases, actions.onRerun].some(Boolean);

  const download = async () => {
    setDownloading(true);
    try {
      await downloadRunReport(projectId, run);
    } catch (err) {
      notifyError(err, 'Could not download the Excel report');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Test plans', href: routes.plans(projectId) },
          {
            label: <span className="font-mono">{run.planDocNo}</span>,
            href: routes.plan(projectId, run.planId),
          },
          { label: <span className="font-mono">{run.code}</span> },
        ]}
        eyebrow={
          <span>
            Test ID <MonoId>{run.code}</MonoId>
          </span>
        }
        badges={
          <>
            <PlanStatusBadge status={run.planStatus} />
            {run.sourceRun && (
              <Link
                href={routes.run(projectId, run.sourceRun.id)}
                className="inline-flex h-[22px] items-center gap-1 rounded-sm bg-secondary px-2 text-xs font-semibold text-[#495057] hover:bg-[#e9ecef]"
              >
                <Repeat className="size-3" aria-hidden />
                Re-run of {run.sourceRun.code}
              </Link>
            )}
          </>
        }
        title={run.scenario || run.code}
        subtitle={
          <span title={`${run.planDocNo} — ${run.planTitle}`}>
            Suite {run.suite.name} · Tester {run.tester?.displayName ?? 'not set'}
            {run.build ? ` · Build ${run.build.name}` : ''}
            {run.testedDate ? ` · Tested ${formatDate(run.testedDate)}` : ''}
            {due ? ` · Due ${formatDate(due.date)}${due.overdue ? ' (overdue)' : ''}` : ''}
          </span>
        }
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={routes.runReport(projectId, run.id)}>
                <FileChartColumn />
                Run report
              </Link>
            </Button>
            <Button variant="outline" loading={downloading} onClick={() => void download()}>
              {!downloading && <Download />}
              Excel
            </Button>
            {more && (
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    More
                    <Ellipsis />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {actions.onJunit && (
                    <DropdownMenuItem onSelect={actions.onJunit}>
                      <FileCode />
                      Upload JUnit results…
                    </DropdownMenuItem>
                  )}
                  {actions.onAddCases && (
                    <DropdownMenuItem onSelect={actions.onAddCases}>
                      <ListPlus />
                      Add cases…
                    </DropdownMenuItem>
                  )}
                  {actions.onRerun && (
                    <DropdownMenuItem onSelect={actions.onRerun}>
                      <Repeat />
                      Re-run…
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {actions.onEdit && (
              <Button variant="outline" onClick={actions.onEdit}>
                <Pencil />
                Edit run
              </Button>
            )}
          </>
        }
      />
      {locked && (
        <Alert className="mb-4 bg-[#f8f9fa]">
          <Lock />
          <AlertTitle>Read-only</AlertTitle>
          <AlertDescription>
            <p>
              Test plan{' '}
              <Link
                href={routes.plan(projectId, run.planId)}
                className="font-mono text-primary hover:underline"
              >
                {run.planDocNo}
              </Link>{' '}
              is completed, so results of this run cannot be changed. A lead can reopen the plan.
            </p>
          </AlertDescription>
        </Alert>
      )}
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="text-lg leading-[1.3] font-bold">{value}</div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * Progress (stacked bar; legend items filter the case list), executed/pass rate, remaining
 * estimate, judgement and the run environment (collapsible, remembered per browser).
 */
export function RunSummary({
  run,
  statusFilter,
  onStatusFilter,
}: {
  run: RunDTO;
  statusFilter: ResultStatus[];
  onStatusFilter: (status: ResultStatus[]) => void;
}) {
  const [envOpen, setEnvOpen] = useState(() => storageGet(ENV_OPEN_KEY) === '1');
  const counts = run.counts;
  const total = totalOf(counts);
  const executed = executedOf(counts);
  const shown = RESULT_BAR_ORDER.filter((s) => counts[s] > 0);
  const envSummary = run.environment
    .filter((e) => e.value.trim() !== '')
    .map((e) => `${e.label} ${e.value}`)
    .join(' · ');

  const toggleEnv = () => {
    const next = !envOpen;
    setEnvOpen(next);
    storageSet(ENV_OPEN_KEY, next ? '1' : null);
  };

  return (
    <Card className="mb-4 gap-0 px-5 py-4">
      <div className="flex flex-wrap items-center gap-6">
        <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-1.5">
          <StackedProgress counts={counts} height={10} />
          <div role="group" aria-label="Filter by result" className="flex flex-wrap gap-0.5">
            {shown.map((s) => {
              const only = statusFilter.length === 1 && statusFilter[0] === s;
              const label = statusLabelOf(s, RESULT_LABELS);
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={only}
                  title={only ? 'Show all results' : `Show only ${label}`}
                  onClick={() => onStatusFilter(only ? [] : [s])}
                  className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs text-[#495057] hover:bg-secondary aria-pressed:bg-accent aria-pressed:text-accent-foreground"
                >
                  <span
                    aria-hidden
                    className={cn(
                      'size-2.5 rounded-[3px]',
                      s === 'untested' && 'border border-[#ced4da]',
                    )}
                    style={{ background: RESULT_TONES[s].bar }}
                  />
                  <strong>{counts[s]}</strong> {label}
                </button>
              );
            })}
            {total === 0 && <span className="text-xs text-muted-foreground">No cases yet</span>}
          </div>
        </div>
        <div className="flex flex-wrap items-start gap-8">
          <Stat
            label="Executed"
            value={`${executed} / ${total}`}
            hint={total ? formatPercent(progressOf(counts)) : undefined}
          />
          <Stat label="Pass rate" value={formatPercent(passRateOf(counts))} />
          <Stat
            label="Remaining estimate"
            value={formatMinutes(run.estimate.remainingMinutes) || '—'}
            hint={
              run.estimate.totalMinutes
                ? `of ${formatMinutes(run.estimate.totalMinutes)}`
                : 'No estimates'
            }
          />
          <Stat
            label="Judgement"
            value={<JudgementBadge judgement={run.judgement} />}
            hint={
              run.suggestedJudgement && run.suggestedJudgement !== run.judgement
                ? `Suggested: ${JUDGEMENT_LABELS[run.suggestedJudgement]}`
                : undefined
            }
          />
        </div>
      </div>
      <Separator className="my-3" />
      <button
        type="button"
        onClick={toggleEnv}
        aria-expanded={envOpen}
        aria-controls="run-env"
        className="flex w-full min-w-0 items-center gap-2 rounded-sm text-left focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {envOpen ? (
          <ChevronDown className="size-4 shrink-0" aria-hidden />
        ) : (
          <ChevronRight className="size-4 shrink-0" aria-hidden />
        )}
        <span className="shrink-0 text-sm font-semibold">Environment</span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {run.environment.length} {run.environment.length === 1 ? 'value' : 'values'}
        </span>
        {!envOpen && envSummary && (
          <span className="min-w-0 truncate text-xs text-muted-foreground">· {envSummary}</span>
        )}
      </button>
      {envOpen && (
        <div id="run-env" className="pt-3">
          <EnvGrid entries={run.environment} />
        </div>
      )}
    </Card>
  );
}

'use client';

import { JUDGEMENT_LABELS, totalOf, type PlanDTO, type RunSummaryDTO } from '@tmt/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { MouseEvent } from 'react';
import { JudgementBadge } from '@/components/common/badges';
import { MonoId } from '@/components/common/mono-id';
import { StackedProgress } from '@/components/common/stacked-progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { HEAD_ROW, TH } from '@/features/reports/report-ui';
import { formatDate, formatDateTime, formatRelative, pluralize } from '@/lib/format';
import { routes } from '@/lib/routes';
import { cn } from '@/lib/utils';
import { useProject } from '@/providers/project-provider';
import { envSummary, suiteNamesOf, suitesLabel } from './plan-utils';
import { PlanStatusPill } from './plan-status-pill';

interface PlanTableProps {
  plans: PlanDTO[];
  /** Release column (the plans list; the dashboard is already scoped to one release). */
  showRelease?: boolean;
  /** `count` = number of runs, `chips` = run codes with their scenario (dashboard). */
  runs?: 'count' | 'chips';
  showUpdated?: boolean;
}

const MAX_CHIPS = 4;

/** Test plans with progress, judgement and status. The title is the link; the row is clickable too. */
export function PlanTable({
  plans,
  showRelease = false,
  runs = 'count',
  showUpdated = false,
}: PlanTableProps) {
  const { projectId } = useProject();
  const router = useRouter();
  const open = (e: MouseEvent<HTMLTableRowElement>, href: string) => {
    if ((e.target as HTMLElement).closest('a, button, input, [role="button"]')) return;
    if (window.getSelection()?.toString()) return; // selecting text, not opening
    router.push(href);
  };

  return (
    <Table className={showRelease || showUpdated ? 'min-w-[1040px]' : 'min-w-[920px]'}>
      <TableHeader>
        <TableRow className={HEAD_ROW}>
          <TableHead className={cn(TH, 'pl-5')}>Test plan</TableHead>
          {showRelease && <TableHead className={TH}>Release</TableHead>}
          <TableHead className={TH}>
            {runs === 'chips' ? 'Runs (configurations)' : 'Runs'}
          </TableHead>
          <TableHead className={cn(TH, 'min-w-[230px]')}>Progress</TableHead>
          <TableHead className={TH}>Judgement</TableHead>
          <TableHead className={cn(TH, !showUpdated && 'pr-5')}>Status</TableHead>
          {showUpdated && <TableHead className={cn(TH, 'pr-5')}>Updated</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {plans.map((p) => {
          const href = routes.plan(projectId, p.id);
          const suites = suitesLabel(suiteNamesOf(p));
          const total = totalOf(p.counts);
          return (
            <TableRow key={p.id} className="cursor-pointer" onClick={(e) => open(e, href)}>
              <TableCell className="max-w-[420px] py-3 pl-5 align-top whitespace-normal">
                <MonoId className="text-muted-foreground">{p.docNo}</MonoId>
                <Link
                  href={href}
                  className="block text-sm font-semibold [overflow-wrap:anywhere] text-foreground hover:underline"
                >
                  {p.title}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {suites ? `${suites} · ` : ''}
                  {pluralize(total, 'run case')}
                </p>
              </TableCell>
              {showRelease && (
                <TableCell className="py-3 align-top whitespace-nowrap">
                  {p.release?.name ?? '—'}
                </TableCell>
              )}
              <TableCell className="py-3 align-top">
                {runs === 'chips' ? <RunChips runs={p.runs} /> : p.runs.length}
              </TableCell>
              <TableCell className="min-w-[230px] py-3 align-top">
                {total === 0 ? (
                  <span className="text-sm text-muted-foreground">No runs yet</span>
                ) : (
                  <StackedProgress counts={p.counts} showPercent showSummary />
                )}
              </TableCell>
              <TableCell className="py-3 align-top">
                <JudgementBadge judgement={p.overallJudgement} />
                {!p.overallJudgement && p.suggestedJudgement && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Suggested: {JUDGEMENT_LABELS[p.suggestedJudgement]}
                  </p>
                )}
              </TableCell>
              <TableCell className={cn('py-3 align-top', !showUpdated && 'pr-5')}>
                <PlanStatusPill status={p.status} />
                {p.status === 'completed' && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDate(p.completedAt)}
                    {p.signedCopy ? ' · signed copy attached' : ''}
                  </p>
                )}
              </TableCell>
              {showUpdated && (
                <TableCell className="py-3 pr-5 align-top whitespace-nowrap">
                  <span
                    className="text-sm text-muted-foreground"
                    title={formatDateTime(p.updatedAt)}
                  >
                    {formatRelative(p.updatedAt)}
                  </span>
                </TableCell>
              )}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/** Run codes as small chips (`KR_01  AP · iOS`); the rest folds into "+N more". */
function RunChips({ runs }: { runs: RunSummaryDTO[] }) {
  if (runs.length === 0) return <span className="text-sm text-muted-foreground">—</span>;
  const shown = runs.slice(0, MAX_CHIPS);
  const rest = runs.slice(MAX_CHIPS);
  return (
    <div className="flex max-w-[260px] flex-wrap items-center gap-1.5">
      {shown.map((r) => {
        const detail = r.scenario || envSummary(r.environment, 2);
        return (
          <span
            key={r.id}
            title={detail ? `${r.code} · ${detail}` : r.code}
            className="inline-flex h-6 max-w-[250px] items-center overflow-hidden rounded-md bg-secondary px-2 text-xs font-medium whitespace-nowrap text-[#343a40]"
          >
            <span className="font-mono font-semibold">{r.code}</span>
            {detail && <span className="ml-1.5 truncate">{detail}</span>}
          </span>
        );
      })}
      {rest.length > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0} className="text-xs font-semibold text-muted-foreground">
              +{rest.length} more
            </span>
          </TooltipTrigger>
          <TooltipContent>{rest.map((r) => r.code).join(', ')}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

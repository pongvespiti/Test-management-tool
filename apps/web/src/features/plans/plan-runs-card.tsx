'use client';

import {
  executedOf,
  formatPercent,
  JUDGEMENT_LABELS,
  passRateOf,
  totalOf,
  type PlanDTO,
  type RunDTO,
} from '@tmt/shared';
import {
  Copy,
  Ellipsis,
  ExternalLink,
  FileText,
  Pencil,
  Play,
  Plus,
  Repeat,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { JudgementBadge } from '@/components/common/badges';
import { confirmDelete } from '@/components/common/confirm-host';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorAlert, Spinner } from '@/components/common/error-alert';
import { MonoId } from '@/components/common/mono-id';
import { StackedProgress } from '@/components/common/stacked-progress';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { HEAD_ROW, SectionCard, TH } from '@/features/reports/report-ui';
import { useModalTarget } from '@/hooks/use-modal-target';
import { useInvalidateReports } from '@/lib/api/reports';
import { useDeleteRun, useRuns } from '@/lib/api/runs';
import { formatDate, pluralize } from '@/lib/format';
import { notifyError, notifySuccess } from '@/lib/notify';
import { routes } from '@/lib/routes';
import { cn } from '@/lib/utils';
import { useProject } from '@/providers/project-provider';
import { NewRunForm } from './new-run-form';
import { envSummary } from './plan-utils';
import { DuplicateRunForm, EditRunForm, RerunForm } from './run-forms';

const LOCKED = 'The plan is completed — reopen it to change runs';
/** Environment values shown in the table; the tooltip lists all of them. */
const ENV_SHOWN = 2;

interface Props {
  plan: PlanDTO;
  /** Tester or lead and the plan is not completed. */
  editable: boolean;
  /** Lead: may delete runs. */
  canDelete: boolean;
  /** Tester or lead (shows the run actions, disabled while the plan is locked). */
  canWrite: boolean;
}

/** Runs (configurations / Test IDs) of a plan with their progress, judgement and actions. */
export function PlanRunsCard({ plan, editable, canDelete, canWrite }: Props) {
  const { projectId } = useProject();
  const runs = useRuns(projectId, plan.id);
  const removeRun = useDeleteRun(projectId);
  const invalidateReports = useInvalidateReports(projectId);
  const creator = useModalTarget<true>();
  const editor = useModalTarget<RunDTO>();
  const duplicator = useModalTarget<RunDTO>();
  const rerunner = useModalTarget<RunDTO>();
  const list = runs.data ?? [];
  const locked = plan.status === 'completed';

  const onDelete = (run: RunDTO) =>
    confirmDelete(
      `run ${run.code}`,
      async () => {
        try {
          await removeRun.mutateAsync(run.id);
          invalidateReports();
          notifySuccess(`Run ${run.code} deleted.`);
        } catch (err) {
          notifyError(err, 'Could not delete the run');
        }
      },
      <span className="mt-2 block">
        Its {pluralize(totalOf(run.counts), 'case')} and{' '}
        {pluralize(executedOf(run.counts), 'recorded result')} are deleted with it.
      </span>,
    );

  const newRunButton = canWrite && (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={locked ? 0 : undefined} className="inline-flex">
          <Button onClick={() => creator.open(true)} disabled={!editable}>
            <Plus />
            New run
          </Button>
        </span>
      </TooltipTrigger>
      {locked && <TooltipContent>{LOCKED}</TooltipContent>}
    </Tooltip>
  );

  return (
    <SectionCard
      title="Test runs (configurations)"
      subtitle="Each run executes a suite on one configuration — its Test ID"
      actions={newRunButton}
      flush
    >
      {runs.isPending ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : runs.isError ? (
        <div className="px-5 pb-5">
          <ErrorAlert error={runs.error} onRetry={() => void runs.refetch()} />
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          compact
          icon={<Play className="size-6" strokeWidth={1.6} />}
          title="No runs yet"
          description="Add a run for each configuration you test: pick a suite, filter its cases and record the test environment."
          action={newRunButton}
        />
      ) : (
        <Table className="min-w-[960px]">
          <TableHeader>
            <TableRow className={HEAD_ROW}>
              <TableHead className={cn(TH, 'pl-5')}>Run</TableHead>
              <TableHead className={TH}>Suite</TableHead>
              <TableHead className={TH}>Environment</TableHead>
              <TableHead className={TH}>Tester · date</TableHead>
              <TableHead className={cn(TH, 'min-w-[190px]')}>Results</TableHead>
              <TableHead className={cn(TH, 'text-right')}>Pass rate</TableHead>
              <TableHead className={TH}>Judgement</TableHead>
              <TableHead className={cn(TH, 'w-14 pr-5')}>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((run) => (
              <RunRow
                key={run.id}
                run={run}
                projectId={projectId}
                canWrite={canWrite}
                canDelete={canDelete}
                locked={locked}
                onEdit={() => editor.open(run)}
                onDuplicate={() => duplicator.open(run)}
                onRerun={() => rerunner.open(run)}
                onDelete={() => onDelete(run)}
              />
            ))}
          </TableBody>
        </Table>
      )}

      <RunDialog open={creator.opened} onClose={creator.close} title={`New run · ${plan.docNo}`}>
        <NewRunForm
          key={creator.key}
          projectId={projectId}
          planId={plan.id}
          existingRuns={list}
          onDone={creator.close}
        />
      </RunDialog>
      <RunDialog
        open={editor.opened}
        onClose={editor.close}
        title={editor.target ? `Edit run ${editor.target.code}` : 'Edit run'}
      >
        {editor.target && (
          <EditRunForm
            key={editor.key}
            projectId={projectId}
            run={editor.target}
            onDone={editor.close}
          />
        )}
      </RunDialog>
      <RunDialog
        open={duplicator.opened}
        onClose={duplicator.close}
        title={duplicator.target ? `Duplicate run ${duplicator.target.code}` : 'Duplicate run'}
      >
        {duplicator.target && (
          <DuplicateRunForm
            key={duplicator.key}
            projectId={projectId}
            run={duplicator.target}
            planRuns={list}
            onDone={duplicator.close}
          />
        )}
      </RunDialog>
      <RunDialog
        open={rerunner.opened}
        onClose={rerunner.close}
        title={rerunner.target ? `Re-run ${rerunner.target.code}` : 'Re-run'}
        narrow
      >
        {rerunner.target && (
          <RerunForm
            key={rerunner.key}
            projectId={projectId}
            run={rerunner.target}
            planRuns={list}
            onDone={rerunner.close}
          />
        )}
      </RunDialog>
    </SectionCard>
  );
}

function RunDialog({
  open,
  onClose,
  title,
  narrow = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** 620px instead of 780px. */
  narrow?: boolean;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        aria-describedby={undefined}
        className={narrow ? 'sm:max-w-[620px]' : 'sm:max-w-[780px]'}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

interface RunRowProps {
  run: RunDTO;
  projectId: number;
  canWrite: boolean;
  canDelete: boolean;
  locked: boolean;
  onEdit: () => void;
  onDuplicate: () => void;
  onRerun: () => void;
  onDelete: () => void;
}

function RunRow({
  run,
  projectId,
  canWrite,
  canDelete,
  locked,
  onEdit,
  onDuplicate,
  onRerun,
  onDelete,
}: RunRowProps) {
  const href = routes.run(projectId, run.id);
  const filledEnv = run.environment.filter((e) => e.value.trim() !== '');
  const passRate = passRateOf(run.counts);

  return (
    <TableRow>
      <TableCell className="max-w-[220px] py-3 pl-5 align-top whitespace-normal">
        <Link href={href} className="font-mono text-sm font-semibold text-primary hover:underline">
          {run.code}
        </Link>
        {run.scenario && (
          <p className="text-xs [overflow-wrap:anywhere] text-muted-foreground">{run.scenario}</p>
        )}
        {run.sourceRun && (
          <Link
            href={routes.run(projectId, run.sourceRun.id)}
            title={`Open the source run ${run.sourceRun.code}`}
            className="mt-1.5 inline-flex items-center gap-1 rounded-sm bg-[#f3f0ff] px-1.5 py-0.5 text-xs font-semibold [overflow-wrap:anywhere] text-[#5f3dc4] hover:underline"
          >
            <Repeat aria-hidden className="size-3 shrink-0" strokeWidth={2} />
            Re-run of {run.sourceRun.code}
          </Link>
        )}
      </TableCell>
      <TableCell className="max-w-[180px] py-3 align-top whitespace-normal">
        <p className="text-sm">{run.suite.name}</p>
        <MonoId className="text-muted-foreground">{run.suite.prefix}</MonoId>
      </TableCell>
      <TableCell className="max-w-[200px] py-3 align-top whitespace-normal">
        {filledEnv.length === 0 ? (
          <span className="text-sm text-muted-foreground">Not recorded</span>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                tabIndex={0}
                aria-label={`Environment: ${filledEnv.map((e) => `${e.label} ${e.value}`).join(', ')}`}
                className="cursor-help"
              >
                <p className="line-clamp-2 text-sm underline decoration-[#adb5bd] decoration-dotted underline-offset-[3px]">
                  {envSummary(filledEnv, ENV_SHOWN)}
                </p>
                {filledEnv.length > ENV_SHOWN && (
                  <p className="text-xs text-muted-foreground">
                    +{filledEnv.length - ENV_SHOWN} more
                  </p>
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent className="max-w-80">
              <ul className="grid gap-0.5">
                {filledEnv.map((e, i) => (
                  <li key={`${e.label}-${i}`}>
                    <span className="font-semibold opacity-70">{e.label}:</span> {e.value}
                  </li>
                ))}
              </ul>
            </TooltipContent>
          </Tooltip>
        )}
      </TableCell>
      <TableCell className="py-3 align-top whitespace-nowrap">
        <p className="text-sm">{run.tester?.displayName ?? '—'}</p>
        <p className="text-xs text-muted-foreground">
          {run.testedDate ? formatDate(run.testedDate) : 'No date'}
        </p>
      </TableCell>
      <TableCell className="min-w-[190px] py-3 align-top">
        <StackedProgress counts={run.counts} showSummary />
      </TableCell>
      <TableCell className="py-3 text-right align-top text-sm font-semibold">
        {formatPercent(passRate, 1)}
      </TableCell>
      <TableCell className="py-3 align-top">
        <JudgementBadge judgement={run.judgement} />
        {!run.judgement && run.suggestedJudgement && (
          <p className="mt-1 text-xs text-muted-foreground">
            Suggested: {JUDGEMENT_LABELS[run.suggestedJudgement]}
          </p>
        )}
      </TableCell>
      <TableCell className="py-3 pr-5 align-top">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Actions for run ${run.code}`}
              className="text-muted-foreground"
            >
              <Ellipsis />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuItem asChild>
              <Link href={href}>
                <ExternalLink />
                Open run
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={routes.runReport(projectId, run.id)}>
                <FileText />
                Run report
              </Link>
            </DropdownMenuItem>
            {canWrite && (
              <>
                <DropdownMenuSeparator />
                {locked && (
                  <DropdownMenuLabel className="text-xs font-normal whitespace-normal text-muted-foreground">
                    {LOCKED}
                  </DropdownMenuLabel>
                )}
                <DropdownMenuItem onSelect={onEdit} disabled={locked}>
                  <Pencil />
                  Edit run…
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={onDuplicate} disabled={locked}>
                  <Copy />
                  Duplicate for a new configuration…
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={onRerun} disabled={locked}>
                  <Repeat />
                  Re-run NG / blocked…
                </DropdownMenuItem>
              </>
            )}
            {canDelete && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={onDelete} disabled={locked}>
                  <Trash2 />
                  Delete run
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

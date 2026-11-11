'use client';

import { JUDGEMENT_LABELS, totalOf, type PlanDTO } from '@tmt/shared';
import {
  ClipboardX,
  Ellipsis,
  FileSpreadsheet,
  Lock,
  LockOpen,
  Pencil,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { confirmAction, confirmDelete } from '@/components/common/confirm-host';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorAlert, Spinner } from '@/components/common/error-alert';
import { PageHeader, type Crumb } from '@/components/common/page-header';
import { StatusPill } from '@/components/common/status-pill';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useModalTarget } from '@/hooks/use-modal-target';
import { ApiError } from '@/lib/api/client';
import { useCompletePlan, useDeletePlan, usePlan, useReopenPlan } from '@/lib/api/plans';
import { formatDate, formatDateTime, pluralize } from '@/lib/format';
import { toId } from '@/lib/forms';
import { notifyError, notifySuccess } from '@/lib/notify';
import { routes, toQueryString } from '@/lib/routes';
import { PLAN_STATUS_TONES } from '@/lib/status';
import { useProject } from '@/providers/project-provider';
import { ExportDialog } from './export-dialog';
import { PlanFormDialog } from './plan-form';
import { PlanJudgementCard } from './plan-judgement-card';
import { PlanMatrixCard } from './plan-matrix-card';
import { PlanOverviewCard } from './plan-overview-card';
import { PlanRunsCard } from './plan-runs-card';
import { PlanStatusPill } from './plan-status-pill';
import { suiteNamesOf, suitesLabel } from './plan-utils';
import { SignOffCard } from './sign-off-card';

const LOCKED_HINT = 'Completed plans are locked — reopen the plan to change it';

/** Test plan: header + actions, sign-off, overview, judgement, runs and the summary matrix. */
export function PlanDetailPage() {
  const { projectId } = useProject();
  const params = useParams<{ planId?: string | string[] }>();
  const raw = params?.planId;
  const planId = toId(Array.isArray(raw) ? raw[0] : raw);
  const plan = usePlan(projectId, planId);
  const crumbs: Crumb[] = [{ label: 'Test plans', href: routes.plans(projectId) }];

  if (planId === null || plan.isError) {
    const notFound =
      planId === null || (plan.error instanceof ApiError && plan.error.status === 404);
    const back = (
      <Button asChild variant="outline" className="w-fit">
        <Link href={routes.plans(projectId)}>Back to test plans</Link>
      </Button>
    );
    return (
      <>
        <PageHeader title="Test plan" breadcrumbs={crumbs} />
        {notFound ? (
          <Card>
            <EmptyState
              icon={<ClipboardX className="size-6" strokeWidth={1.6} />}
              title="Test plan not found"
              description="It may have been deleted, or the link is wrong."
              action={back}
            />
          </Card>
        ) : (
          <div className="flex max-w-[560px] flex-col gap-4">
            <ErrorAlert error={plan.error} onRetry={() => void plan.refetch()} />
            {back}
          </div>
        )}
      </>
    );
  }
  if (!plan.data)
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  return <PlanDetail plan={plan.data} />;
}

function PlanDetail({ plan }: { plan: PlanDTO }) {
  const { projectId, can } = useProject();
  const router = useRouter();
  const editor = useModalTarget<true>();
  const exporter = useModalTarget<true>();
  const complete = useCompletePlan(projectId);
  const reopen = useReopenPlan(projectId);
  const remove = useDeletePlan(projectId);

  const locked = plan.status === 'completed';
  const canWrite = can('writePlans');
  const editable = canWrite && !locked;
  const total = totalOf(plan.counts);
  const allExecuted = total > 0 && plan.counts.untested === 0;
  const suites = suitesLabel(suiteNamesOf(plan));

  const crumbs: Crumb[] = [
    ...(plan.release
      ? [
          {
            label: plan.release.name,
            href: `${routes.dashboard(projectId)}${toQueryString({ release: plan.release.id })}`,
          },
        ]
      : []),
    { label: 'Test plans', href: routes.plans(projectId) },
    { label: <span className="font-mono">{plan.docNo}</span> },
  ];

  const onComplete = () =>
    confirmAction({
      title: 'Complete the plan and lock its results?',
      message: (
        <span className="flex flex-col gap-2">
          {plan.counts.untested > 0 && (
            <span className="font-semibold text-warning">
              {pluralize(plan.counts.untested, 'run case is', 'run cases are')} still untested.
            </span>
          )}
          {!plan.overallJudgement && (
            <span>
              No overall judgement is set
              {plan.suggestedJudgement
                ? ` (suggested: ${JUDGEMENT_LABELS[plan.suggestedJudgement]})`
                : ''}
              .
            </span>
          )}
          <span>
            Results, runs and plan details become read-only
            {can('reopenPlan') ? ' until you reopen the plan' : ' — only a lead can reopen it'}.
            Then export the report, sign it and attach the scan.
          </span>
        </span>
      ),
      confirmLabel: 'Complete & lock',
      onConfirm: async () => {
        try {
          await complete.mutateAsync(plan.id);
          notifySuccess(`${plan.docNo} completed — results are locked.`);
        } catch (err) {
          notifyError(err, 'Could not complete the plan');
        }
      },
    });

  const onReopen = () =>
    confirmAction({
      title: 'Reopen the plan?',
      message:
        'Runs, results and plan details become editable again. Export a new report after the changes.',
      confirmLabel: 'Reopen',
      onConfirm: async () => {
        try {
          await reopen.mutateAsync(plan.id);
          notifySuccess(`${plan.docNo} reopened.`);
        } catch (err) {
          notifyError(err, 'Could not reopen the plan');
        }
      },
    });

  const onDelete = () =>
    confirmDelete(
      `test plan ${plan.docNo}`,
      async () => {
        try {
          await remove.mutateAsync(plan.id);
          notifySuccess(`Test plan ${plan.docNo} deleted.`);
          router.push(routes.plans(projectId));
        } catch (err) {
          notifyError(err, 'Could not delete the test plan');
        }
      },
      <span className="mt-2 block">
        Its {pluralize(plan.runs.length, 'run')} and {pluralize(total, 'result')} are deleted too.
      </span>,
    );

  const actions = (
    <>
      <Button variant="outline" onClick={() => exporter.open(true)}>
        <FileSpreadsheet />
        Export report
      </Button>
      {canWrite && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={locked ? 0 : undefined} className="inline-flex">
              <Button variant="outline" onClick={() => editor.open(true)} disabled={locked}>
                <Pencil />
                Edit
              </Button>
            </span>
          </TooltipTrigger>
          {locked && <TooltipContent>{LOCKED_HINT}</TooltipContent>}
        </Tooltip>
      )}
      {!locked && can('completePlan') && (
        <Button onClick={onComplete} loading={complete.isPending}>
          {!complete.isPending && <Lock />}
          Complete &amp; lock results
        </Button>
      )}
      {locked && can('reopenPlan') && (
        <Button variant="outline" onClick={onReopen} loading={reopen.isPending}>
          {!reopen.isPending && <LockOpen />}
          Reopen
        </Button>
      )}
      {can('deletePlans') && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" aria-label="More plan actions">
              <Ellipsis />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem variant="destructive" disabled={locked} onSelect={onDelete}>
              <Trash2 />
              Delete plan
            </DropdownMenuItem>
            {locked && (
              <DropdownMenuLabel className="text-xs font-normal whitespace-normal text-muted-foreground">
                Reopen the plan to delete it.
              </DropdownMenuLabel>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </>
  );

  return (
    <>
      <PageHeader
        breadcrumbs={crumbs}
        eyebrow={<span className="font-mono">Doc no. {plan.docNo}</span>}
        badges={
          <>
            <PlanStatusPill status={plan.status} />
            {!locked && allExecuted && (
              <StatusPill tone={PLAN_STATUS_TONES.in_progress}>
                All runs finished · ready to complete
              </StatusPill>
            )}
          </>
        }
        title={plan.title}
        subtitle={[
          plan.release ? `Release ${plan.release.name}` : 'No release',
          suites ?? 'No runs yet',
          `Created ${formatDate(plan.createdAt)}${plan.createdBy ? ` by ${plan.createdBy.displayName}` : ''}`,
        ].join(' · ')}
        actions={actions}
      />

      <div className="flex flex-col gap-6">
        {locked && (
          <Alert className="bg-secondary">
            <Lock />
            <AlertTitle>Completed — results are locked</AlertTitle>
            <AlertDescription className="text-foreground">
              <p>
                Completed {formatDateTime(plan.completedAt)}
                {plan.completedBy ? ` by ${plan.completedBy.displayName}` : ''}
              </p>
              <p>
                Runs, results and plan details can no longer be changed
                {can('reopenPlan')
                  ? ' — reopen the plan to make changes.'
                  : ' — ask a lead to reopen the plan if something must change.'}
              </p>
            </AlertDescription>
          </Alert>
        )}

        <SignOffCard plan={plan} projectId={projectId} canWrite={canWrite} />

        <div className="grid items-stretch gap-6 lg:grid-cols-12">
          <div className="min-w-0 lg:col-span-7">
            <PlanOverviewCard
              plan={plan}
              projectId={projectId}
              editable={editable}
              lockedReason={canWrite && locked ? LOCKED_HINT : undefined}
            />
          </div>
          <div className="min-w-0 lg:col-span-5">
            <PlanJudgementCard plan={plan} projectId={projectId} editable={editable} />
          </div>
        </div>

        <PlanRunsCard
          plan={plan}
          editable={editable}
          canWrite={canWrite}
          canDelete={can('deletePlans')}
        />

        <PlanMatrixCard plan={plan} />
      </div>

      <PlanFormDialog
        open={editor.opened}
        formKey={editor.key}
        plan={plan}
        onClose={editor.close}
      />
      <ExportDialog
        plan={plan}
        open={exporter.opened}
        formKey={exporter.key}
        onClose={exporter.close}
      />
    </>
  );
}

'use client';

import type { ReviewDecision, TestCaseDTO } from '@tmt/shared';
import { ArrowRight, Check, CheckCheck, ClipboardCheck, MessageSquareWarning } from 'lucide-react';
import Link from 'next/link';
import { Suspense, useMemo, useState } from 'react';
import { confirmAction } from '@/components/common/confirm-host';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorAlert, Spinner } from '@/components/common/error-alert';
import { IconButton } from '@/components/common/icon-button';
import { MonoId } from '@/components/common/mono-id';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useModalTarget } from '@/hooks/use-modal-target';
import { useBulkCases, useSuites } from '@/lib/api/library';
import { useReviewQueue } from '@/lib/api/shared-steps';
import { formatDateTime, formatRelative, pluralize } from '@/lib/format';
import { notifyError, notifySuccess } from '@/lib/notify';
import { routes } from '@/lib/routes';
import { useProject } from '@/providers/project-provider';
import { LoadingOverlay, SegmentedControl, SelectionBar } from '@/components/common/list-controls';
import { REVIEW_BUTTON, ReviewDialog } from '@/features/cases/review-dialogs';
import { caseLink } from '@/features/cases/use-cases-url-state';
import { useUrlSearchParams } from '@/hooks/use-url-search-params';

/** The server returns at most this many cases (oldest requests first). */
const QUEUE_LIMIT = 500;

const SCOPES = [
  { value: 'all', label: 'All in review' },
  { value: 'mine', label: 'Waiting for me' },
] as const;

/** Case ids by suite (bulk approval works per suite). */
export function idsBySuite(cases: readonly Pick<TestCaseDTO, 'id' | 'suiteId'>[]) {
  const bySuite = new Map<number, number[]>();
  for (const c of cases) bySuite.set(c.suiteId, [...(bySuite.get(c.suiteId) ?? []), c.id]);
  return bySuite;
}

/** Review queue: cases in review (oldest request first) with approve / request changes for leads. */
export function ReviewsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      }
    >
      <ReviewQueue />
    </Suspense>
  );
}

function ReviewQueue() {
  const { projectId, can, project } = useProject();
  const isLead = can('reviewCases');
  const [params, setParams] = useUrlSearchParams();
  const mine = params.get('mine') === '1';
  const queue = useReviewQueue(projectId, mine);
  const suites = useSuites(projectId, true);
  const bulk = useBulkCases(projectId);
  const decision = useModalTarget<{ testCase: TestCaseDTO; decision: ReviewDecision }>();
  const [picked, setPicked] = useState<ReadonlySet<number>>(() => new Set());
  const items = useMemo(() => queue.data ?? [], [queue.data]);
  // Only cases still in the list count as selected.
  const selected = useMemo(
    () => new Set(items.filter((c) => picked.has(c.id)).map((c) => c.id)),
    [items, picked],
  );

  const suiteName = useMemo(() => {
    const map = new Map((suites.data ?? []).map((s) => [s.id, s.name]));
    return (id: number) => map.get(id) ?? `Suite #${id}`;
  }, [suites.data]);

  const toggle = (id: number) =>
    setPicked(() => {
      const next = new Set(selected);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const approveSelected = () => {
    const chosen = items.filter((c) => selected.has(c.id));
    confirmAction({
      title: `Approve ${pluralize(chosen.length, 'case')}?`,
      message: 'The cases become Ready. Use “Request changes” on a row to send one back instead.',
      confirmLabel: 'Approve',
      onConfirm: async () => {
        let affected = 0;
        try {
          for (const [suiteId, ids] of idsBySuite(chosen)) {
            const res = await bulk.mutateAsync({ suiteId, ids, action: 'approve' });
            affected += res.affected;
          }
          notifySuccess(`Approved ${pluralize(affected, 'case')}.`);
          setPicked(new Set());
        } catch (err) {
          notifyError(err, affected > 0 ? `Approved ${affected}, then failed` : 'Approve failed');
        }
      },
    });
  };

  const allSelected = items.length > 0 && selected.size === items.length;

  let body;
  if (queue.isPending) {
    body = <p className="p-4 text-sm text-muted-foreground">Loading the review queue…</p>;
  } else if (queue.isError) {
    body = (
      <div className="p-4">
        <ErrorAlert
          error={queue.error}
          title="Reviews could not be loaded"
          onRetry={() => void queue.refetch()}
        />
      </div>
    );
  } else if (items.length === 0) {
    body = (
      <EmptyState
        icon={<ClipboardCheck className="size-6" strokeWidth={1.6} />}
        title={mine ? 'Nothing is waiting for you' : 'No test cases are waiting for review'}
        description={
          mine
            ? 'Cases assigned to you or to any lead show up here when someone submits them.'
            : 'Testers send cases here with “Submit for review” in the case panel or the bulk actions of the test case library.'
        }
        action={
          <Button asChild variant="outline">
            <Link href={routes.cases(projectId)}>
              Open the test case library
              <ArrowRight />
            </Link>
          </Button>
        }
      />
    );
  } else {
    body = (
      <Table className="min-w-[1000px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {isLead && (
              <TableHead className="w-10">
                <Checkbox
                  aria-label="Select all cases in the queue"
                  checked={allSelected ? true : selected.size > 0 ? 'indeterminate' : false}
                  onCheckedChange={(on) =>
                    setPicked(on === true ? new Set(items.map((c) => c.id)) : new Set())
                  }
                />
              </TableHead>
            )}
            <TableHead className="w-[110px]">ID</TableHead>
            <TableHead>Test case</TableHead>
            <TableHead className="w-[150px]">Requested by</TableHead>
            <TableHead className="w-[140px]">Requested</TableHead>
            <TableHead className="w-[140px]">Reviewer</TableHead>
            <TableHead className="w-[220px]">Note</TableHead>
            <TableHead className={isLead ? 'w-[200px]' : 'w-20'}>
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((c) => {
            const r = c.review;
            const href = caseLink(projectId, c);
            return (
              <TableRow key={c.id} data-state={selected.has(c.id) ? 'selected' : undefined}>
                {isLead && (
                  <TableCell>
                    <Checkbox
                      aria-label={`Select ${c.displayId}`}
                      checked={selected.has(c.id)}
                      onCheckedChange={() => toggle(c.id)}
                    />
                  </TableCell>
                )}
                <TableCell>
                  <Link href={href} className="text-accent-foreground hover:underline">
                    <MonoId>{c.displayId}</MonoId>
                  </Link>
                  {c.code && (
                    <p
                      className="max-w-[100px] truncate font-mono text-xs text-muted-foreground"
                      title={c.code}
                    >
                      {c.code}
                    </p>
                  )}
                </TableCell>
                <TableCell className="whitespace-normal">
                  <Link href={href} className="line-clamp-2 text-sm font-medium hover:underline">
                    {c.title}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">
                    {[suiteName(c.suiteId), ...c.sectionPath].join(' › ')}
                  </p>
                </TableCell>
                <TableCell>{r.requestedBy?.displayName ?? '—'}</TableCell>
                <TableCell>
                  <span className="text-muted-foreground" title={formatDateTime(r.requestedAt)}>
                    {formatRelative(r.requestedAt)}
                  </span>
                </TableCell>
                <TableCell>
                  {r.reviewer ? (
                    r.reviewer.displayName
                  ) : (
                    <span className="text-muted-foreground">Any lead</span>
                  )}
                </TableCell>
                <TableCell className="max-w-[220px] whitespace-normal">
                  {r.note ? (
                    <Tooltip delayDuration={400}>
                      <TooltipTrigger asChild>
                        <p className="line-clamp-2 text-sm">{r.note}</p>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[360px] whitespace-pre-wrap">
                        {r.note}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1.5">
                    {isLead && (
                      <>
                        <Button
                          size="sm"
                          className={`h-7 ${REVIEW_BUTTON.approve}`}
                          onClick={() => decision.open({ testCase: c, decision: 'approve' })}
                        >
                          <Check />
                          Approve
                        </Button>
                        <IconButton
                          label={`Request changes on ${c.displayId}`}
                          className="size-7 border bg-card"
                          onClick={() =>
                            decision.open({ testCase: c, decision: 'request_changes' })
                          }
                        >
                          <MessageSquareWarning />
                        </IconButton>
                      </>
                    )}
                    <IconButton
                      asChild
                      label={`Open ${c.displayId} in the library`}
                      className="size-7 text-primary"
                    >
                      <Link href={href}>
                        <ArrowRight />
                      </Link>
                    </IconButton>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    );
  }

  return (
    <>
      <PageHeader
        title="Reviews"
        subtitle={
          project.requireCaseReview
            ? 'Test cases waiting for a lead’s approval. Only approved cases become Ready.'
            : 'Test cases waiting for a lead’s approval.'
        }
      />
      <Card className="gap-0 py-0">
        <div className="flex flex-col gap-3 px-4 pt-4 pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <SegmentedControl
                aria-label="Which cases to show"
                options={SCOPES}
                value={mine ? 'mine' : 'all'}
                onChange={(v) =>
                  setParams((prev) => {
                    if (v === 'mine') prev.set('mine', '1');
                    else prev.delete('mine');
                    return prev;
                  })
                }
              />
              {mine && (
                <span className="text-xs text-muted-foreground">
                  Assigned to you, or to any lead
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {queue.data ? pluralize(items.length, 'case') : ''}
              {queue.data && items.length >= QUEUE_LIMIT ? ` (oldest ${QUEUE_LIMIT})` : ''}
            </p>
          </div>
          {isLead && selected.size > 0 && (
            <SelectionBar label={`${pluralize(selected.size, 'case')} selected`}>
              <Button
                size="sm"
                className={`h-8 ${REVIEW_BUTTON.approve}`}
                loading={bulk.isPending}
                onClick={approveSelected}
              >
                <CheckCheck />
                Approve selected
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8"
                onClick={() => setPicked(new Set())}
              >
                Clear
              </Button>
            </SelectionBar>
          )}
        </div>
        <div className="relative border-t">
          <LoadingOverlay visible={queue.isFetching && !queue.isPending} />
          {body}
        </div>
      </Card>
      {decision.target && (
        <ReviewDialog
          open={decision.opened}
          mode={decision.target.decision}
          testCase={decision.target.testCase}
          formKey={decision.key}
          onClose={decision.close}
        />
      )}
    </>
  );
}

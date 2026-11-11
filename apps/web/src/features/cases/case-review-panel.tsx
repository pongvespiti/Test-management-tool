'use client';

import type { TestCaseDTO, UserRef } from '@tmt/shared';
import { Check, ClipboardCheck, MessageSquareWarning, Send } from 'lucide-react';
import type { ReactNode } from 'react';
import { CaseStatusBadge } from '@/components/common/badges';
import { Button } from '@/components/ui/button';
import { useModalTarget } from '@/hooks/use-modal-target';
import { formatDateTime, formatRelative } from '@/lib/format';
import { CASE_STATUS_TONES } from '@/lib/status';
import { cn } from '@/lib/utils';
import { useProject } from '@/providers/project-provider';
import { REVIEW_BUTTON, ReviewDialog, type ReviewDialogMode } from './review-dialogs';

function Who({ user, at }: { user: UserRef | null; at: string | null }) {
  return (
    <>
      <b>{user?.displayName ?? 'someone'}</b>
      {at && (
        <span className="text-muted-foreground" title={formatDateTime(at)}>
          {' · '}
          {formatRelative(at)}
        </span>
      )}
    </>
  );
}

/**
 * Review state of a library case with the actions the user may take: submit for review (testers;
 * draft/ready), approve or request changes (leads; in review).
 */
export function CaseReviewPanel({ testCase: tc }: { testCase: TestCaseDTO }) {
  const { can, project } = useProject();
  const dialog = useModalTarget<ReviewDialogMode>();
  const r = tc.review;
  const canSubmit = can('writeLibrary') && (tc.status === 'draft' || tc.status === 'ready');
  const canDecide = can('reviewCases') && tc.status === 'in_review';
  const reviewed = Boolean(r.reviewedBy || r.reviewedAt);

  // Nothing useful to show for a deprecated case without review history.
  if (tc.status === 'deprecated' && !reviewed && !r.requestedAt) return null;

  let summary: ReactNode;
  if (tc.status === 'in_review') {
    summary = (
      <>
        <p className="text-sm">
          Waiting for <b>{r.reviewer?.displayName ?? 'any lead'}</b>
        </p>
        <p className="text-sm text-muted-foreground">
          Requested by <Who user={r.requestedBy} at={r.requestedAt} />
        </p>
      </>
    );
  } else if (reviewed) {
    summary = (
      <>
        <p className="text-sm">
          {tc.status === 'ready' ? 'Approved by ' : 'Last reviewed by '}
          <Who user={r.reviewedBy} at={r.reviewedAt} />
        </p>
        {r.requestedBy && (
          <p className="text-sm text-muted-foreground">
            Submitted by <Who user={r.requestedBy} at={r.requestedAt} />
          </p>
        )}
      </>
    );
  } else {
    summary = (
      <p className="text-sm text-muted-foreground">
        {tc.status === 'deprecated'
          ? 'Deprecated cases are not reviewed.'
          : tc.status === 'ready'
            ? 'Ready without a review.'
            : project.requireCaseReview
              ? 'Not reviewed yet. A lead’s approval makes the case Ready.'
              : 'Not reviewed yet.'}
      </p>
    );
  }

  const tone = CASE_STATUS_TONES[tc.status];
  return (
    <section
      aria-label="Review"
      className="flex flex-col gap-1.5 rounded-lg border p-3"
      style={{
        borderLeft: `3px solid ${tone.fg}`,
        background: tc.status === 'in_review' ? tone.bg : undefined,
      }}
    >
      <div className="flex items-center gap-2">
        <ClipboardCheck aria-hidden className="size-4 text-muted-foreground" />
        <span className="text-sm font-semibold">Review</span>
        <CaseStatusBadge status={tc.status} />
      </div>
      {summary}
      {r.note && (
        <p className="line-clamp-6 rounded-lg border bg-card p-2 text-sm whitespace-multiline">
          {r.note}
        </p>
      )}
      {(canSubmit || canDecide) && (
        <div className="mt-0.5 flex flex-wrap gap-1.5">
          {canDecide && (
            <>
              <Button
                size="sm"
                className={REVIEW_BUTTON.approve}
                onClick={() => dialog.open('approve')}
              >
                <Check />
                Approve
              </Button>
              <Button size="sm" variant="outline" onClick={() => dialog.open('request_changes')}>
                <MessageSquareWarning />
                Request changes
              </Button>
            </>
          )}
          {canSubmit && (
            <Button
              size="sm"
              variant={tc.status === 'draft' ? 'default' : 'outline'}
              className={cn(tc.status !== 'draft' && 'bg-card')}
              onClick={() => dialog.open('submit')}
            >
              <Send />
              {tc.status === 'ready' && reviewed ? 'Submit for review again' : 'Submit for review'}
            </Button>
          )}
        </div>
      )}
      {dialog.target && (
        <ReviewDialog
          open={dialog.opened}
          mode={dialog.target}
          testCase={tc}
          formKey={dialog.key}
          onClose={dialog.close}
        />
      )}
    </section>
  );
}

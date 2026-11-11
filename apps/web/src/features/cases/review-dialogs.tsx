'use client';

import type { ReviewDecision, TestCaseDTO } from '@tmt/shared';
import { Check, MessageSquareWarning, Send } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { MonoId } from '@/components/common/mono-id';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api/client';
import { useMembers } from '@/lib/api/projects';
import { useReviewDecision, useSubmitReview } from '@/lib/api/shared-steps';
import { toId } from '@/lib/forms';
import { notifyError, notifySuccess } from '@/lib/notify';
import { useProject } from '@/providers/project-provider';
import { ComboboxSelect } from '@/components/common/combobox-select';

type CaseRef = Pick<TestCaseDTO, 'id' | 'displayId' | 'title'>;

/** Solid review buttons (white text ≥ 4.5:1): approve = OK green, request changes = Blocked orange. */
export const REVIEW_BUTTON = {
  approve: 'bg-success text-white hover:bg-success/90',
  requestChanges: 'bg-warning text-white hover:bg-warning/90',
} as const;

/** Leads of the project as reviewer options (none chosen = any lead). */
export function useReviewerOptions(projectId: number) {
  const members = useMembers(projectId);
  const data = useMemo(
    () =>
      (members.data ?? [])
        .filter((m) => m.role === 'lead')
        .map((m) => ({ value: String(m.user.id), label: m.user.displayName }))
        .toSorted((a, b) => a.label.localeCompare(b.label)),
    [members.data],
  );
  return { data, isPending: members.isPending };
}

/** Reviewer picker with its label ("Any lead" = nobody in particular). */
export function ReviewerField({
  value,
  onChange,
  error,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  error?: string | null;
}) {
  const { projectId } = useProject();
  const reviewers = useReviewerOptions(projectId);
  const id = useId();
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>Reviewer</Label>
      <ComboboxSelect
        id={id}
        aria-describedby={`${id}-description`}
        aria-invalid={!!error}
        options={reviewers.data}
        value={value}
        onChange={onChange}
        placeholder="Any lead"
        clearLabel="Any lead"
        searchable={reviewers.data.length > 8}
        disabled={reviewers.isPending}
      />
      <p id={`${id}-description`} className="text-xs text-muted-foreground">
        Optional — any lead can review when nobody is chosen
      </p>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function CaseLine({ testCase }: { testCase: CaseRef }) {
  return (
    <p className="line-clamp-2 text-sm">
      <MonoId className="mr-1.5">{testCase.displayId}</MonoId>
      {testCase.title}
    </p>
  );
}

/** Body of the "Submit for review" dialog (reviewer and note optional). */
export function SubmitReviewForm({
  testCase,
  onDone,
}: {
  testCase: CaseRef;
  onDone: (saved?: TestCaseDTO) => void;
}) {
  const { projectId } = useProject();
  const submit = useSubmitReview(projectId);
  const [reviewer, setReviewer] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [reviewerError, setReviewerError] = useState<string | null>(null);
  const noteId = useId();

  const onSubmit = async () => {
    try {
      const saved = await submit.mutateAsync({
        caseId: testCase.id,
        reviewerId: toId(reviewer),
        note,
      });
      notifySuccess(`${saved.displayId} submitted for review.`);
      onDone(saved);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'BAD_REVIEWER') setReviewerError(err.message);
      else notifyError(err, 'Could not submit for review');
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <CaseLine testCase={testCase} />
      <ReviewerField
        value={reviewer}
        onChange={(v) => {
          setReviewer(v);
          setReviewerError(null);
        }}
        error={reviewerError}
      />
      <div className="grid gap-2">
        <Label htmlFor={noteId}>Note for the reviewer</Label>
        <Textarea
          id={noteId}
          aria-describedby={`${noteId}-description`}
          placeholder="What changed, what to look at…"
          rows={3}
          maxLength={5000}
          value={note}
          onChange={(e) => setNote(e.currentTarget.value)}
          autoFocus
        />
        <p id={`${noteId}-description`} className="text-xs text-muted-foreground">
          Optional — added to the case&apos;s comments
        </p>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onDone()}>
          Cancel
        </Button>
        <Button type="button" loading={submit.isPending} onClick={() => void onSubmit()}>
          <Send />
          Submit for review
        </Button>
      </DialogFooter>
    </div>
  );
}

/** Body of the Approve / Request changes dialog; requesting changes needs a note. */
export function ReviewDecisionForm({
  testCase,
  decision,
  onDone,
}: {
  testCase: CaseRef;
  decision: ReviewDecision;
  onDone: (saved?: TestCaseDTO) => void;
}) {
  const { projectId } = useProject();
  const decide = useReviewDecision(projectId);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const approve = decision === 'approve';
  const noteId = useId();

  const onSubmit = async () => {
    if (!approve && note.trim() === '') {
      setError('Say what needs to change');
      return;
    }
    try {
      const saved = await decide.mutateAsync({ caseId: testCase.id, decision, note });
      notifySuccess(
        approve
          ? `${saved.displayId} approved — it is Ready.`
          : `Changes requested — ${saved.displayId} is back in Draft.`,
      );
      onDone(saved);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'NOTE_REQUIRED') setError(err.message);
      else if (err instanceof ApiError && err.code === 'INVALID_REVIEW_STATE') {
        notifyError(err, 'This case is no longer in review');
        onDone();
      } else notifyError(err, approve ? 'Could not approve' : 'Could not request changes');
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <CaseLine testCase={testCase} />
      <div className="grid gap-2">
        <Label htmlFor={noteId} className={error ? 'text-destructive' : undefined}>
          {approve ? 'Note' : 'What needs to change?'}
        </Label>
        <Textarea
          id={noteId}
          aria-describedby={`${noteId}-description`}
          aria-invalid={!!error}
          required={!approve}
          rows={3}
          maxLength={5000}
          value={note}
          onChange={(e) => {
            setNote(e.currentTarget.value);
            setError(null);
          }}
          autoFocus
        />
        <p id={`${noteId}-description`} className="text-xs text-muted-foreground">
          {approve
            ? 'Optional — added to the case’s comments'
            : 'Required — the author sees it in the case’s comments'}
        </p>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onDone()}>
          Cancel
        </Button>
        <Button
          type="button"
          className={approve ? REVIEW_BUTTON.approve : REVIEW_BUTTON.requestChanges}
          loading={decide.isPending}
          onClick={() => void onSubmit()}
        >
          {approve ? <Check /> : <MessageSquareWarning />}
          {approve ? 'Approve' : 'Request changes'}
        </Button>
      </DialogFooter>
    </div>
  );
}

export type ReviewDialogMode = 'submit' | ReviewDecision;

const TITLES: Record<ReviewDialogMode, string> = {
  submit: 'Submit for review',
  approve: 'Approve test case',
  request_changes: 'Request changes',
};

/** Dialog around the submit / approve / request-changes forms. */
export function ReviewDialog({
  open,
  mode,
  testCase,
  formKey,
  onClose,
}: {
  open: boolean;
  mode: ReviewDialogMode;
  testCase: CaseRef;
  /** Changes on every open so the form starts fresh. */
  formKey: number;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{TITLES[mode]}</DialogTitle>
        </DialogHeader>
        {mode === 'submit' ? (
          <SubmitReviewForm key={formKey} testCase={testCase} onDone={onClose} />
        ) : (
          <ReviewDecisionForm key={formKey} testCase={testCase} decision={mode} onDone={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

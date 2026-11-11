'use client';

import { DEFECT_STATUS_LABELS, type DefectDTO, type DefectStatus } from '@tmt/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { useId, useState } from 'react';
import { DefectStatusBadge } from '@/components/common/badges';
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
import { useTransitionDefect } from '@/lib/api/defects';
import { qk } from '@/lib/api/keys';
import { notifyError, notifySuccess } from '@/lib/notify';
import { cn } from '@/lib/utils';
import {
  isForward,
  orderTransitions,
  transitionLabel,
  WORKFLOW_PATH,
  workflowIndex,
} from './defect-model';

function WorkflowPath({ status }: { status: DefectStatus }) {
  const current = workflowIndex(status);
  return (
    <ol
      aria-label="Workflow"
      className="m-0 flex list-none flex-wrap items-center gap-x-1 gap-y-1.5 p-0"
    >
      {WORKFLOW_PATH.map((s, i) => {
        const done = current >= 0 && i < current;
        const isCurrent = i === current;
        const label = isCurrent && status === 'reopened' ? 'Reopened' : DEFECT_STATUS_LABELS[s];
        return (
          <li
            key={s}
            aria-current={isCurrent ? 'step' : undefined}
            className="inline-flex items-center gap-1"
          >
            <span
              aria-hidden
              className={cn(
                'inline-flex size-5 items-center justify-center rounded-full text-[11px] font-bold',
                done && 'bg-[#2f9e44] text-white',
                isCurrent && 'bg-[#1971c2] text-white',
                !done && !isCurrent && 'border-2 border-[#adb5bd] bg-white text-[#5c6670]',
              )}
            >
              {done ? <Check className="size-3" strokeWidth={3} /> : i + 1}
            </span>
            <span
              className={cn(
                'text-xs',
                isCurrent
                  ? 'font-bold text-[#1864ab]'
                  : done
                    ? 'font-medium text-[#237032]'
                    : 'font-medium text-muted-foreground',
              )}
            >
              {label}
              {done && <span className="sr-only"> (done)</span>}
            </span>
            {i < WORKFLOW_PATH.length - 1 && (
              <span
                aria-hidden
                className={cn(
                  'mx-0.5 inline-block h-0.5 w-3',
                  done ? 'bg-[#2f9e44]' : 'bg-[#ced4da]',
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Current status, workflow path and the allowed transitions (each with an optional comment). */
export function DefectWorkflow({ defect, canEdit }: { defect: DefectDTO; canEdit: boolean }) {
  const qc = useQueryClient();
  const id = useId();
  const transition = useTransitionDefect(defect.projectId);
  const [target, setTarget] = useState<DefectStatus | null>(null);
  const [comment, setComment] = useState('');
  const from = defect.status;

  const confirm = async () => {
    if (!target) return;
    try {
      const updated = await transition.mutateAsync({
        defectId: defect.id,
        to: target,
        comment: comment.trim() || null,
      });
      notifySuccess(`${updated.key} is now ${DEFECT_STATUS_LABELS[updated.status]}.`);
      setTarget(null);
    } catch (err) {
      notifyError(err, 'Could not change the status');
      // Someone else moved it (409 DEFECT_CHANGED / 422 INVALID_TRANSITION): show the current state.
      if (err instanceof ApiError && (err.status === 409 || err.status === 422)) {
        setTarget(null);
        void qc.invalidateQueries({ queryKey: qk.defect(defect.projectId, defect.id) });
      }
    }
  };

  const ordered = orderTransitions(from, defect.allowedTransitions);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Status</span>
        <DefectStatusBadge status={from} />
      </div>
      {from === 'rejected' ? (
        <p className="text-xs text-muted-foreground">
          Rejected — not a defect or will not be fixed.
        </p>
      ) : (
        <WorkflowPath status={from} />
      )}
      {canEdit && ordered.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {ordered.map((to, i) => {
            const forward = isForward(from, to);
            return (
              <Button
                key={to}
                size="sm"
                variant={i === 0 && forward ? 'default' : forward ? 'secondary' : 'outline'}
                className={cn(
                  forward && i > 0 && 'bg-accent text-accent-foreground hover:bg-accent/80',
                  to === 'rejected' && 'text-destructive hover:text-destructive',
                )}
                onClick={() => {
                  setComment('');
                  setTarget(to);
                }}
              >
                {transitionLabel(from, to)}
              </Button>
            );
          })}
        </div>
      )}

      <Dialog open={target !== null} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>
              {target
                ? `${transitionLabel(from, target)} — ${defect.key} → ${DEFECT_STATUS_LABELS[target]}`
                : 'Change status'}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor={`${id}-comment`}>Comment (optional)</Label>
            <Textarea
              id={`${id}-comment`}
              rows={3}
              maxLength={5000}
              autoFocus
              aria-describedby={`${id}-hint`}
              value={comment}
              onChange={(e) => setComment(e.currentTarget.value)}
            />
            <p id={`${id}-hint`} className="text-xs text-muted-foreground">
              Added to the defect&apos;s comments, e.g. the fix version or why it is rejected.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)}>
              Cancel
            </Button>
            <Button
              variant={target === 'rejected' ? 'destructive' : 'default'}
              loading={transition.isPending}
              onClick={() => void confirm()}
            >
              {target ? transitionLabel(from, target) : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

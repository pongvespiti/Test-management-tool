'use client';

import { totalOf, type Judgement, type PlanDTO } from '@tmt/shared';
import { Info } from 'lucide-react';
import { useId, useState } from 'react';
import { JudgementBadge } from '@/components/common/badges';
import { MultilineText } from '@/components/common/multiline-text';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SectionCard } from '@/features/reports/report-ui';
import { ApiError } from '@/lib/api/client';
import { useUpdatePlan } from '@/lib/api/plans';
import { pluralize } from '@/lib/format';
import { notifyError, notifySuccess } from '@/lib/notify';
import { JudgementToggle } from './judgement-toggle';
import { resultBreakdown } from './plan-utils';

interface Draft {
  judgement: Judgement | null;
  note: string;
}

interface Props {
  plan: PlanDTO;
  projectId: number;
  /** Tester or lead and the plan is not completed. */
  editable: boolean;
}

/** Overall judgement of the test report + explanation, with the judgement suggested by the results. */
export function PlanJudgementCard({ plan, projectId, editable }: Props) {
  const noteId = useId();
  const update = useUpdatePlan(projectId);
  // null = showing the saved values; a draft exists only while the user changes something.
  const [draft, setDraft] = useState<Draft | null>(null);
  const saved: Draft = { judgement: plan.overallJudgement, note: plan.judgementNote ?? '' };
  const current = draft ?? saved;
  const dirty =
    draft !== null && (draft.judgement !== saved.judgement || draft.note !== saved.note);
  const suggested = plan.suggestedJudgement;
  const total = totalOf(plan.counts);

  const change = (patch: Partial<Draft>) => setDraft({ ...current, ...patch });

  const save = async () => {
    try {
      await update.mutateAsync({
        planId: plan.id,
        overallJudgement: current.judgement,
        judgementNote: current.note,
      });
      setDraft(null);
      notifySuccess('Overall judgement saved.');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'PLAN_LOCKED') setDraft(null);
      notifyError(err, 'Could not save the judgement');
    }
  };

  const suggestionText =
    total === 0
      ? 'No suggestion yet — add a run to the plan first.'
      : suggested
        ? null
        : `No suggestion yet — ${resultBreakdown(plan.counts)}.`;

  return (
    <SectionCard title="Overall judgement" className="h-full">
      <div className="flex flex-col gap-4">
        {editable ? (
          <JudgementToggle
            label="Overall judgement"
            value={current.judgement}
            onChange={(judgement) => change({ judgement })}
          />
        ) : (
          <div>
            <JudgementBadge judgement={plan.overallJudgement} size="md" />
          </div>
        )}

        <div className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2.5">
          <Info aria-hidden className="mt-0.5 size-[18px] shrink-0 text-primary" />
          <div className="flex min-w-0 flex-col gap-1.5">
            {suggestionText ? (
              <p className="text-sm text-[#495057]">{suggestionText}</p>
            ) : (
              <div className="text-sm text-[#495057]">
                Suggested from results: <JudgementBadge judgement={suggested} /> —{' '}
                {resultBreakdown(plan.counts)} across {pluralize(plan.runs.length, 'run')}.
              </div>
            )}
            {editable && suggested && current.judgement !== suggested && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="w-fit"
                onClick={() => change({ judgement: suggested })}
              >
                Use suggestion
              </Button>
            )}
          </div>
        </div>

        {editable ? (
          <div className="grid gap-2">
            <Label htmlFor={noteId}>Judgement explanation</Label>
            <Textarea
              id={noteId}
              rows={3}
              placeholder="Why this judgement — conditions, agreed workarounds, open issues"
              value={current.note}
              onChange={(e) => change({ note: e.currentTarget.value })}
            />
          </div>
        ) : (
          <div>
            <p className="mb-1 text-sm font-semibold text-muted-foreground">
              Judgement explanation
            </p>
            <MultilineText value={plan.judgementNote} empty="No explanation" />
          </div>
        )}

        {editable && dirty && (
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setDraft(null)}>
              Discard
            </Button>
            <Button type="button" onClick={() => void save()} loading={update.isPending}>
              Save judgement
            </Button>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

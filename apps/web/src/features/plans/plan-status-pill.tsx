import type { PlanStatus } from '@tmt/shared';
import { Lock } from 'lucide-react';
import { StatusPill } from '@/components/common/status-pill';
import { labels, PLAN_STATUS_TONES } from '@/lib/status';

/** Plan status pill; completed plans carry a lock (their results are read-only). */
export function PlanStatusPill({ status }: { status: PlanStatus }) {
  const completed = status === 'completed';
  return (
    <StatusPill
      tone={PLAN_STATUS_TONES[status]}
      leftSection={
        completed ? <Lock aria-hidden className="size-3" strokeWidth={2.2} /> : undefined
      }
      title={completed ? 'Completed — results are locked' : undefined}
    >
      {labels.planStatus[status]}
    </StatusPill>
  );
}

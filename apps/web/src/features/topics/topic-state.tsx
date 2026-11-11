import type { TopicState } from '@tmt/shared';
import { StatusPill } from '@/components/common/status-pill';
import { BLUE, GRAY, GREEN, RED } from '@/lib/status';

const LABELS: Record<TopicState, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  done: 'Done',
};
const TONES = { not_started: GRAY, in_progress: BLUE, done: GREEN } as const;

/** State of a topic, suite or run, with "Overdue" next to it when the due date has passed. */
export function TopicStatePill({
  state,
  overdue = false,
}: {
  state: TopicState;
  overdue?: boolean;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <StatusPill tone={TONES[state]}>{LABELS[state]}</StatusPill>
      {overdue && <StatusPill tone={RED}>Overdue</StatusPill>}
    </span>
  );
}

export const TOPIC_STATE_LABELS = LABELS;

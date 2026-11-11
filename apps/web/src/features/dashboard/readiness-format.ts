import type { ReadinessDTO, ReadinessState } from '@tmt/shared';
import { formatDate, pluralize } from '@/lib/format';
import { GRAY, GREEN, ORANGE, RED, type Tone } from '@/lib/status';

export const READINESS_LABELS: Record<ReadinessState, string> = {
  no_cases: 'No cases',
  done: 'All tested',
  no_deadline: 'No end date',
  on_track: 'On track',
  at_risk: 'At risk',
  overdue: 'Overdue',
};

export const READINESS_TONES: Record<ReadinessState, Tone> = {
  no_cases: GRAY,
  done: GREEN,
  no_deadline: GRAY,
  on_track: GREEN,
  at_risk: ORANGE,
  overdue: RED,
};

/** `3 days before` / `on` / `2 days after` the end date for a projected finish. */
function against(projected: string, end: string): string {
  const late = Math.round(
    (Date.parse(`${projected}T00:00:00Z`) - Date.parse(`${end}T00:00:00Z`)) / 86_400_000,
  );
  if (late === 0) return 'on the end date';
  return late < 0
    ? `${pluralize(-late, 'day')} before the end date`
    : `${pluralize(late, 'day')} after the end date`;
}

/** One sentence that says what the state means for this release. */
export function readinessMessage(r: ReadinessDTO): string {
  switch (r.state) {
    case 'no_cases':
      return 'There are no test cases in the open test plans yet.';
    case 'done':
      return 'Every case of the open test plans has a result.';
    case 'no_deadline':
      return r.projectedDate
        ? `At the pace of the last 7 days the testing finishes on ${formatDate(r.projectedDate)}. Set an end date on the release to see whether that is in time.`
        : 'Set an end date on the release to see whether the testing will finish in time.';
    case 'on_track':
      return `At the pace of the last 7 days the testing finishes on ${formatDate(r.projectedDate)}, ${against(r.projectedDate!, r.endDate!)} (${formatDate(r.endDate)}).`;
    case 'at_risk':
      return r.projectedDate
        ? `At the pace of the last 7 days the testing finishes on ${formatDate(r.projectedDate)}, ${against(r.projectedDate, r.endDate!)} (${formatDate(r.endDate)}).`
        : `Nothing was tested in the last 7 days, so no finish date can be projected. The end date is ${formatDate(r.endDate)}.`;
    case 'overdue':
      return `The end date (${formatDate(r.endDate)}) passed ${pluralize(-r.daysLeft!, 'day')} ago and ${pluralize(r.remaining, 'case')} still ${r.remaining === 1 ? 'has' : 'have'} no result.`;
  }
}

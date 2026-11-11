/**
 * Release readiness: can the cases that are still untested be finished by the release end date at
 * the pace of the last 7 days? Pure; the service supplies the counts.
 */
import type { ReadinessDTO } from '@tmt/shared';
import { addDays } from '../reports/report-dates.js';

/** Days the pace is averaged over. */
export const PACE_DAYS = 7;
/** A projection further away than this is treated as "no pace" (the number would mean nothing). */
const MAX_PROJECTED_DAYS = 3650;

export interface ReadinessInput {
  total: number;
  remaining: number;
  remainingMinutes: number;
  executedLast7Days: number;
  /** `YYYY-MM-DD` or null. */
  endDate: string | null;
  /** Today in the report time zone, `YYYY-MM-DD`. */
  today: string;
}

/** Whole calendar days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function readinessOf(i: ReadinessInput): ReadinessDTO {
  const perDay = Math.round((i.executedLast7Days / PACE_DAYS) * 10) / 10;
  const daysLeft = i.endDate ? daysBetween(i.today, i.endDate) : null;
  const daysNeeded =
    i.executedLast7Days > 0 ? Math.ceil((i.remaining * PACE_DAYS) / i.executedLast7Days) : null;
  const projectedDate =
    i.remaining > 0 && daysNeeded !== null && daysNeeded <= MAX_PROJECTED_DAYS
      ? addDays(i.today, daysNeeded)
      : null;

  let state: ReadinessDTO['state'];
  if (i.total === 0) state = 'no_cases';
  else if (i.remaining === 0) state = 'done';
  else if (i.endDate === null) state = 'no_deadline';
  else if (daysLeft! < 0) state = 'overdue';
  else state = projectedDate !== null && projectedDate <= i.endDate ? 'on_track' : 'at_risk';

  return {
    state,
    total: i.total,
    remaining: i.remaining,
    remainingMinutes: i.remainingMinutes,
    executedLast7Days: i.executedLast7Days,
    perDay,
    endDate: i.endDate,
    daysLeft,
    projectedDate,
  };
}

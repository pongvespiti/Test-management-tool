import { RESULT_STATUSES, type Judgement, type ResultStatus } from '../enums';
import type { StatusCounts } from '../dto';

export function emptyCounts(): StatusCounts {
  return { untested: 0, ok: 0, ng: 0, ok_cond: 0, blocked: 0, nt: 0, na: 0 };
}

/** Builds counts from `{ status, count }` rows (e.g. a SQL GROUP BY). Unknown statuses are ignored. */
export function countsFromRows(
  rows: Iterable<{ status: string; count: number | string }>,
): StatusCounts {
  const c = emptyCounts();
  for (const r of rows) {
    if ((RESULT_STATUSES as readonly string[]).includes(r.status)) {
      c[r.status as ResultStatus] += Number(r.count);
    }
  }
  return c;
}

export function addCounts(a: StatusCounts, b: StatusCounts): StatusCounts {
  const c = emptyCounts();
  for (const s of RESULT_STATUSES) c[s] = a[s] + b[s];
  return c;
}

export function totalOf(c: StatusCounts): number {
  return RESULT_STATUSES.reduce((sum, s) => sum + c[s], 0);
}

export function executedOf(c: StatusCounts): number {
  return totalOf(c) - c.untested;
}

/** Executed ÷ total, 0..1 (0 when empty). */
export function progressOf(c: StatusCounts): number {
  const t = totalOf(c);
  return t === 0 ? 0 : executedOf(c) / t;
}

/** (OK + OK w/ cond.) ÷ (OK + OK w/ cond. + NG + Blocked); null when nothing counts. */
export function passRateOf(c: StatusCounts): number | null {
  const passed = c.ok + c.ok_cond;
  const denom = passed + c.ng + c.blocked;
  return denom === 0 ? null : passed / denom;
}

/**
 * Suggested overall judgement (spec §4): NOT PASS if any NG; otherwise PASS WITH CONDITION if any
 * OK w/ cond.; otherwise PASS once nothing is untested or blocked; otherwise no suggestion.
 */
export function suggestJudgement(c: StatusCounts): Judgement | null {
  if (totalOf(c) === 0) return null;
  if (c.ng > 0) return 'not_pass';
  if (c.untested > 0 || c.blocked > 0) return null;
  if (c.ok_cond > 0) return 'pass_with_condition';
  if (c.ok === 0) return null; // only N/A / N/T — nothing actually verified
  return 'pass';
}

export function formatPercent(v: number | null, digits = 0): string {
  if (v === null || Number.isNaN(v)) return '—';
  return `${(v * 100).toFixed(digits)}%`;
}

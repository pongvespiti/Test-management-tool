/**
 * Pure computations of "My work": the period of a day / week and the summary of the results a
 * user recorded in it. Days are `YYYY-MM-DD` in the report time zone.
 */
import {
  CASE_PRIORITIES,
  addCounts,
  emptyCounts,
  type MyWorkDayDTO,
  type MyWorkRange,
  type ResultStatus,
  type StatusCounts,
} from '@tmt/shared';
import { addDays } from '../reports/report-dates.js';

/** Run cases listed under "waiting for me". */
export const MY_WORK_ITEM_LIMIT = 100;

const ITEM_STATUS_ORDER = { ng: 0, blocked: 1, untested: 2 } as const;
const PRIORITY_ORDER = new Map<string, number>(CASE_PRIORITIES.map((p, i) => [p, i]));

/** First and last day (inclusive) of the day / Monday-to-Sunday week that contains `date`. */
export function periodOf(range: MyWorkRange, date: string): { from: string; to: string } {
  if (range === 'day') return { from: date, to: date };
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  const from = addDays(date, -((weekday + 6) % 7));
  return { from, to: addDays(from, 6) };
}

/** Every calendar day from `from` to `to`, oldest first. */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) out.push(day);
  return out;
}

/** Order of the waiting list: NG, blocked, untested; then by case priority; then oldest first. */
export function compareWaiting(
  a: { status: keyof typeof ITEM_STATUS_ORDER; priority: string; runCaseId: number },
  b: { status: keyof typeof ITEM_STATUS_ORDER; priority: string; runCaseId: number },
): number {
  return (
    ITEM_STATUS_ORDER[a.status] - ITEM_STATUS_ORDER[b.status] ||
    (PRIORITY_ORDER.get(a.priority) ?? 99) - (PRIORITY_ORDER.get(b.priority) ?? 99) ||
    a.runCaseId - b.runCaseId
  );
}

/** One result I recorded (never `untested`), with the release/build of its run. */
export interface MyResultRow {
  runCaseId: number;
  status: ResultStatus;
  elapsedSec: number | null;
  day: string;
  releaseId: number | null;
  buildId: number | null;
}

export interface MyGroupAggregate {
  releaseId: number | null;
  buildId: number | null;
  executed: number;
  counts: StatusCounts;
  elapsedSec: number;
}

export interface MyResultsSummary {
  executed: number;
  counts: StatusCounts;
  elapsedSec: number;
  days: MyWorkDayDTO[];
  groups: MyGroupAggregate[];
}

function oneCount(status: ResultStatus): StatusCounts {
  const counts = emptyCounts();
  counts[status] = 1;
  return counts;
}

/**
 * Summarises results in recording order. A run case counts once in the period (its latest result
 * decides the status) and once per day inside a day; time spent adds up over every result.
 */
export function summarizeMyResults(rows: MyResultRow[], days: string[]): MyResultsSummary {
  const latest = new Map<number, MyResultRow>();
  const perDay = new Map<string, { cases: Set<number>; elapsedSec: number }>();
  for (const day of days) perDay.set(day, { cases: new Set(), elapsedSec: 0 });
  const groups = new Map<string, MyGroupAggregate>();
  const groupOf = (row: MyResultRow): MyGroupAggregate => {
    const key = `${row.releaseId ?? ''}/${row.buildId ?? ''}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        releaseId: row.releaseId,
        buildId: row.buildId,
        executed: 0,
        counts: emptyCounts(),
        elapsedSec: 0,
      };
      groups.set(key, g);
    }
    return g;
  };

  let elapsedSec = 0;
  for (const row of rows) {
    latest.set(row.runCaseId, row);
    const spent = row.elapsedSec ?? 0;
    elapsedSec += spent;
    groupOf(row).elapsedSec += spent;
    const day = perDay.get(row.day);
    if (day) {
      day.cases.add(row.runCaseId);
      day.elapsedSec += spent;
    }
  }

  let counts = emptyCounts();
  for (const row of latest.values()) {
    counts = addCounts(counts, oneCount(row.status));
    const g = groupOf(row);
    g.executed += 1;
    g.counts = addCounts(g.counts, oneCount(row.status));
  }

  return {
    executed: latest.size,
    counts,
    elapsedSec,
    days: days.map((date) => {
      const d = perDay.get(date)!;
      return { date, executed: d.cases.size, elapsedSec: d.elapsedSec };
    }),
    groups: [...groups.values()].sort(
      (a, b) =>
        b.executed - a.executed ||
        (b.releaseId ?? 0) - (a.releaseId ?? 0) ||
        (b.buildId ?? 0) - (a.buildId ?? 0),
    ),
  };
}

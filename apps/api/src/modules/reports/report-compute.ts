/**
 * Pure report computations (ADR-009): replay of the results history for the trend/burndown, the
 * defect summary and trend, workload, release comparison and coverage rows. Inputs are plain rows;
 * days are `YYYY-MM-DD` in the report time zone.
 */
import {
  CASE_PRIORITIES,
  DEFECT_SEVERITIES,
  DEFECT_STATUSES,
  OPEN_DEFECT_STATUSES,
  emptyCounts,
  passRateOf,
  progressOf,
  type CasePriority,
  type CoverageRowDTO,
  type DefectReportDTO,
  type DefectSeverity,
  type DefectStatus,
  type Judgement,
  type ReleaseComparisonRowDTO,
  type ReleaseStatus,
  type ReportTrendDTO,
  type ResultStatus,
  type StatusCounts,
  type TrendPointDTO,
  type UserRef,
  type WorkloadRowDTO,
} from '@tmt/shared';
import { dateOnly, refOf } from '../../common/users/user-refs.js';
import { localDate } from './report-dates.js';

export interface TrendRunCase {
  id: number;
  /** First day the run case existed (its run's creation day, or its first result if earlier). */
  startDay: string;
}

export interface TrendResult {
  runCaseId: number;
  status: ResultStatus;
  /** Day the result was recorded. */
  day: string;
}

/**
 * One point per day: results recorded that day (`untested` resets are not counted as executed),
 * untested run cases at the end of the day (burndown) and the pass rate of the latest result per
 * run case at the end of the day. `results` must be in recording order.
 */
export function buildTrendPoints(
  runCases: readonly TrendRunCase[],
  results: readonly TrendResult[],
  days: readonly string[],
): TrendPointDTO[] {
  if (days.length === 0) return [];
  const byStart = runCases.toSorted((a, b) => (a.startDay < b.startDay ? -1 : 1));
  const state = new Map<number, ResultStatus>();
  const exists = new Set<number>();
  const live = emptyCounts();
  let rcIdx = 0;
  let resIdx = 0;

  const admitUntil = (day: string, inclusive: boolean) => {
    while (rcIdx < byStart.length) {
      const rc = byStart[rcIdx]!;
      if (inclusive ? rc.startDay > day : rc.startDay >= day) break;
      exists.add(rc.id);
      live[state.get(rc.id) ?? 'untested'] += 1;
      rcIdx += 1;
    }
  };
  const apply = (r: TrendResult) => {
    const previous = state.get(r.runCaseId) ?? 'untested';
    state.set(r.runCaseId, r.status);
    if (exists.has(r.runCaseId)) {
      live[previous] -= 1;
      live[r.status] += 1;
    }
  };

  // State before the window: run cases that already existed and their results so far.
  const first = days[0]!;
  admitUntil(first, false);
  while (resIdx < results.length && results[resIdx]!.day < first) apply(results[resIdx++]!);

  const points: TrendPointDTO[] = [];
  for (const day of days) {
    admitUntil(day, true);
    const byStatus = emptyCounts();
    let executed = 0;
    while (resIdx < results.length && results[resIdx]!.day <= day) {
      const r = results[resIdx++]!;
      apply(r);
      if (r.status !== 'untested') {
        byStatus[r.status] += 1;
        executed += 1;
      }
    }
    points.push({
      date: day,
      executed,
      byStatus,
      remaining: live.untested,
      passRate: passRateOf(live),
    });
  }
  return points;
}

/** A run case in scope with the creation time of its run. */
export interface RunCaseOrigin {
  id: number;
  runCreatedAt: Date;
}

/** One history row of a run case. */
export interface ResultEvent {
  runCaseId: number;
  status: ResultStatus;
  executedAt: Date;
}

/** Trend report of the run cases in scope and their history (recording order) over `window`. */
export function trendReportOf(
  runCases: readonly RunCaseOrigin[],
  results: readonly ResultEvent[],
  window: readonly string[],
  tz: string,
): ReportTrendDTO {
  const replay: TrendResult[] = [];
  const firstResultDay = new Map<number, string>();
  for (const r of results) {
    const day = localDate(r.executedAt, tz);
    replay.push({ runCaseId: r.runCaseId, status: r.status, day });
    if (!firstResultDay.has(r.runCaseId)) firstResultDay.set(r.runCaseId, day);
  }
  const starts = runCases.map((rc) => {
    const created = localDate(rc.runCreatedAt, tz);
    const firstResult = firstResultDay.get(rc.id);
    return { id: rc.id, startDay: firstResult && firstResult < created ? firstResult : created };
  });
  return {
    from: window[0]!,
    to: window[window.length - 1]!,
    timezone: tz,
    total: runCases.length,
    points: buildTrendPoints(starts, replay, window),
  };
}

export interface DefectTrendRow {
  createdDay: string;
  /** Day the defect was resolved (null when not resolved now). */
  resolvedDay: string | null;
  /** Day the defect was closed or rejected (null when not closed now). */
  closedDay: string | null;
}

/**
 * Defects opened and closed per day, and open at the end of each day. A defect counts as open from
 * its creation until it is resolved or closed (defects keep no status history; a reopen clears
 * those dates, so a reopened defect counts as open since its creation).
 */
export function buildDefectTrend(
  rows: readonly DefectTrendRow[],
  days: readonly string[],
): DefectReportDTO['trend'] {
  return days.map((day) => {
    let opened = 0;
    let closed = 0;
    let open = 0;
    for (const r of rows) {
      if (r.createdDay === day) opened += 1;
      if (r.closedDay === day) closed += 1;
      const ended =
        (r.closedDay !== null && r.closedDay <= day) ||
        (r.resolvedDay !== null && r.resolvedDay <= day);
      if (r.createdDay <= day && !ended) open += 1;
    }
    return { date: day, opened, closed, open };
  });
}

export function isOpenDefect(status: string): boolean {
  return (OPEN_DEFECT_STATUSES as readonly string[]).includes(status);
}

/** Adds one status to counts (unknown statuses are ignored). */
export function bump(c: StatusCounts, status: string, n = 1): void {
  if (status in c) c[status as ResultStatus] += n;
}

/** Users by display name, unassigned (null) last, ties by id. */
export function byName(a: UserRef | null, b: UserRef | null): number {
  if (a === null) return b === null ? 0 : 1;
  if (b === null) return -1;
  return a.displayName.localeCompare(b.displayName) || a.id - b.id;
}

/** Defect fields the defect report reads. */
export interface DefectFacts {
  status: DefectStatus;
  severity: DefectSeverity;
  assigneeId: number | null;
  createdAt: Date;
  resolvedAt: Date | null;
  closedAt: Date | null;
}

export interface DefectSummary extends Pick<
  DefectReportDTO,
  'byStatus' | 'bySeverity' | 'openBySeverity' | 'trend'
> {
  /** Open defects per assignee id (null = unassigned). */
  openByAssignee: Map<number | null, number>;
}

const zeroBy = <K extends string>(keys: readonly K[]) =>
  Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;

/** Counts by status and severity, open counts and the daily open/closed trend over `window`. */
export function summarizeDefects(
  rows: readonly DefectFacts[],
  window: readonly string[],
  tz: string,
): DefectSummary {
  const byStatus = zeroBy(DEFECT_STATUSES);
  const bySeverity = zeroBy(DEFECT_SEVERITIES);
  const openBySeverity = zeroBy(DEFECT_SEVERITIES);
  const openByAssignee = new Map<number | null, number>();
  for (const d of rows) {
    if (d.status in byStatus) byStatus[d.status] += 1;
    if (d.severity in bySeverity) bySeverity[d.severity] += 1;
    if (isOpenDefect(d.status)) {
      if (d.severity in openBySeverity) openBySeverity[d.severity] += 1;
      openByAssignee.set(d.assigneeId, (openByAssignee.get(d.assigneeId) ?? 0) + 1);
    }
  }
  const trend = buildDefectTrend(
    rows.map((d) => ({
      createdDay: localDate(d.createdAt, tz),
      resolvedDay: d.resolvedAt ? localDate(d.resolvedAt, tz) : null,
      closedDay: d.closedAt ? localDate(d.closedAt, tz) : null,
    })),
    window,
  );
  return { byStatus, bySeverity, openBySeverity, openByAssignee, trend };
}

/** Run case counts of one effective assignee (SQL aggregate). */
export interface WorkloadAggregate {
  userId: number | null;
  runCases: number;
  untested: number;
  ng: number;
  remainingMinutes: number;
  executedRecently: number;
}

/** Workload rows sorted by user name, unassigned last. */
export function workloadRows(
  rows: readonly WorkloadAggregate[],
  users: Map<number, UserRef>,
): WorkloadRowDTO[] {
  return rows
    .map((r): WorkloadRowDTO => ({
      user: refOf(users, r.userId),
      runCases: r.runCases,
      untested: r.untested,
      executed: r.runCases - r.untested,
      ng: r.ng,
      remainingEstimateMinutes: r.remainingMinutes,
      executedLast7Days: r.executedRecently,
    }))
    .toSorted((a, b) => byName(a.user, b.user));
}

export interface ReleaseInfo {
  id: number;
  name: string;
  status: ReleaseStatus;
  startDate: Date | null;
  endDate: Date | null;
}

/** Counts per release (and status / judgement) of the release comparison. */
export interface ReleaseCounts {
  plans: { releaseId: number; judgement: Judgement | null; n: number }[];
  runs: { releaseId: number; n: number }[];
  runCases: { releaseId: number; status: string; n: number }[];
  defects: { releaseId: number; status: string; n: number }[];
}

/** One comparison row per release, in the given order. */
export function releaseComparisonRows(
  releases: readonly ReleaseInfo[],
  counts: ReleaseCounts,
): ReleaseComparisonRowDTO[] {
  return releases.map((r): ReleaseComparisonRowDTO => {
    const judgements: Record<Judgement | 'none', number> = {
      pass: 0,
      pass_with_condition: 0,
      not_pass: 0,
      none: 0,
    };
    let planCount = 0;
    for (const p of counts.plans) {
      if (p.releaseId !== r.id) continue;
      planCount += p.n;
      const key = p.judgement ?? 'none';
      if (key in judgements) judgements[key] += p.n;
    }
    const statusCounts = emptyCounts();
    for (const c of counts.runCases) if (c.releaseId === r.id) bump(statusCounts, c.status, c.n);
    let defectsTotal = 0;
    let defectsOpen = 0;
    for (const d of counts.defects) {
      if (d.releaseId !== r.id) continue;
      defectsTotal += d.n;
      if (isOpenDefect(d.status)) defectsOpen += d.n;
    }
    return {
      release: {
        id: r.id,
        name: r.name,
        status: r.status,
        startDate: dateOnly(r.startDate),
        endDate: dateOnly(r.endDate),
      },
      planCount,
      runCount: counts.runs.find((x) => x.releaseId === r.id)?.n ?? 0,
      counts: statusCounts,
      passRate: passRateOf(statusCounts),
      progress: progressOf(statusCounts),
      defectsTotal,
      defectsOpen,
      judgements,
    };
  });
}

const PASSED: readonly string[] = ['ok', 'ok_cond'];
const FAILED: readonly string[] = ['ng', 'blocked'];

/** A library case counted by the coverage report. */
export interface CoverageCase {
  id: number;
  suiteId: number;
  priority: CasePriority;
}

/**
 * Coverage per suite (in the given order) from the status of the latest run case of every
 * library case in scope (`latestStatus`; missing = never run).
 */
export function coverageRows(
  suites: readonly { id: number; name: string; prefix: string }[],
  cases: readonly CoverageCase[],
  latestStatus: ReadonlyMap<number, string>,
): CoverageRowDTO[] {
  const rows = new Map<number, CoverageRowDTO>(
    suites.map((s) => [
      s.id,
      {
        suite: { id: s.id, name: s.name, prefix: s.prefix },
        cases: 0,
        byPriority: zeroBy(CASE_PRIORITIES),
        inScope: 0,
        executed: 0,
        passed: 0,
        failed: 0,
        neverRun: 0,
      },
    ]),
  );
  for (const c of cases) {
    const row = rows.get(c.suiteId);
    if (!row) continue;
    row.cases += 1;
    if (c.priority in row.byPriority) row.byPriority[c.priority] += 1;
    const status = latestStatus.get(c.id);
    if (status === undefined) {
      row.neverRun += 1;
      continue;
    }
    row.inScope += 1;
    if (status !== 'untested') row.executed += 1;
    if (PASSED.includes(status)) row.passed += 1;
    if (FAILED.includes(status)) row.failed += 1;
  }
  return [...rows.values()];
}

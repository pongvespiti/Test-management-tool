import { describe, expect, it } from '@jest/globals';
import { emptyCounts } from '@tmt/shared';
import {
  buildDefectTrend,
  buildTrendPoints,
  bump,
  byName,
  coverageRows,
  isOpenDefect,
  releaseComparisonRows,
  summarizeDefects,
  trendReportOf,
  workloadRows,
} from './report-compute.js';

const days = ['2026-10-20', '2026-10-21', '2026-10-22'];
const TZ = 'Asia/Bangkok';
const at = (iso: string) => new Date(iso);
const user = (id: number, displayName: string) => ({ id, username: displayName, displayName });

describe('trend replay (port of the v1 cases)', () => {
  it('replays results into executed counts, burndown and end-of-day pass rate', () => {
    const points = buildTrendPoints(
      [
        { id: 1, startDay: '2026-10-01' },
        { id: 2, startDay: '2026-10-01' },
        { id: 3, startDay: '2026-10-21' }, // added mid-window
      ],
      [
        { runCaseId: 1, status: 'ng', day: '2026-10-10' }, // before the window
        { runCaseId: 1, status: 'ok', day: '2026-10-20' },
        { runCaseId: 2, status: 'blocked', day: '2026-10-21' },
        { runCaseId: 2, status: 'untested', day: '2026-10-21' }, // reset: not executed
        { runCaseId: 3, status: 'ng', day: '2026-10-22' },
        { runCaseId: 2, status: 'ok_cond', day: '2026-10-22' },
        { runCaseId: 2, status: 'ok', day: '2026-10-25' }, // after the window: ignored
      ],
      days,
    );
    expect(points.map((p) => [p.date, p.executed, p.remaining, p.passRate])).toEqual([
      ['2026-10-20', 1, 1, 1],
      ['2026-10-21', 1, 2, 1],
      ['2026-10-22', 2, 0, 2 / 3],
    ]);
    expect(points[0]!.byStatus.ok).toBe(1);
    expect(points[1]!.byStatus).toMatchObject({ blocked: 1, untested: 0 });
    expect(points[2]!.byStatus).toMatchObject({ ng: 1, ok_cond: 1 });
  });

  it('reports no pass rate while nothing counts and handles empty scopes', () => {
    const points = buildTrendPoints([{ id: 1, startDay: '2026-10-21' }], [], days);
    expect(points.map((p) => [p.remaining, p.passRate])).toEqual([
      [0, null],
      [1, null],
      [1, null],
    ]);
    expect(buildTrendPoints([], [], days).every((p) => p.executed === 0)).toBe(true);
    expect(buildTrendPoints([{ id: 1, startDay: '2026-10-21' }], [], [])).toEqual([]);
  });

  it('counts defects opened, closed and open per day', () => {
    const trend = buildDefectTrend(
      [
        { createdDay: '2026-10-19', resolvedDay: null, closedDay: '2026-10-21' },
        { createdDay: '2026-10-20', resolvedDay: '2026-10-22', closedDay: null },
        { createdDay: '2026-10-22', resolvedDay: null, closedDay: null },
      ],
      days,
    );
    expect(trend).toEqual([
      { date: '2026-10-20', opened: 1, closed: 0, open: 2 },
      { date: '2026-10-21', opened: 0, closed: 1, open: 1 },
      { date: '2026-10-22', opened: 1, closed: 0, open: 1 },
    ]);
  });
});

describe('trend report', () => {
  it('starts run cases at their run creation or an earlier first result, in report days', () => {
    const report = trendReportOf(
      [
        { id: 1, runCreatedAt: new Date('2026-10-20T18:00:00Z') }, // 01:00 on the 21st
        { id: 2, runCreatedAt: new Date('2026-10-22T03:00:00Z') },
      ],
      [
        // Imported history older than the run itself: the run case existed since then.
        { runCaseId: 2, status: 'ok', executedAt: new Date('2026-10-19T20:00:00Z') }, // 20th
        { runCaseId: 1, status: 'ng', executedAt: new Date('2026-10-21T16:59:00Z') }, // 21st
      ],
      days,
      TZ,
    );
    expect(report).toMatchObject({ from: '2026-10-20', to: '2026-10-22', timezone: TZ, total: 2 });
    expect(report.points.map((p) => [p.executed, p.remaining, p.passRate])).toEqual([
      [1, 0, 1],
      [1, 0, 0.5],
      [0, 0, 0.5],
    ]);
  });
});

describe('defect summary', () => {
  it('counts by status and severity, open ones per severity and assignee, and the trend', () => {
    const s = summarizeDefects(
      [
        {
          status: 'new',
          severity: 'critical',
          assigneeId: 2,
          createdAt: at('2026-10-19T18:00:00Z'), // 20th in Bangkok
          resolvedAt: null,
          closedAt: null,
        },
        {
          status: 'closed',
          severity: 'minor',
          assigneeId: 2,
          createdAt: at('2026-10-20T03:00:00Z'),
          resolvedAt: at('2026-10-21T03:00:00Z'),
          closedAt: at('2026-10-22T03:00:00Z'),
        },
        {
          status: 'reopened',
          severity: 'critical',
          assigneeId: null,
          createdAt: at('2026-10-21T03:00:00Z'),
          resolvedAt: null,
          closedAt: null,
        },
      ],
      days,
      TZ,
    );
    expect(s.byStatus).toEqual({
      new: 1,
      open: 0,
      in_progress: 0,
      resolved: 0,
      closed: 1,
      rejected: 0,
      reopened: 1,
    });
    expect(s.bySeverity).toEqual({ critical: 2, major: 0, minor: 1, trivial: 0 });
    expect(s.openBySeverity).toEqual({ critical: 2, major: 0, minor: 0, trivial: 0 });
    expect([...s.openByAssignee]).toEqual([
      [2, 1],
      [null, 1],
    ]);
    expect(s.trend).toEqual([
      { date: '2026-10-20', opened: 2, closed: 0, open: 2 },
      { date: '2026-10-21', opened: 1, closed: 0, open: 2 },
      { date: '2026-10-22', opened: 0, closed: 1, open: 2 },
    ]);
  });

  it('knows open statuses and ignores unknown result statuses', () => {
    expect(['new', 'open', 'in_progress', 'reopened'].every(isOpenDefect)).toBe(true);
    expect(['resolved', 'closed', 'rejected'].some(isOpenDefect)).toBe(false);
    const c = emptyCounts();
    bump(c, 'ok', 2);
    bump(c, 'bogus');
    expect(c.ok).toBe(2);
    expect(c).not.toHaveProperty('bogus');
  });
});

describe('workload rows', () => {
  it('derives executed counts and sorts by name with unassigned last', () => {
    const rows = workloadRows(
      [
        { userId: null, runCases: 1, untested: 0, ng: 0, remainingMinutes: 0, executedRecently: 1 },
        { userId: 3, runCases: 4, untested: 4, ng: 0, remainingMinutes: 95, executedRecently: 0 },
        { userId: 2, runCases: 5, untested: 1, ng: 1, remainingMinutes: 20, executedRecently: 3 },
      ],
      new Map([
        [2, user(2, 'Tina')],
        [3, user(3, 'Umar')],
      ]),
    );
    expect(rows.map((r) => [r.user?.displayName ?? null, r.executed])).toEqual([
      ['Tina', 4],
      ['Umar', 0],
      [null, 1],
    ]);
    expect(rows[0]).toEqual({
      user: user(2, 'Tina'),
      runCases: 5,
      untested: 1,
      executed: 4,
      ng: 1,
      remainingEstimateMinutes: 20,
      executedLast7Days: 3,
    });
  });

  it('orders users by display name, then id', () => {
    expect(byName(user(2, 'Ann'), user(1, 'Ann'))).toBeGreaterThan(0);
    expect(byName(user(1, 'Ann'), user(2, 'Bob'))).toBeLessThan(0);
    expect(byName(null, null)).toBe(0);
    expect(byName(null, user(1, 'Ann'))).toBe(1);
    expect(byName(user(1, 'Ann'), null)).toBe(-1);
  });
});

describe('release comparison rows', () => {
  it('aggregates plans, runs, run cases and defects per release', () => {
    const [a, c] = releaseComparisonRows(
      [
        {
          id: 1,
          name: 'A',
          status: 'active',
          startDate: new Date('2026-09-01T00:00:00Z'),
          endDate: null,
        },
        { id: 3, name: 'C', status: 'planned', startDate: null, endDate: null },
      ],
      {
        plans: [
          { releaseId: 1, judgement: 'pass_with_condition', n: 1 },
          { releaseId: 1, judgement: null, n: 2 },
          { releaseId: 2, judgement: 'pass', n: 5 },
        ],
        runs: [
          { releaseId: 1, n: 3 },
          { releaseId: 2, n: 9 },
        ],
        runCases: [
          { releaseId: 1, status: 'ok', n: 2 },
          { releaseId: 1, status: 'ng', n: 1 },
          { releaseId: 1, status: 'ok_cond', n: 1 },
          { releaseId: 2, status: 'ok', n: 7 },
        ],
        defects: [
          { releaseId: 1, status: 'resolved', n: 1 },
          { releaseId: 1, status: 'new', n: 2 },
        ],
      },
    );
    expect(a).toMatchObject({
      release: { id: 1, name: 'A', status: 'active', startDate: '2026-09-01', endDate: null },
      planCount: 3,
      runCount: 3,
      passRate: 0.75,
      progress: 1,
      defectsTotal: 3,
      defectsOpen: 2,
      judgements: { pass: 0, pass_with_condition: 1, not_pass: 0, none: 2 },
    });
    expect(a!.counts).toMatchObject({ ok: 2, ng: 1, ok_cond: 1, untested: 0 });
    expect(c).toMatchObject({
      planCount: 0,
      runCount: 0,
      passRate: null,
      progress: 0,
      defectsTotal: 0,
    });
  });
});

describe('coverage rows', () => {
  it('counts cases per suite by priority and the latest status in scope', () => {
    const rows = coverageRows(
      [
        { id: 1, name: 'App', prefix: 'APP' },
        { id: 2, name: 'Empty', prefix: 'EMP' },
      ],
      [
        { id: 10, suiteId: 1, priority: 'critical' },
        { id: 11, suiteId: 1, priority: 'high' },
        { id: 12, suiteId: 1, priority: 'medium' },
        { id: 13, suiteId: 1, priority: 'medium' },
        { id: 14, suiteId: 1, priority: 'low' },
        { id: 99, suiteId: 7, priority: 'low' }, // suite not listed (archived)
      ],
      new Map([
        [10, 'ok'],
        [11, 'ok_cond'],
        [12, 'blocked'],
        [13, 'untested'],
      ]),
    );
    expect(rows).toEqual([
      {
        suite: { id: 1, name: 'App', prefix: 'APP' },
        cases: 5,
        byPriority: { critical: 1, high: 1, medium: 2, low: 1 },
        inScope: 4,
        executed: 3,
        passed: 2,
        failed: 1,
        neverRun: 1,
      },
      expect.objectContaining({ suite: { id: 2, name: 'Empty', prefix: 'EMP' }, cases: 0 }),
    ]);
  });
});

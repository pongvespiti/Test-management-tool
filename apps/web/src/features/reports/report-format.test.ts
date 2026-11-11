import { describe, expect, it } from '@jest/globals';
import { userRef } from '@/features/cases/test-utils';
import {
  burndownRows,
  byOpenDefects,
  chartConfig,
  coverageRows,
  coverageTotals,
  defectFlowRows,
  defectTotals,
  EXECUTED_SERIES,
  executedRows,
  formatDay,
  isIdle,
  meterPercent,
  parseDays,
  parseTab,
  passRateRows,
  personName,
  releasePassRateRows,
  releasePeriod,
  reportLink,
  scopeNote,
  share,
  sortWorkload,
  toPercent,
  trendTotals,
  workloadRows,
  workloadTotals,
} from './report-format';
import {
  makeCoverage,
  makeDefectReport,
  makeReleaseRows,
  makeTrend,
  makeWorkload,
} from './test-fixtures';

describe('report formatting', () => {
  it('formats days, people, shares and percentages', () => {
    expect(formatDay('2026-10-21')).toBe('Oct 21');
    expect(formatDay('week 42')).toBe('week 42');
    expect(personName(userRef(1, 'Alice'))).toBe('Alice');
    expect(personName(null)).toBe('Unassigned');
    expect(personName(undefined, 'Nobody')).toBe('Nobody');
    expect(share(1, 4)).toBe(0.25);
    expect(share(1, 0)).toBeNull();
    expect(toPercent(0.8532)).toBe(85.3);
    expect(toPercent(null)).toBeNull();
    expect(chartConfig(EXECUTED_SERIES.slice(0, 1))).toEqual({
      ok: { label: 'OK', color: '#40C057' },
    });
  });

  it('shapes the trend', () => {
    const trend = makeTrend();
    expect(EXECUTED_SERIES.map((s) => s.key)).toEqual([
      'ok',
      'ok_cond',
      'ng',
      'blocked',
      'nt',
      'na',
    ]);
    expect(executedRows(trend.points)[1]).toEqual({
      date: 'Oct 20',
      ok: 4,
      ok_cond: 0,
      ng: 1,
      blocked: 0,
      nt: 0,
      na: 0,
    });
    expect(burndownRows(trend.points).map((r) => r.remaining)).toEqual([40, 35, 32]);
    expect(passRateRows(trend.points).map((r) => r.passRate)).toEqual([null, 80, 87.5]);
    expect(isIdle(trend.points)).toBe(false);
    expect(isIdle([{ ...trend.points[0]!, remaining: 0 }])).toBe(true);
    expect(trendTotals(trend)).toEqual({
      executed: 8,
      last: trend.points[2],
      period: 'Oct 19 – Oct 21',
    });
    expect(trendTotals({ ...trend, points: [] }).last).toBeUndefined();
  });

  it('shapes the coverage', () => {
    const rows = makeCoverage();
    expect(coverageRows(rows)).toEqual([
      { suite: 'Unit operation test', passed: 9, failed: 2, other: 1, notExecuted: 3, neverRun: 5 },
      { suite: 'Adapter', passed: 0, failed: 0, other: 0, notExecuted: 0, neverRun: 10 },
    ]);
    // Inconsistent numbers never give negative bar segments.
    expect(
      coverageRows([{ ...rows[0]!, executed: 1, passed: 2, failed: 1, inScope: 0 }])[0],
    ).toMatchObject({ other: 0, notExecuted: 0 });
    expect(coverageTotals(rows)).toEqual({ cases: 30, inScope: 15, executed: 12, neverRun: 15 });
  });

  it('orders and sums the workload', () => {
    const rows = makeWorkload();
    expect(sortWorkload(rows).map((r) => personName(r.user))).toEqual([
      'Alice Tester',
      'Bob Lead',
      'Unassigned',
    ]);
    const tie = [
      { ...rows[1]!, user: userRef(3, 'Zoe') },
      { ...rows[1]!, user: userRef(4, 'Adam') },
    ];
    expect(sortWorkload(tie).map((r) => r.user?.displayName)).toEqual(['Adam', 'Zoe']);
    // "Unassigned" goes last from either side of the comparison.
    for (const pair of [
      [rows[0]!, rows[2]!],
      [rows[2]!, rows[0]!],
    ])
      expect(sortWorkload(pair).map((r) => personName(r.user))).toEqual([
        'Alice Tester',
        'Unassigned',
      ]);
    expect(workloadRows(rows)[0]).toEqual({ person: 'Alice Tester', done: 10, ng: 2, untested: 8 });
    expect(workloadRows([{ ...rows[0]!, executed: 1, ng: 3 }])[0]!.done).toBe(0);
    expect(workloadTotals(rows)).toEqual({
      runCases: 35,
      untested: 15,
      executedLast7Days: 14,
      remainingEstimateMinutes: 120,
      unassigned: rows[0],
    });
    expect(workloadTotals(rows.slice(1)).unassigned).toBeUndefined();
    expect(meterPercent(3, 12)).toBe(25);
    expect(meterPercent(0, 0)).toBe(0);
  });

  it('sums the defect report', () => {
    const report = makeDefectReport();
    expect(defectTotals(report)).toEqual({ total: 7, open: 3, opened: 3, closed: 2 });
    expect(defectFlowRows(report.trend)[0]).toEqual({
      date: 'Oct 20',
      opened: 2,
      closed: 0,
      open: 4,
    });
    expect(byOpenDefects(report.byAssignee).map((a) => a.open)).toEqual([2, 1]);
  });

  it('describes releases', () => {
    expect(releasePeriod({ startDate: '2026-10-01', endDate: '2026-10-31' })).toBe(
      'Oct 1, 2026 – Oct 31, 2026',
    );
    expect(releasePeriod({ startDate: '2026-10-01', endDate: null })).toBe('From Oct 1, 2026');
    expect(releasePeriod({ startDate: null, endDate: '2026-10-31' })).toBe('Until Oct 31, 2026');
    expect(releasePeriod({ startDate: null, endDate: null })).toBe('No dates');
    expect(releasePassRateRows(makeReleaseRows())).toEqual([
      { release: 'FW 3.0', passRate: null },
      { release: 'FW 2.4.0', passRate: 88.9 },
    ]);
  });

  it('reads the reports page state from the URL', () => {
    expect(parseTab('coverage')).toBe('coverage');
    expect(parseTab('nope')).toBe('trend');
    expect(parseTab(null)).toBe('trend');
    expect(parseDays('7')).toBe(7);
    expect(parseDays('8')).toBe(30);
    expect(parseDays(null)).toBe(30);
  });

  it('explains which scope a tab uses', () => {
    expect(scopeNote('releases', false)).toMatch(/scope filters do not apply/);
    expect(scopeNote('defects', true)).toMatch(/^Defects are filtered by release only/);
    expect(scopeNote('coverage', true)).toMatch(/^Coverage is filtered by release only/);
    expect(scopeNote('coverage', false)).toBeNull();
    expect(scopeNote('workload', true)).toMatch(/^Run cases of plans that are not completed/);
    expect(scopeNote('trend', true)).toBeNull();
  });

  it('links to a report tab', () => {
    expect(reportLink(3, 'workload', 5)).toBe('/projects/3/reports?tab=workload&release=5');
    expect(reportLink(3, 'trend', null)).toBe('/projects/3/reports?tab=trend');
  });
});

import { describe, expect, it } from '@jest/globals';
import {
  compareWaiting,
  daysBetween,
  periodOf,
  summarizeMyResults,
  type MyResultRow,
} from './my-work.compute.js';

const row = (over: Partial<MyResultRow> = {}): MyResultRow => ({
  runCaseId: 1,
  status: 'ok',
  elapsedSec: 60,
  day: '2026-10-21',
  releaseId: 5,
  buildId: 8,
  ...over,
});

describe('periodOf', () => {
  it('is the day itself for a day', () => {
    expect(periodOf('day', '2026-10-22')).toEqual({ from: '2026-10-22', to: '2026-10-22' });
  });

  it('is Monday to Sunday for a week, from any weekday', () => {
    // 2026-10-22 is a Thursday, 2026-10-25 a Sunday, 2026-10-19 a Monday.
    for (const date of ['2026-10-19', '2026-10-22', '2026-10-25']) {
      expect(periodOf('week', date)).toEqual({ from: '2026-10-19', to: '2026-10-25' });
    }
  });

  it('crosses a month and a year boundary', () => {
    expect(periodOf('week', '2026-12-31')).toEqual({ from: '2026-12-28', to: '2027-01-03' });
  });
});

describe('daysBetween', () => {
  it('lists every day inclusive', () => {
    expect(daysBetween('2026-10-30', '2026-11-02')).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ]);
    expect(daysBetween('2026-10-22', '2026-10-22')).toEqual(['2026-10-22']);
  });
});

describe('compareWaiting', () => {
  it('puts NG first, then blocked, then untested; priority and id break ties', () => {
    const items = [
      { status: 'untested' as const, priority: 'critical', runCaseId: 1 },
      { status: 'ng' as const, priority: 'low', runCaseId: 2 },
      { status: 'blocked' as const, priority: 'high', runCaseId: 3 },
      { status: 'ng' as const, priority: 'high', runCaseId: 5 },
      { status: 'ng' as const, priority: 'high', runCaseId: 4 },
    ];
    expect(items.sort(compareWaiting).map((i) => i.runCaseId)).toEqual([4, 5, 2, 3, 1]);
  });
});

describe('summarizeMyResults', () => {
  const days = ['2026-10-21', '2026-10-22'];

  it('is empty without results', () => {
    const s = summarizeMyResults([], days);
    expect(s.executed).toBe(0);
    expect(s.elapsedSec).toBe(0);
    expect(s.groups).toEqual([]);
    expect(s.days).toEqual([
      { date: '2026-10-21', executed: 0, elapsedSec: 0 },
      { date: '2026-10-22', executed: 0, elapsedSec: 0 },
    ]);
  });

  it('counts a run case once by its latest result, but adds up all time spent', () => {
    const s = summarizeMyResults(
      [
        row({ runCaseId: 1, status: 'ng', elapsedSec: 30 }),
        row({ runCaseId: 1, status: 'ok', elapsedSec: 45, day: '2026-10-22' }),
        row({ runCaseId: 2, status: 'ok', elapsedSec: null }),
      ],
      days,
    );
    expect(s.executed).toBe(2);
    expect(s.counts).toMatchObject({ ok: 2, ng: 0 });
    expect(s.elapsedSec).toBe(75);
    expect(s.days).toEqual([
      { date: '2026-10-21', executed: 2, elapsedSec: 30 },
      { date: '2026-10-22', executed: 1, elapsedSec: 45 },
    ]);
  });

  it('ignores results outside the listed days in the per-day table only', () => {
    const s = summarizeMyResults([row({ day: '2026-10-30' })], days);
    expect(s.executed).toBe(1);
    expect(s.days.every((d) => d.executed === 0)).toBe(true);
  });

  it('groups by release and build, biggest first', () => {
    const s = summarizeMyResults(
      [
        row({ runCaseId: 1, buildId: 8 }),
        row({ runCaseId: 2, buildId: 9, status: 'ng' }),
        row({ runCaseId: 3, buildId: 9 }),
        row({ runCaseId: 4, buildId: null, releaseId: null }),
      ],
      days,
    );
    expect(s.groups.map((g) => [g.releaseId, g.buildId, g.executed])).toEqual([
      [5, 9, 2],
      [5, 8, 1],
      [null, null, 1],
    ]);
    expect(s.groups[0]!.counts).toMatchObject({ ok: 1, ng: 1 });
  });
});

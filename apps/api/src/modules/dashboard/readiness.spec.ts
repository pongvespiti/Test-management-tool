import { describe, expect, it } from '@jest/globals';
import { daysBetween, readinessOf, type ReadinessInput } from './readiness.js';

const input = (over: Partial<ReadinessInput> = {}): ReadinessInput => ({
  total: 100,
  remaining: 40,
  remainingMinutes: 400,
  executedLast7Days: 28, // 4 a day
  endDate: '2026-11-30',
  today: '2026-11-11',
  ...over,
});

describe('daysBetween', () => {
  it('counts calendar days, negative backwards, across month ends', () => {
    expect(daysBetween('2026-11-11', '2026-11-30')).toBe(19);
    expect(daysBetween('2026-11-30', '2026-11-11')).toBe(-19);
    expect(daysBetween('2026-12-30', '2027-01-02')).toBe(3);
    expect(daysBetween('2026-11-11', '2026-11-11')).toBe(0);
  });
});

describe('readinessOf', () => {
  it('is on track when the pace finishes by the end date', () => {
    // 40 cases at 4 a day = 10 days → Nov 21, before Nov 30.
    expect(readinessOf(input())).toEqual({
      state: 'on_track',
      total: 100,
      remaining: 40,
      remainingMinutes: 400,
      executedLast7Days: 28,
      perDay: 4,
      endDate: '2026-11-30',
      daysLeft: 19,
      projectedDate: '2026-11-21',
    });
  });

  it('is on track when the projection lands exactly on the end date', () => {
    expect(readinessOf(input({ remaining: 76 })).state).toBe('on_track'); // 19 days
    expect(readinessOf(input({ remaining: 77 })).state).toBe('at_risk'); // 20 days
  });

  it('is at risk when the pace is too slow or nothing was tested lately', () => {
    expect(readinessOf(input({ remaining: 200 }))).toMatchObject({
      state: 'at_risk',
      projectedDate: '2026-12-31',
    });
    expect(readinessOf(input({ executedLast7Days: 0 }))).toMatchObject({
      state: 'at_risk',
      perDay: 0,
      projectedDate: null,
    });
  });

  it('is at risk on the end date itself while cases are left, overdue after it', () => {
    expect(readinessOf(input({ endDate: '2026-11-11' })).state).toBe('at_risk');
    expect(readinessOf(input({ endDate: '2026-11-10' }))).toMatchObject({
      state: 'overdue',
      daysLeft: -1,
    });
  });

  it('is done when nothing is untested, whatever the dates say', () => {
    expect(readinessOf(input({ remaining: 0, endDate: '2026-01-01' })).state).toBe('done');
    expect(readinessOf(input({ remaining: 0 })).projectedDate).toBeNull();
  });

  it('has no cases / no deadline states', () => {
    expect(readinessOf(input({ total: 0, remaining: 0 })).state).toBe('no_cases');
    expect(readinessOf(input({ endDate: null }))).toMatchObject({
      state: 'no_deadline',
      daysLeft: null,
      projectedDate: '2026-11-21',
    });
  });

  it('drops a projection that is absurdly far away', () => {
    expect(
      readinessOf(input({ remaining: 100_000, executedLast7Days: 1 })).projectedDate,
    ).toBeNull();
  });

  it('rounds the pace to one decimal', () => {
    expect(readinessOf(input({ executedLast7Days: 10 })).perDay).toBe(1.4);
  });
});

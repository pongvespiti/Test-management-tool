import { describe, expect, it } from '@jest/globals';
import { emptyCounts, type MyWorkDTO } from '@tmt/shared';
import { periodTitle, shiftDate, stepOf, summaryText } from './my-work-format';

const base = (over: Partial<MyWorkDTO> = {}): MyWorkDTO => ({
  user: { id: 5, username: 'tom', displayName: 'Tom' },
  timezone: 'Asia/Bangkok',
  range: 'week',
  from: '2026-10-19',
  to: '2026-10-25',
  assigned: {
    untested: 3,
    ng: 1,
    blocked: 0,
    total: 4,
    remainingEstimateMinutes: 30,
    items: [],
    truncated: false,
  },
  summary: {
    executed: 12,
    counts: { ...emptyCounts(), ok: 9, ng: 2, ok_cond: 1 },
    elapsedSec: 12_000,
    days: [],
    groups: [
      {
        release: { id: 5, name: 'Step 1.1.7' },
        build: { id: 8, name: '1.1.7(2.0.0)' },
        executed: 12,
        counts: { ...emptyCounts(), ok: 9, ng: 2, ok_cond: 1 },
        elapsedSec: 12_000,
      },
    ],
    defects: [{ id: 9, key: 'BUG-4', title: 'Times out', status: 'new', severity: 'critical' }],
  },
  ...over,
});

describe('period helpers', () => {
  it('shifts calendar dates across month and year ends', () => {
    expect(shiftDate('2026-10-31', 1)).toBe('2026-11-01');
    expect(shiftDate('2027-01-01', -1)).toBe('2026-12-31');
    expect(shiftDate('2026-10-19', -7)).toBe('2026-10-12');
  });

  it('steps one day or one week', () => {
    expect(stepOf('day')).toBe(1);
    expect(stepOf('week')).toBe(7);
  });

  it('titles a day and a week, also across years', () => {
    expect(periodTitle('day', '2026-10-22', '2026-10-22')).toBe('Thu, Oct 22, 2026');
    expect(periodTitle('week', '2026-10-19', '2026-10-25')).toBe('Oct 19 – Oct 25, 2026');
    expect(periodTitle('week', '2026-12-28', '2027-01-03')).toBe('Dec 28, 2026 – Jan 3, 2027');
  });
});

describe('summaryText', () => {
  it('lists results, time, release / build, defects and what is still waiting', () => {
    const text = summaryText(base(), 'ACS project');
    expect(text.split('\n')).toEqual([
      'Work summary — Oct 19 – Oct 25, 2026 — Tom',
      'Project: ACS project',
      '',
      'Tested 12 cases: 9 OK · 1 OK w/ cond. · 2 NG',
      'Time spent: 3h 20m',
      '',
      'By release / build:',
      '- Step 1.1.7 · 1.1.7(2.0.0): 12 cases (9 OK · 1 OK w/ cond. · 2 NG)',
      '',
      'Defects reported (1):',
      '- BUG-4 Times out [Critical]',
      '',
      'Still waiting: 3 untested, 1 NG, 0 blocked',
    ]);
  });

  it('says so when nothing was recorded and leaves out empty sections', () => {
    const text = summaryText(
      base({
        range: 'day',
        from: '2026-10-22',
        to: '2026-10-22',
        summary: {
          executed: 0,
          counts: emptyCounts(),
          elapsedSec: 0,
          days: [],
          groups: [],
          defects: [],
        },
      }),
      'ACS project',
    );
    expect(text).toContain('No test results recorded in this period.');
    expect(text).not.toContain('By release / build');
    expect(text).not.toContain('Defects reported');
    expect(text).toContain('Work summary — Thu, Oct 22, 2026 — Tom');
  });

  it('names runs without a release or build', () => {
    const text = summaryText(
      base({
        summary: {
          ...base().summary,
          groups: [
            {
              release: null,
              build: null,
              executed: 1,
              counts: { ...emptyCounts(), ok: 1 },
              elapsedSec: 0,
            },
          ],
        },
      }),
      'P',
    );
    expect(text).toContain('- No release: 1 case (1 OK)');
  });
});

import { describe, expect, it } from '@jest/globals';
import type { ResultStatus } from '@tmt/shared';
import { classify, compareResults, type SideResult } from './compare.js';

const res = (id: number, status: ResultStatus, suite = 'Unit'): SideResult => ({
  testCaseId: id,
  displayId: `UO-${String(id).padStart(3, '0')}`,
  title: `Case ${id}`,
  suite,
  status,
});

describe('classify', () => {
  it.each([
    ['ok', 'ng', 'regression'],
    ['ok_cond', 'blocked', 'regression'],
    ['ng', 'ok', 'fixed'],
    ['blocked', 'ok_cond', 'fixed'],
    ['ng', 'ng', 'still_failing'],
    ['ng', 'blocked', 'still_failing'],
    ['ok', 'untested', 'not_run'],
    ['ng', 'nt', 'not_run'],
    ['untested', 'ok', 'newly_run'],
    ['na', 'ng', 'newly_run'],
    ['ok', 'ok', 'unchanged'],
    ['ok', 'ok_cond', 'unchanged'],
    ['untested', 'nt', 'unchanged'],
  ] as [ResultStatus, ResultStatus, string][])('%s → %s is %s', (b, t, expected) => {
    expect(classify(b, t)).toBe(expected);
  });

  it('knows cases that are on one side only', () => {
    expect(classify(null, 'ok')).toBe('only_target');
    expect(classify('ok', null)).toBe('only_base');
  });
});

describe('compareResults', () => {
  const base = [res(1, 'ok'), res(2, 'ng'), res(3, 'ok'), res(4, 'ok'), res(6, 'ok', 'Adapter')];
  const target = [res(1, 'ng'), res(2, 'ok'), res(3, 'ok'), res(5, 'ng'), res(6, 'ng', 'Adapter')];
  const out = compareResults(base, target);

  it('counts every change', () => {
    expect(out.summary).toEqual({
      regression: 2,
      still_failing: 0,
      not_run: 0,
      newly_run: 0,
      fixed: 1,
      only_base: 1,
      only_target: 1,
      unchanged: 1,
    });
  });

  it('puts regressions first, then by suite and id, unchanged last', () => {
    expect(out.rows.map((r) => [r.displayId, r.change])).toEqual([
      ['UO-006', 'regression'],
      ['UO-001', 'regression'],
      ['UO-002', 'fixed'],
      ['UO-004', 'only_base'],
      ['UO-005', 'only_target'],
      ['UO-003', 'unchanged'],
    ]);
    expect(out.rows[1]).toMatchObject({ base: 'ok', target: 'ng', title: 'Case 1' });
  });
});

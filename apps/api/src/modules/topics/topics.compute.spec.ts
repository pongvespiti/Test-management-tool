import { describe, expect, it } from '@jest/globals';
import { emptyCounts } from '@tmt/shared';
import { earliest, isOverdue, stateOf, sumCounts } from './topics.compute.js';

const counts = (over: Partial<ReturnType<typeof emptyCounts>>) => ({ ...emptyCounts(), ...over });

describe('topics compute', () => {
  it('derives the state from the results', () => {
    expect(stateOf(emptyCounts())).toBe('not_started');
    expect(stateOf(counts({ untested: 4 }))).toBe('not_started');
    expect(stateOf(counts({ untested: 2, ok: 2 }))).toBe('in_progress');
    expect(stateOf(counts({ ok: 3, ng: 1 }))).toBe('done');
    // N/A and N/T are decided results too.
    expect(stateOf(counts({ na: 2, nt: 1 }))).toBe('done');
  });

  it('is overdue after the due date until everything is done', () => {
    expect(isOverdue('2026-11-10', '2026-11-12', 'in_progress')).toBe(true);
    expect(isOverdue('2026-11-10', '2026-11-12', 'not_started')).toBe(true);
    expect(isOverdue('2026-11-10', '2026-11-12', 'done')).toBe(false);
    expect(isOverdue('2026-11-12', '2026-11-12', 'in_progress')).toBe(false);
    expect(isOverdue(null, '2026-11-12', 'in_progress')).toBe(false);
  });

  it('sums counts and picks the earliest date', () => {
    expect(sumCounts([counts({ ok: 1 }), counts({ ok: 2, ng: 1 })])).toMatchObject({
      ok: 3,
      ng: 1,
    });
    expect(earliest([null, '2026-11-20', '2026-11-18'])).toBe('2026-11-18');
    expect(earliest([null])).toBeNull();
  });
});

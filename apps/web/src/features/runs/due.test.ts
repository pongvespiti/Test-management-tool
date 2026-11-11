import { describe, expect, it } from '@jest/globals';
import { emptyCounts } from '@tmt/shared';
import { runDue } from './due';

describe('runDue', () => {
  const open = { ...emptyCounts(), ok: 2, untested: 1 };
  const done = { ...emptyCounts(), ok: 3 };

  it('is empty without a due date', () => {
    expect(runDue({ dueDate: null, counts: open }, '2026-11-12')).toBeNull();
  });

  it('is overdue only while cases are untested', () => {
    expect(runDue({ dueDate: '2026-11-10', counts: open }, '2026-11-12')).toEqual({
      date: '2026-11-10',
      overdue: true,
    });
    expect(runDue({ dueDate: '2026-11-10', counts: done }, '2026-11-12')?.overdue).toBe(false);
    expect(runDue({ dueDate: '2026-11-12', counts: open }, '2026-11-12')?.overdue).toBe(false);
  });
});

import { describe, expect, it } from '@jest/globals';
import { countByStatus, elapsedMinutes, formatMinutes, timeBox } from './session-format';

const at = (iso: string) => Date.parse(iso);
const base = { startedAt: '2026-11-10T09:00:00.000Z', endedAt: null, timeBoxMinutes: 60 };

describe('elapsedMinutes', () => {
  it('is 0 before the start', () => {
    expect(elapsedMinutes({ startedAt: null, endedAt: null, timeBoxMinutes: null }, 0)).toBe(0);
  });
  it('counts to now while running and to the end once finished', () => {
    expect(elapsedMinutes(base, at('2026-11-10T09:30:00.000Z'))).toBe(30);
    expect(
      elapsedMinutes({ ...base, endedAt: '2026-11-10T09:45:00.000Z' }, at('2026-11-11T00:00:00Z')),
    ).toBe(45);
  });
  it('never goes negative (clock skew)', () => {
    expect(elapsedMinutes(base, at('2026-11-10T08:00:00.000Z'))).toBe(0);
  });
});

describe('formatMinutes', () => {
  it('reads short and long spans', () => {
    expect(formatMinutes(0.4)).toBe('< 1 min');
    expect(formatMinutes(42.9)).toBe('42 min');
    expect(formatMinutes(60)).toBe('1 h');
    expect(formatMinutes(65)).toBe('1 h 05 min');
  });
});

describe('timeBox', () => {
  it('has no state without a time box', () => {
    expect(timeBox({ ...base, timeBoxMinutes: null }, at('2026-11-10T10:00:00Z')).state).toBe(
      'none',
    );
  });
  it('is within, near (80 %) and over', () => {
    expect(timeBox(base, at('2026-11-10T09:30:00Z')).state).toBe('within');
    expect(timeBox(base, at('2026-11-10T09:48:00Z')).state).toBe('near');
    const over = timeBox(base, at('2026-11-10T10:10:00Z'));
    expect(over.state).toBe('over');
    expect(over.remaining).toBe(-10);
  });
});

const item = (status: 'planned' | 'in_progress' | 'completed') => ({ status }) as never;

describe('countByStatus', () => {
  it('counts each status and the total', () => {
    expect(countByStatus([item('planned'), item('completed'), item('completed')])).toEqual({
      all: 3,
      planned: 1,
      in_progress: 0,
      completed: 2,
    });
  });
});

import { describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react';
import {
  draftFromCase,
  DraftStore,
  draftsKey,
  elapsedNow,
  parseDrafts,
  pauseTimer,
  sameDraft,
  serializeDrafts,
  useDraftIds,
  type ResultDraft,
} from './drafts';
import { makeRunCase } from './test-fixtures';

const steps = [
  { action: 'Open', expected: 'Opened', sharedStepName: null },
  { action: 'Close', expected: 'Closed', sharedStepName: null },
];
const base: ResultDraft = {
  status: 'ng',
  actualResult: 'Off',
  remark: '',
  elapsedSec: 10,
  timerStartedAt: null,
  stepResults: [],
};

describe('draft values', () => {
  it('builds a draft from a run case, aligning step results with the steps', () => {
    expect(
      draftFromCase(makeRunCase({ status: 'ok', actualResult: 'Fine', elapsedSec: 5 })),
    ).toEqual({ ...base, status: 'ok', actualResult: 'Fine', elapsedSec: 5 });
    expect(
      draftFromCase(
        makeRunCase({ steps, stepResults: [{ status: 'ok', actual: 'x' }], resultRemark: 'r' }),
      ),
    ).toEqual({
      status: 'untested',
      actualResult: '',
      remark: 'r',
      elapsedSec: 0,
      timerStartedAt: null,
      stepResults: [
        { status: 'ok', actual: 'x' },
        { status: 'untested', actual: '' },
      ],
    });
  });

  it('compares every field', () => {
    const withSteps = { ...base, stepResults: [{ status: 'ok' as const, actual: '' }] };
    expect(sameDraft(base, { ...base })).toBe(true);
    expect(sameDraft(base, { ...base, status: 'ok' })).toBe(false);
    expect(sameDraft(base, { ...base, actualResult: 'x' })).toBe(false);
    expect(sameDraft(base, { ...base, remark: 'x' })).toBe(false);
    expect(sameDraft(base, { ...base, elapsedSec: 11 })).toBe(false);
    expect(sameDraft(base, { ...base, timerStartedAt: 1 })).toBe(false);
    expect(sameDraft(base, withSteps)).toBe(false);
    expect(
      sameDraft(withSteps, { ...withSteps, stepResults: [{ status: 'ng', actual: '' }] }),
    ).toBe(false);
    expect(
      sameDraft(withSteps, { ...withSteps, stepResults: [{ status: 'ok', actual: 'y' }] }),
    ).toBe(false);
  });

  it('adds the running timer segment and pauses it', () => {
    expect(elapsedNow(base, 99_000)).toBe(10);
    const running = { ...base, timerStartedAt: 1_000 };
    expect(elapsedNow(running, 6_500)).toBe(15);
    expect(elapsedNow(running, 0)).toBe(10);
    expect(pauseTimer(base)).toBe(base);
    expect(pauseTimer(running, 4_000)).toEqual({ ...base, elapsedSec: 13 });
  });
});

describe('stored drafts', () => {
  it('parses valid drafts and drops malformed ones', () => {
    expect(parseDrafts(null).size).toBe(0);
    expect(parseDrafts('{oops').size).toBe(0);
    expect(parseDrafts('[1]').size).toBe(0);
    expect(parseDrafts('null').size).toBe(0);
    const parsed = parseDrafts(
      JSON.stringify({
        5: { ...base, elapsedSec: 7.9, timerStartedAt: 123 },
        6: { ...base, stepResults: [{ status: 'ok', actual: 'fine' }] },
        7: { ...base, status: 'done' },
        8: { ...base, elapsedSec: -1 },
        9: { ...base, stepResults: [{ status: 'ok' }] },
        10: { ...base, stepResults: [null] },
        11: { ...base, stepResults: 'x' },
        12: { ...base, remark: 3 },
        13: 'text',
        abc: base,
        0: base,
      }),
    );
    expect([...parsed.keys()]).toEqual([5, 6]);
    expect(parsed.get(5)).toEqual({ ...base, elapsedSec: 7 });
    expect(parsed.get(6)!.stepResults).toEqual([{ status: 'ok', actual: 'fine' }]);
  });

  it('serializes with running timers paused', () => {
    expect(serializeDrafts(new Map())).toBeNull();
    const json = serializeDrafts(new Map([[5, { ...base, timerStartedAt: 0 }]]), 5_000);
    expect(JSON.parse(json!)).toEqual({ 5: { ...base, elapsedSec: 15 } });
  });
});

describe('DraftStore', () => {
  it('keeps drafts in memory and notifies when the set of ids changes', () => {
    const store = new DraftStore();
    const listener = jest.fn();
    const unsubscribe = store.subscribe(listener);
    store.set(1, base);
    store.set(1, { ...base, remark: 'x' });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.get(1)!.remark).toBe('x');
    expect([...store.getIds()]).toEqual([1]);
    store.set(2, null);
    expect(store.size).toBe(1);
    store.set(1, null);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(store.get(1)).toBeNull();
    unsubscribe();
    store.set(3, base);
    expect(listener).toHaveBeenCalledTimes(2);
    store.persist();
  });

  it('loads from and writes to localStorage', () => {
    const key = draftsKey(7);
    expect(key).toBe('tmt:run-drafts:7');
    window.localStorage.setItem(key, JSON.stringify({ 4: base }));
    const store = new DraftStore(key);
    expect(store.get(4)).toEqual(base);
    store.set(5, { ...base, remark: 'new' });
    expect(JSON.parse(window.localStorage.getItem(key)!)).toEqual({
      4: base,
      5: { ...base, remark: 'new' },
    });
    store.set(4, null);
    store.set(5, null);
    expect(window.localStorage.getItem(key)).toBeNull();
  });

  it('prunes drafts of removed cases, changed steps and saved values', () => {
    const store = new DraftStore();
    store.set(1, base);
    store.set(2, base);
    store.set(3, { ...base, stepResults: [{ status: 'ok', actual: '' }] });
    store.set(4, draftFromCase(makeRunCase({ id: 4, status: 'ok' })));
    const listener = jest.fn();
    store.subscribe(listener);
    store.prune([
      makeRunCase({ id: 2 }),
      makeRunCase({ id: 3 }),
      makeRunCase({ id: 4, status: 'ok' }),
    ]);
    expect([...store.getIds()]).toEqual([2]);
    expect(listener).toHaveBeenCalledTimes(1);
    store.prune([makeRunCase({ id: 2 })]);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('re-renders subscribers of the ids', () => {
    const store = new DraftStore();
    const { result } = renderHook(() => useDraftIds(store));
    expect(result.current.size).toBe(0);
    act(() => store.set(9, base));
    expect([...result.current]).toEqual([9]);
  });
});

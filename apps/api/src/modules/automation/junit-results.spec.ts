import { describe, expect, it } from '@jest/globals';
import type { JunitMatch } from './junit-match.js';
import type { JunitTest } from './junit-parse.js';
import {
  actualOf,
  assignTests,
  combineTests,
  elapsedOf,
  groupMissing,
  statusOf,
} from './junit-results.js';

const test = (name: string, extra: Partial<JunitTest> = {}): JunitTest => ({
  name,
  classname: null,
  suiteName: '',
  outcome: 'ok',
  message: null,
  timeSec: null,
  properties: {},
  ...extra,
});
const ntFor = (t: JunitTest) => statusOf(t, 'nt');

describe('JUnit results', () => {
  it('maps outcomes to statuses', () => {
    expect(statusOf(test('a'), 'nt')).toBe('ok');
    expect(statusOf(test('a', { outcome: 'ng' }), 'nt')).toBe('ng');
    expect(statusOf(test('a', { outcome: 'skipped' }), 'blocked')).toBe('blocked');
  });

  it('keeps the messages of the tests that decided the status', () => {
    const tests = [
      test('a', { outcome: 'ng', message: 'boom' }),
      test('', { classname: 'pkg.B', outcome: 'ng', message: 'bang\r\n' }),
      test('c', { outcome: 'skipped', message: 'later' }),
    ];
    expect(actualOf(tests, 'ok', ntFor)).toBeNull();
    expect(actualOf(tests, 'ng', ntFor)).toBe('a: boom\n\npkg.B: bang');
    expect(actualOf([tests[0]!], 'ng', ntFor)).toBe('boom');
    expect(actualOf([test('x', { outcome: 'ng' })], 'ng', ntFor)).toBeNull();
    expect(
      actualOf([test('x', { outcome: 'ng', message: 'y'.repeat(30_000) })], 'ng', ntFor),
    ).toHaveLength(20_000);
  });

  it('sums and caps elapsed time', () => {
    expect(elapsedOf([test('a')])).toBeNull();
    expect(elapsedOf([test('a', { timeSec: 1 }), test('b', { timeSec: 1.5 }), test('c')])).toBe(3);
    expect(elapsedOf([test('a', { timeSec: 2_000_000 })])).toBe(864_000);
  });

  it('assigns tests to run cases, collects unmatched ones and the ones to create', () => {
    const results: Record<string, JunitMatch> = {
      a: { kind: 'matched', runCaseId: 1 },
      b: { kind: 'matched', runCaseId: 1 },
      c: { kind: 'ambiguous', candidates: [2, 3] },
      d: { kind: 'no_match' },
    };
    const tests = ['a', 'b', 'c', 'd'].map((n) =>
      test(n, { outcome: n === 'c' ? 'skipped' : 'ok' }),
    );
    const plain = assignTests(tests, (t) => results[t.name]!, {
      createMissing: false,
      skippedAs: 'na',
    });
    expect(plain.assigned.get(1)!.map((t) => t.name)).toEqual(['a', 'b']);
    expect(plain.unmatched).toEqual([
      { name: 'c', classname: null, status: 'na', reason: 'ambiguous' },
      { name: 'd', classname: null, status: 'ok', reason: 'no_match' },
    ]);
    expect(plain.missing).toEqual([]);
    const create = assignTests(tests, (t) => results[t.name]!, {
      createMissing: true,
      skippedAs: 'nt',
    });
    expect(create.unmatched.map((u) => u.name)).toEqual(['c']);
    expect(create.missing.map((t) => t.name)).toEqual(['d']);
  });

  it('combines several tests on one run case with the worst status', () => {
    expect(
      combineTests(
        [test('a', { timeSec: 1 }), test('b', { outcome: 'ng', message: 'x', timeSec: 1.5 })],
        ntFor,
      ),
    ).toEqual({ status: 'ng', tests: 2, actual: 'x', elapsedSec: 3 });
  });

  it('groups missing tests by suite, class and name', () => {
    const groups = groupMissing([
      test('opens', { suiteName: 'S', classname: 'C' }),
      test('opens', { suiteName: 'S', classname: 'C', outcome: 'skipped' }),
      test('opens', { suiteName: 'T', classname: 'C' }),
    ]);
    expect([...groups.values()].map((g) => g.length)).toEqual([2, 1]);
  });
});

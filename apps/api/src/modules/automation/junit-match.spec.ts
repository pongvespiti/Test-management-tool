import { describe, expect, it } from '@jest/globals';
import { canonicalDisplayId, createJunitMatcher, displayIdTokens } from './junit-match.js';
import type { JunitTest } from './junit-parse.js';

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

const runCases = [
  { id: 1, displayId: 'ADP-001', code: 'test_login', title: 'Login with valid password' },
  { id: 2, displayId: 'ADP-002', code: null, title: 'Read register 40001' },
  { id: 3, displayId: 'ADP-003', code: 'WR-1', title: 'Write register' },
  { id: 4, displayId: 'ADP-004', code: null, title: 'Duplicate title' },
  { id: 5, displayId: 'ADP-005', code: null, title: 'Duplicate  TITLE' },
  { id: 6, displayId: 'ADP-006', code: 'PROP-1', title: 'Property target' },
];

describe('JUnit matching', () => {
  it('canonicalises display ids and finds tokens in names and classnames', () => {
    expect(canonicalDisplayId(' mbs_036 ')).toBe('MBS-36');
    expect(canonicalDisplayId('MBS-36x')).toBeNull();
    expect(displayIdTokens('test_ADP_003_write', 'com.x.ADP_001Test', null)).toEqual([
      'ADP-3',
      'ADP-1',
    ]);
    expect(displayIdTokens('1ADP-1', 'ADP-12345678901')).toEqual([]);
  });

  it('applies the auto rules in order: property, code, display id, title', () => {
    const match = createJunitMatcher(runCases, 'auto');
    expect(match(test('whatever', { properties: { tmt_id: 'adp_006' } }))).toEqual({
      kind: 'matched',
      runCaseId: 6,
    });
    expect(match(test('x', { properties: { case_id: 'prop-1' } }))).toEqual({
      kind: 'matched',
      runCaseId: 6,
    });
    expect(match(test(' TEST_LOGIN '))).toEqual({ kind: 'matched', runCaseId: 1 });
    expect(match(test('test_ADP_003_write'))).toEqual({ kind: 'matched', runCaseId: 3 });
    expect(match(test('x', { classname: 'pkg.ADP_002Test' }))).toEqual({
      kind: 'matched',
      runCaseId: 2,
    });
    expect(match(test('Read  REGISTER 40001'))).toEqual({ kind: 'matched', runCaseId: 2 });
    expect(match(test('duplicate title'))).toEqual({ kind: 'ambiguous', candidates: [4, 5] });
    expect(match(test('unknown'))).toEqual({ kind: 'no_match' });
    // A property that finds several cases is ambiguous and decides.
    expect(
      match(test('test_login', { properties: { tmt_id: 'ADP-001', test_id: 'WR-1' } })),
    ).toEqual({ kind: 'ambiguous', candidates: [1, 3] });
  });

  it('uses a single rule in explicit modes', () => {
    expect(createJunitMatcher(runCases, 'code')(test('Write register'))).toEqual({
      kind: 'no_match',
    });
    expect(createJunitMatcher(runCases, 'title')(test('Write register'))).toEqual({
      kind: 'matched',
      runCaseId: 3,
    });
    expect(createJunitMatcher(runCases, 'display_id')(test('test_login'))).toEqual({
      kind: 'no_match',
    });
    expect(createJunitMatcher(runCases, 'title')(test(''))).toEqual({ kind: 'no_match' });
  });
});

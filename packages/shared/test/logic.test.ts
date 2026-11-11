import { describe, expect, it } from '@jest/globals';
import {
  addCounts,
  can,
  countsFromRows,
  displayId,
  emptyCounts,
  executedOf,
  formatPercent,
  groupKeyOf,
  matrixCell,
  normalizeLine,
  normalizeText,
  passRateOf,
  progressOf,
  roleAtLeast,
  safeFileName,
  slugKey,
  suggestDocNo,
  suggestJudgement,
  totalOf,
  uniqueKey,
  type StatusCounts,
} from '../src';

const counts = (partial: Partial<StatusCounts>): StatusCounts => ({ ...emptyCounts(), ...partial });

describe('metrics', () => {
  it('counts totals, executed and progress', () => {
    const c = counts({ ok: 27, ng: 2, nt: 1, untested: 4 });
    expect(totalOf(c)).toBe(34);
    expect(executedOf(c)).toBe(30);
    expect(progressOf(c)).toBeCloseTo(30 / 34);
    expect(progressOf(emptyCounts())).toBe(0);
  });

  it('pass rate excludes N/A, N/T and untested', () => {
    expect(passRateOf(counts({ ok: 434, na: 20 }))).toBe(1);
    expect(passRateOf(counts({ ok: 160, ok_cond: 2, ng: 1, na: 21, untested: 58 }))).toBeCloseTo(
      162 / 163,
    );
    expect(passRateOf(counts({ na: 3, nt: 1 }))).toBeNull();
    expect(passRateOf(counts({ ok: 1, blocked: 1 }))).toBe(0.5);
  });

  it('suggests a judgement only when it is decidable', () => {
    expect(suggestJudgement(emptyCounts())).toBeNull();
    expect(suggestJudgement(counts({ ok: 5, ng: 1, untested: 3 }))).toBe('not_pass');
    expect(suggestJudgement(counts({ ok: 5, untested: 1 }))).toBeNull();
    expect(suggestJudgement(counts({ ok: 5, blocked: 1 }))).toBeNull();
    expect(suggestJudgement(counts({ ok: 5, ok_cond: 1, na: 2 }))).toBe('pass_with_condition');
    expect(suggestJudgement(counts({ ok: 219, na: 3 }))).toBe('pass');
    expect(suggestJudgement(counts({ na: 3 }))).toBeNull();
  });

  it('builds counts from SQL rows and adds them', () => {
    const c = countsFromRows([
      { status: 'ok', count: '3' },
      { status: 'ng', count: 1 },
      { status: 'bogus', count: 9 },
    ]);
    expect(c.ok).toBe(3);
    expect(c.ng).toBe(1);
    expect(totalOf(addCounts(c, c))).toBe(8);
  });

  it('formats percentages', () => {
    expect(formatPercent(0.9151)).toBe('92%');
    expect(formatPercent(0.995, 1)).toBe('99.5%');
    expect(formatPercent(null)).toBe('—');
  });
});

describe('matrix', () => {
  it('aggregates a group into the worst meaningful cell', () => {
    expect(matrixCell(emptyCounts())).toBeNull();
    expect(matrixCell(counts({ ok: 5, ng: 1 }))).toBe('ng');
    expect(matrixCell(counts({ ok: 5, blocked: 1, untested: 1 }))).toBe('blocked');
    expect(matrixCell(counts({ ok: 5, untested: 1 }))).toBe('in_progress');
    expect(matrixCell(counts({ untested: 4 }))).toBe('untested');
    expect(matrixCell(counts({ na: 4 }))).toBe('na');
    expect(matrixCell(counts({ na: 2, nt: 1 }))).toBe('nt');
    expect(matrixCell(counts({ ok: 3, ok_cond: 1, na: 2 }))).toBe('pass_cond');
    expect(matrixCell(counts({ ok: 3, na: 2 }))).toBe('pass');
  });

  it('chooses the group key', () => {
    const rc = {
      summaryGroup: null,
      sectionPath: ['Normal case', 'WPS method'],
      caseType: 'Abnormal',
    };
    expect(groupKeyOf('summary', rc)).toBe('Normal case');
    expect(groupKeyOf('summary', { ...rc, summaryGroup: 'Set temperature' })).toBe(
      'Set temperature',
    );
    expect(groupKeyOf('section', rc)).toBe('WPS method');
    expect(groupKeyOf('type', rc)).toBe('Abnormal');
    expect(groupKeyOf('section', { ...rc, sectionPath: [] })).toBe('(No section)');
  });
});

describe('text helpers', () => {
  it('slugs labels into keys', () => {
    expect(slugKey('Expected result of device')).toBe('expected_result_of_device');
    expect(slugKey('OS(ver)')).toBe('os_ver');
    expect(slugKey('ADP&FW')).toBe('adp_and_fw');
    expect(slugKey('2nd field')).toBe('f_2nd_field');
    expect(slugKey('***')).toBe('field');
    expect(uniqueKey('register', ['register', 'register_2'])).toBe('register_3');
  });

  it('normalises multi-line Excel text', () => {
    expect(normalizeText('\r\n  App result  \r\n\r\n\r\n\r\n1. Login successful \n')).toBe(
      '  App result\n\n1. Login successful',
    );
    expect(normalizeText('   ')).toBeNull();
    expect(normalizeText(null)).toBeNull();
    expect(normalizeLine('Unit control \nof Cool mode')).toBe('Unit control of Cool mode');
  });

  it('formats ids and file names', () => {
    expect(displayId('MBS', 36)).toBe('MBS-036');
    expect(displayId('UOT', 1234)).toBe('UOT-1234');
    expect(safeFileName('26TR-TEAM-10-61 Unit/operation: test?')).toBe(
      '26TR-TEAM-10-61 Unit operation test',
    );
    expect(safeFileName('///')).toBe('download');
  });
});

describe('document numbers', () => {
  const oct = new Date(2026, 9, 22);
  it('suggests the next number of the month', () => {
    expect(suggestDocNo([], oct)).toBe('26TR-TEAM-10-1');
    expect(
      suggestDocNo(['26TR-TEAM-10-61', '26TR-TEAM-10- 62', '26TR-TEAM-09-99', 'random'], oct),
    ).toBe('26TR-TEAM-10-63');
  });
  it('supports custom patterns', () => {
    expect(suggestDocNo(['TR-QA-2026-007'], oct, 'TR-QA-{YYYY}-{SEQ}')).toBe('TR-QA-2026-8');
    expect(suggestDocNo([], oct, 'FIXED')).toBe('FIXED');
  });
});

describe('permissions', () => {
  it('ranks roles', () => {
    expect(roleAtLeast('lead', 'tester')).toBe(true);
    expect(roleAtLeast('viewer', 'tester')).toBe(false);
    expect(roleAtLeast(null, 'viewer')).toBe(false);
    expect(can('tester', 'execute')).toBe(true);
    expect(can('tester', 'reopenPlan')).toBe(false);
    // Testers add the builds they test; releases stay with leads.
    expect(can('tester', 'manageBuilds')).toBe(true);
    expect(can('viewer', 'manageBuilds')).toBe(false);
    expect(can('tester', 'manageReleases')).toBe(false);
    expect(can('viewer', 'export')).toBe(true);
  });
});

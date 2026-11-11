import { describe, expect, it } from '@jest/globals';
import {
  emptyEnvRow,
  envEntriesOf,
  envRowErrors,
  envRowsFromEntries,
  envRowsFromLabels,
  envUid,
  mergeEnvTemplate,
  withoutBodyErrors,
  type EnvRow,
} from './env-rows';
import {
  duplicateRunBody,
  duplicateRunDefaults,
  editRunBody,
  editRunDefaults,
  newRunBody,
  newRunDefaults,
  rerunBody,
  rerunDefaults,
  rerunMatching,
  validateDuplicateRun,
  validateEditRun,
  validateNewRun,
  validateRerun,
} from './run-form-model';
import { counts, makeRun } from './test-fixtures';

const row = (label: string, value: string): EnvRow => ({ uid: envUid(), label, value });

describe('environment rows', () => {
  it('creates rows with unique keys', () => {
    expect(emptyEnvRow()).toMatchObject({ label: '', value: '' });
    expect(envUid()).not.toBe(envUid());
    expect(envRowsFromEntries([{ label: 'FW', value: '1.0' }])).toMatchObject([
      { label: 'FW', value: '1.0' },
    ]);
    expect(envRowsFromLabels(['FW', 'OS'])).toMatchObject([
      { label: 'FW', value: '' },
      { label: 'OS', value: '' },
    ]);
  });

  it('merges a suite template with what was typed', () => {
    const current = [row('fw ', '1.0'), row('Phone', 'Pixel'), row('Note', '')];
    expect(mergeEnvTemplate(['FW', 'OS'], current)).toMatchObject([
      { label: 'FW', value: '1.0' },
      { label: 'OS', value: '' },
      { label: 'Phone', value: 'Pixel' },
    ]);
  });

  it('drops blank rows and trims the body', () => {
    expect(envEntriesOf([row(' FW ', ' 1.0 '), row('', ' '), row('', 'x')])).toEqual([
      { label: 'FW', value: '1.0' },
      { label: '', value: 'x' },
    ]);
  });

  it('checks names and lengths per row', () => {
    expect(
      envRowErrors([
        row('', 'value without a name'),
        row('x'.repeat(101), 'v'.repeat(501)),
        row('ok', 'ok'),
        row('', ''),
      ]),
    ).toEqual({
      'environment.0.label': 'Name this item',
      'environment.1.label': 'Use at most 100 characters',
      'environment.1.value': 'Use at most 500 characters',
    });
    expect(envRowErrors([row('', 'x')], 'env')).toEqual({ 'env.0.label': 'Name this item' });
  });

  it('removes body errors of the environment', () => {
    const errors = { code: 'Required', environment: 'Too many', 'environment.0.label': 'Required' };
    expect(withoutBodyErrors(errors)).toEqual({ code: 'Required' });
    expect(withoutBodyErrors({ env: 'x', code: 'y' }, 'env')).toEqual({ code: 'y' });
  });
});

describe('new run form model', () => {
  it('leaves empty filters out of the body', () => {
    const body = newRunBody({ ...newRunDefaults(), suiteId: '1', code: 'KR_01' });
    expect(body).toEqual({
      suiteId: 1,
      code: 'KR_01',
      scenario: '',
      testerId: null,
      buildId: null,
      testedDate: '',
      dueDate: '',
      environment: [],
      sectionIds: undefined,
      priorities: undefined,
      tags: undefined,
      caseStatuses: ['ready'],
    });
    expect(newRunBody(newRunDefaults()).suiteId).toBe(0);
  });

  it('sends the chosen filters', () => {
    const body = newRunBody({
      ...newRunDefaults(),
      suiteId: '2',
      code: 'X',
      testedDate: '2026-10-02',
      sectionIds: ['11', '12'],
      priorities: ['high'],
      tags: ['smoke'],
      environment: [row('FW', '1.0')],
    });
    expect(body).toMatchObject({
      sectionIds: [11, 12],
      priorities: ['high'],
      tags: ['smoke'],
      testedDate: '2026-10-02',
      environment: [{ label: 'FW', value: '1.0' }],
    });
  });

  it('requires a suite, a code and a review status', () => {
    expect(validateNewRun({ ...newRunDefaults(), caseStatuses: [] })).toMatchObject({
      suiteId: 'Choose a suite',
      code: 'Required',
      caseStatuses: 'Choose at least one status',
    });
    expect(
      validateNewRun({
        ...newRunDefaults(),
        suiteId: '1',
        code: 'KR_01',
        environment: [row('', 'x')],
      }),
    ).toEqual({ 'environment.0.label': 'Name this item' });
    expect(validateNewRun({ ...newRunDefaults(), suiteId: '1', code: 'KR_01' })).toEqual({});
  });
});

describe('edit, duplicate and re-run models', () => {
  it('edits a run', () => {
    const run = makeRun({ scenario: null, tester: null, judgementNote: null, remark: null });
    const values = editRunDefaults(run);
    expect(values).toMatchObject({ scenario: '', testerId: null, judgementNote: '', remark: '' });
    expect(editRunBody({ ...values, testedDate: null, judgement: 'pass' })).toMatchObject({
      code: 'KR_01',
      testedDate: '',
      judgement: 'pass',
      environment: run.environment,
    });
    expect(validateEditRun({ ...values, code: ' ' })).toEqual({ code: 'Required' });
    expect(validateEditRun(editRunDefaults(makeRun()))).toEqual({});
  });

  it('duplicates a run with the next free code', () => {
    const run = makeRun();
    const values = duplicateRunDefaults(run, [run, makeRun({ id: 22, code: 'KR_02' })]);
    expect(values).toMatchObject({ code: 'KR_03', scenario: 'AP mode · iOS', testerId: 1 });
    expect(duplicateRunBody(values)).toEqual({
      code: 'KR_03',
      scenario: 'AP mode · iOS',
      testerId: 1,
      buildId: null,
      environment: run.environment,
    });
    expect(validateDuplicateRun({ ...values, code: '' })).toEqual({ code: 'Required' });
    expect(duplicateRunDefaults(makeRun({ scenario: null, tester: null }), [])).toMatchObject({
      scenario: '',
      testerId: null,
    });
  });

  it('re-runs the chosen results', () => {
    const run = makeRun({ counts: counts({ ng: 2, blocked: 1, ok: 5 }) });
    const values = rerunDefaults(run, [run]);
    expect(values).toMatchObject({ code: 'KR_01_R1', statuses: ['ng', 'blocked'] });
    expect(rerunMatching(values.statuses, run.counts)).toBe(3);
    expect(rerunBody(values).environment).toBeUndefined();
    expect(rerunBody({ ...values, copyEnvironment: false }).environment).toEqual(run.environment);
    expect(validateRerun(values)).toEqual({});
    expect(
      validateRerun({
        ...values,
        statuses: [],
        copyEnvironment: false,
        environment: [row('', 'x')],
      }),
    ).toEqual({
      statuses: 'Choose at least one result',
      'environment.0.label': 'Name this item',
    });
    expect(rerunDefaults(makeRun({ scenario: null, tester: null }), [])).toMatchObject({
      scenario: '',
      testerId: null,
    });
  });
});

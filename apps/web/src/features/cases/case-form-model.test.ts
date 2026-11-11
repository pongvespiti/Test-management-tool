import { describe, expect, it } from '@jest/globals';
import {
  changedKeys,
  EDITABLE_STATUSES,
  editorStepsToText,
  fromStepDTO,
  insertSharedStep,
  isBlankStep,
  newUid,
  plainStep,
  REVIEWABLE_KEYS,
  toBody,
  toValues,
  usedSharedStepIds,
  validateCaseForm,
  type EditorStep,
} from './case-form-model';
import { makeCase, makeSharedStep } from './test-utils';

const shared = (over: Partial<Extract<EditorStep, { kind: 'shared' }>> = {}): EditorStep => ({
  uid: newUid(),
  kind: 'shared',
  sharedStepId: 5,
  name: 'Log in',
  steps: [{ action: 'Sign in', expected: 'Home' }],
  ...over,
});

describe('editor steps', () => {
  it('creates unique keys and plain rows', () => {
    expect(newUid()).not.toBe(newUid());
    expect(plainStep('a', 'b')).toMatchObject({ kind: 'step', action: 'a', expected: 'b' });
    expect(plainStep()).toMatchObject({ action: '', expected: '' });
  });

  it('converts stored steps into editor rows', () => {
    expect(fromStepDTO({ kind: 'step', action: 'a', expected: 'b' })).toMatchObject({
      kind: 'step',
      action: 'a',
    });
    expect(
      fromStepDTO({ kind: 'shared', sharedStepId: 5, name: 'Log in', steps: [], missing: true }),
    ).toMatchObject({ kind: 'shared', sharedStepId: 5, missing: true });
  });

  it('detects blank rows', () => {
    expect(isBlankStep(plainStep(' ', ' '))).toBe(true);
    expect(isBlankStep(plainStep('a'))).toBe(false);
    expect(isBlankStep(plainStep('', 'b'))).toBe(false);
    expect(isBlankStep(shared())).toBe(false);
  });

  it('writes steps as numbered text with shared steps expanded', () => {
    expect(editorStepsToText([plainStep('Press ON', ''), shared()])).toEqual({
      procedure: '1. Press ON\n2. Sign in',
      expected: '2. Home',
    });
  });

  it('inserts a shared step set, replacing a single blank starter row', () => {
    const s = makeSharedStep();
    expect(insertSharedStep([plainStep()], s)).toEqual([
      expect.objectContaining({ kind: 'shared', sharedStepId: 5, name: 'Log in to the app' }),
    ]);
    const kept = insertSharedStep([plainStep('a')], s);
    expect(kept).toHaveLength(2);
    expect(insertSharedStep([plainStep(), plainStep()], s)).toHaveLength(3);
    expect(usedSharedStepIds([plainStep(), shared(), shared({ sharedStepId: 6 })])).toEqual(
      new Set([5, 6]),
    );
  });
});

describe('toValues / toBody', () => {
  it('starts a new case in the given section with the default status', () => {
    const values = toValues(null, 11, 'draft');
    expect(values).toMatchObject({
      sectionId: '11',
      status: 'draft',
      caseType: 'Normal',
      priority: 'medium',
      estimate: '',
      template: 'text',
      steps: [],
      custom: {},
    });
    expect(toValues(null, null, 'ready').sectionId).toBe('');
  });

  it('copies an existing case and builds the request body', () => {
    const tc = makeCase({
      sectionId: null,
      template: 'steps',
      steps: [
        { kind: 'step', action: 'Press', expected: '' },
        { kind: 'shared', sharedStepId: 5, name: 'Log in', steps: [] },
      ],
      custom: { a: 'x' },
      estimateMinutes: 0,
      code: null,
      references: null,
    });
    const values = toValues(tc, 11, 'draft');
    expect(values).toMatchObject({ sectionId: '', estimate: '0', code: '', references: '' });
    values.steps.push(plainStep());
    expect(toBody(values)).toMatchObject({
      sectionId: null,
      estimateMinutes: 0,
      steps: [
        { kind: 'step', action: 'Press', expected: '' },
        { kind: 'shared', sharedStepId: 5 },
      ],
      custom: { a: 'x' },
    });
    expect(toBody(values, { keepBlankSteps: true }).steps).toHaveLength(3);
  });

  it('reads the estimate and drops untouched custom fields', () => {
    const values = { ...toValues(null, null, 'ready'), estimate: '90', custom: { a: 'x' } };
    (values.custom as Record<string, string | undefined>).b = undefined;
    expect(toBody(values)).toMatchObject({ estimateMinutes: 90, custom: { a: 'x' } });
    expect(toBody({ ...values, estimate: 'abc' }).estimateMinutes).toBeNull();
  });
});

describe('changedKeys', () => {
  const base = toBody(toValues(makeCase({ custom: { a: 'x' } }), null, 'ready'));

  it('finds changed fields and ignores blank-only differences', () => {
    expect(changedKeys(base, base)).toEqual([]);
    expect(changedKeys(base, { ...base, title: 'New', tags: ['smoke', 'wifi'] })).toEqual([
      'title',
      'tags',
    ]);
    expect(changedKeys({ ...base, remark: '' }, { ...base, remark: '  ' })).toEqual([]);
    expect(changedKeys(base, { ...base, custom: { a: 'x', b: ' ' } })).toEqual([]);
    expect(changedKeys(base, { ...base, custom: { b: 'y', a: 'x' } })).toEqual(['custom']);
    expect(changedKeys(base, { ...base, estimateMinutes: null })).toEqual(['estimateMinutes']);
  });

  it('knows the statuses people pick and the reviewable content', () => {
    expect(EDITABLE_STATUSES).toEqual(['draft', 'ready', 'deprecated']);
    expect(REVIEWABLE_KEYS).toContain('steps');
    expect(REVIEWABLE_KEYS).not.toContain('tags');
  });
});

describe('validateCaseForm', () => {
  const valid = { ...toValues(null, null, 'ready'), title: 'Fan' };

  it('accepts a complete form', () => {
    expect(validateCaseForm(valid)).toEqual({});
  });

  it('reports errors by form field', () => {
    expect(
      validateCaseForm({
        ...valid,
        title: ' ',
        estimate: '-1',
        tags: ['ok', 'x'.repeat(51)],
        steps: [plainStep(), plainStep('y'.repeat(10001))],
        custom: { notes: 'z'.repeat(20001) },
      }),
    ).toEqual({
      title: 'Required',
      estimate: 'Must be at least 0',
      tags: 'Use at most 50 characters',
      'steps.1.action': 'Use at most 10000 characters',
      'custom.notes': 'Use at most 20000 characters',
    });
  });
});

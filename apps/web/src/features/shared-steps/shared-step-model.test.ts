import { describe, expect, it } from '@jest/globals';
import { newUid, plainStep } from '@/features/cases/case-form-model';
import { makeSharedStep } from '@/features/cases/test-utils';
import {
  MAX_SHARED_STEPS,
  toSharedStepBody,
  toSharedStepValues,
  validateSharedStepForm,
} from './shared-step-model';

describe('shared step form model', () => {
  it('starts a new set with one empty step and copies an existing one', () => {
    expect(toSharedStepValues(null)).toMatchObject({
      name: '',
      description: '',
      steps: [{ kind: 'step', action: '', expected: '' }],
    });
    const values = toSharedStepValues(makeSharedStep({ description: null }));
    expect(values.description).toBe('');
    expect(values.steps.map((s) => s.kind === 'step' && s.action)).toEqual([
      'Open the app',
      'Sign in',
    ]);
    expect(toSharedStepValues(makeSharedStep({ steps: [] })).steps).toHaveLength(1);
    expect(MAX_SHARED_STEPS).toBe(100);
  });

  it('builds the body from plain steps only', () => {
    const shared = {
      uid: newUid(),
      kind: 'shared' as const,
      sharedStepId: 1,
      name: 'x',
      steps: [],
    };
    const values = {
      name: 'A',
      description: 'd',
      steps: [plainStep('a', 'b'), plainStep(), shared],
    };
    expect(toSharedStepBody(values)).toEqual({
      name: 'A',
      description: 'd',
      steps: [{ action: 'a', expected: 'b' }],
    });
    expect(toSharedStepBody(values, true).steps).toHaveLength(2);
  });

  it('requires a name and at least one written step', () => {
    expect(validateSharedStepForm({ name: 'A', description: '', steps: [plainStep('a')] })).toEqual(
      {},
    );
    expect(validateSharedStepForm({ name: ' ', description: '', steps: [plainStep()] })).toEqual({
      name: 'Required',
      steps: 'Add at least one step',
    });
    expect(validateSharedStepForm({ name: 'A', description: '', steps: [] })).toEqual({
      steps: 'Add at least one step',
    });
    expect(
      validateSharedStepForm({ name: 'A', description: '', steps: [plainStep('x'.repeat(10001))] }),
    ).toEqual({ 'steps.0.action': 'Use at most 10000 characters' });
  });
});

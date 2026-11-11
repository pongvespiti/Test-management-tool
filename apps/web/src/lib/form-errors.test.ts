import { describe, expect, it } from '@jest/globals';
import { z } from 'zod';
import { errorAt, flatResolver, schemaErrors, toFieldErrors } from '@/lib/form-errors';

const schema = z.object({
  name: z.string().trim().min(1),
  steps: z.array(z.object({ action: z.string().max(3) })).max(2),
});

describe('schemaErrors', () => {
  it('returns no errors for a valid body', () => {
    expect(schemaErrors(schema, { name: 'a', steps: [] })).toEqual({});
  });

  it('maps issues to paths with friendly messages (first message wins)', () => {
    expect(schemaErrors(schema, { name: ' ', steps: [{ action: 'long' }] })).toEqual({
      name: 'Required',
      'steps.0.action': 'Use at most 3 characters',
    });
    expect(
      schemaErrors(schema, {
        name: 'a',
        steps: [{ action: 'x' }, { action: 'y' }, { action: 'z' }],
      }),
    ).toEqual({ steps: 'Use at most 2 items' });
    expect(
      schemaErrors(
        z.string().refine(() => false, 'Bad'),
        'x',
        (p) => `form.${p}`,
      ),
    ).toEqual({ 'form.': 'Bad' });
    expect(
      schemaErrors(
        z.string().refine(() => false, 'Bad'),
        'x',
      ),
    ).toEqual({ root: 'Bad' });
  });
});

describe('toFieldErrors / errorAt', () => {
  it('nests list-level and item messages side by side in any order', () => {
    const a = toFieldErrors({ steps: 'Too many', 'steps.0.action': 'Long' });
    const b = toFieldErrors({ 'steps.0.action': 'Long', steps: 'Too many' });
    for (const errors of [a, b]) {
      expect(errorAt(errors, 'steps')).toBe('Too many');
      expect(errorAt(errors, 'steps.0.action')).toBe('Long');
    }
    expect(errorAt(a, 'steps.1.action')).toBeUndefined();
    expect(errorAt({ name: { type: 'x', message: '' } }, 'name')).toBeUndefined();
  });
});

describe('flatResolver', () => {
  it('passes valid values through and returns nested errors otherwise', async () => {
    const resolver = flatResolver<{ name: string }>((v): Record<string, string> =>
      v.name ? {} : { name: 'Required' },
    );
    const ok = await resolver({ name: 'a' }, undefined, {
      fields: {},
      shouldUseNativeValidation: false,
    });
    expect(ok).toEqual({ values: { name: 'a' }, errors: {} });
    const bad = await resolver({ name: '' }, undefined, {
      fields: {},
      shouldUseNativeValidation: false,
    });
    expect(bad).toEqual({
      values: {},
      errors: { name: { type: 'validate', message: 'Required' } },
    });
  });
});

import { describe, expect, it } from '@jest/globals';
import { z } from 'zod';
import { formResolver, fromId, generatePassword, safeNextPath, toId } from './forms';

async function errorsOf(
  schema: z.ZodType<unknown, Record<string, unknown>>,
  values: Record<string, unknown>,
) {
  const resolver = formResolver(schema);
  const result = await resolver(values, undefined, {
    fields: {},
    shouldUseNativeValidation: false,
  });
  return Object.fromEntries(
    Object.entries(result.errors).map(([k, v]) => [k, (v as { message?: string }).message]),
  );
}

describe('formResolver', () => {
  it('replaces developer-style Zod messages with short form messages', async () => {
    const schema = z.object({
      name: z.string().min(1),
      code: z.string().min(3),
      tags: z.array(z.string()).min(1),
      email: z.email(),
      count: z.number().max(5),
      kind: z.enum(['a', 'b']),
    });
    await expect(
      errorsOf(schema, { name: '', code: 'x', tags: [], email: 'nope', count: 9, kind: 'c' }),
    ).resolves.toEqual({
      name: 'Required',
      code: 'Use at least 3 characters',
      tags: 'Add at least one item',
      email: 'Enter a valid email address',
      count: 'Must be at most 5',
      kind: 'Choose one of the options',
    });
  });

  it('reports missing values as Required and keeps messages defined by the schema', async () => {
    const schema = z.object({
      title: z.string(),
      key: z.string().regex(/^[A-Z]+$/, 'Letters A–Z only'),
    });
    await expect(errorsOf(schema, { key: 'ab' })).resolves.toEqual({
      title: 'Required',
      key: 'Letters A–Z only',
    });
  });

  it('returns the parsed output on success', async () => {
    const schema = z.object({ n: z.coerce.number() });
    const result = await formResolver(schema)({ n: '4' }, undefined, {
      fields: {},
      shouldUseNativeValidation: false,
    });
    expect(result.values).toEqual({ n: 4 });
  });
});

describe('id helpers', () => {
  it('converts select values to ids and back', () => {
    expect(toId('12')).toBe(12);
    expect(toId('')).toBeNull();
    expect(toId('0')).toBeNull();
    expect(toId('1.5')).toBeNull();
    expect(toId(null)).toBeNull();
    expect(fromId(12)).toBe('12');
    expect(fromId(null)).toBe('');
  });
});

describe('safeNextPath', () => {
  it('allows only in-app paths', () => {
    expect(safeNextPath('/projects/3/cases?suite=1')).toBe('/projects/3/cases?suite=1');
    expect(safeNextPath('https://evil.example')).toBe('/');
    expect(safeNextPath('//evil.example')).toBe('/');
    expect(safeNextPath('/\\evil.example')).toBe('/');
    expect(safeNextPath(null, '/projects')).toBe('/projects');
  });
});

describe('generatePassword', () => {
  it('creates readable random passwords without ambiguous characters', () => {
    const pw = generatePassword(16);
    expect(pw).toHaveLength(16);
    expect(pw).toMatch(/^[A-HJ-NP-Za-km-z2-9]+$/);
    expect(generatePassword()).not.toBe(generatePassword());
  });
});

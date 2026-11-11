import { describe, expect, it } from '@jest/globals';
import { canonicalizeEnvironment, envDimensionsSchema, valuesFor, type EnvDimension } from '../src';

const dims = (): EnvDimension[] => [
  {
    label: 'Platform',
    parent: null,
    values: [
      { value: 'Android', parent: null },
      { value: 'iOS', parent: null },
    ],
  },
  { label: 'OS ver', parent: 'Platform', values: [{ value: '15', parent: 'Android' }] },
  { label: 'Unit model', parent: null, values: [] },
];

describe('canonicalizeEnvironment', () => {
  it('respells values and labels to the lists', () => {
    const out = canonicalizeEnvironment(
      [
        { label: 'platform', value: ' android ' },
        { label: 'OS Ver', value: '15' },
      ],
      dims(),
    );
    expect(out.entries).toEqual([
      { label: 'Platform', value: 'Android' },
      { label: 'OS ver', value: '15' },
    ]);
    expect(out.added).toBe(0);
    expect(out.changed).toBe(3);
  });

  it('adds new values under the parent value of the same environment', () => {
    const out = canonicalizeEnvironment(
      [
        // The child comes first: the parent is still handled first.
        { label: 'OS ver', value: '18' },
        { label: 'Platform', value: 'ios' },
      ],
      dims(),
    );
    expect(out.entries).toEqual([
      { label: 'OS ver', value: '18' },
      { label: 'Platform', value: 'iOS' },
    ]);
    expect(out.dimensions[1]!.values).toContainEqual({ value: '18', parent: 'iOS' });
    expect(out.added).toBe(1);
  });

  it('keeps the same spelling under another parent as another value', () => {
    const base = dims();
    base[1]!.values.push({ value: '15', parent: 'iOS' });
    const out = canonicalizeEnvironment(
      [
        { label: 'Platform', value: 'iOS' },
        { label: 'OS ver', value: '15' },
      ],
      base,
    );
    expect(out.added).toBe(0);
    expect(out.entries[1]!.value).toBe('15');
  });

  it('leaves unknown labels and blank values alone', () => {
    const out = canonicalizeEnvironment(
      [
        { label: 'SSID', value: ' Home ' },
        { label: 'Unit model', value: '  ' },
      ],
      dims(),
    );
    expect(out.entries).toEqual([
      { label: 'SSID', value: ' Home ' },
      { label: 'Unit model', value: '  ' },
    ]);
    expect(out.added).toBe(0);
  });
});

describe('valuesFor', () => {
  it('offers the values of the chosen parent only', () => {
    const base = dims();
    base[1]!.values.push({ value: '18', parent: 'iOS' });
    expect(valuesFor(base[1], 'android')).toEqual(['15']);
    expect(valuesFor(base[1], 'iOS')).toEqual(['18']);
    expect(valuesFor(base[1], null)).toEqual(['15', '18']);
    expect(valuesFor(undefined, null)).toEqual([]);
  });
});

describe('envDimensionsSchema', () => {
  const ok = { dimensions: dims() };
  it('accepts a set with one level of dependency', () => {
    expect(envDimensionsSchema.safeParse(ok).success).toBe(true);
  });

  it('rejects duplicate labels and unknown or chained parents', () => {
    expect(
      envDimensionsSchema.safeParse({
        dimensions: [...dims(), { label: 'platform', parent: null, values: [] }],
      }).success,
    ).toBe(false);
    expect(
      envDimensionsSchema.safeParse({
        dimensions: [{ label: 'A', parent: 'Missing', values: [] }],
      }).success,
    ).toBe(false);
    expect(
      envDimensionsSchema.safeParse({
        dimensions: [
          { label: 'A', parent: null, values: [] },
          { label: 'B', parent: 'A', values: [] },
          { label: 'C', parent: 'B', values: [] },
        ],
      }).success,
    ).toBe(false);
  });
});

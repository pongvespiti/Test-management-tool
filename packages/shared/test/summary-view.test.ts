import { describe, expect, it } from '@jest/globals';
import {
  filtersToParams,
  paramsToFilters,
  reportSummaryQuerySchema,
  savedViewInputSchema,
} from '../src';

describe('summary filters', () => {
  it('round-trips through the repeated f parameters', () => {
    const filters = { 'OS ver': ['15', '14'], Platform: ['Android'], 'FW version': [''] };
    const params = filtersToParams(filters);
    expect(params).toEqual(['FW version=', 'OS ver=15', 'OS ver=14', 'Platform=Android']);
    expect(paramsToFilters(params)).toEqual(filters);
  });

  it('splits at the first "=" and skips what has no key', () => {
    expect(paramsToFilters(['Router=A=B', '=x', 'noequals', 'Router=A=B'])).toEqual({
      Router: ['A=B'],
    });
  });
});

describe('summary schemas', () => {
  it('reads one f or many as a list', () => {
    expect(reportSummaryQuerySchema.parse({ f: 'Platform=iOS' }).f).toEqual(['Platform=iOS']);
    expect(reportSummaryQuerySchema.parse({}).f).toEqual([]);
    expect(reportSummaryQuerySchema.parse({ rows: '@topic', f: ['a=1', 'a=2'] })).toMatchObject({
      rows: '@topic',
      f: ['a=1', 'a=2'],
    });
  });

  it('needs a name for a saved view and fills the config', () => {
    expect(savedViewInputSchema.safeParse({ name: '  ', config: {} }).success).toBe(false);
    expect(savedViewInputSchema.parse({ name: ' Mine ', config: {} })).toEqual({
      name: 'Mine',
      shared: false,
      config: { rows: null, cols: null, filters: {} },
    });
  });
});

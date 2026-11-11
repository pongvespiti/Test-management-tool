import { describe, expect, it } from '@jest/globals';
import { escapeLike, paged, pageWindow } from './pagination.js';
import { routeIdSchema } from './params.js';

describe('pagination helpers', () => {
  it('computes skip/take for 1-based pages', () => {
    expect(pageWindow(1, 50)).toEqual({ skip: 0, take: 50 });
    expect(pageWindow(3, 20)).toEqual({ skip: 40, take: 20 });
  });

  it('wraps a page of items', () => {
    expect(paged(['a'], 11, 2, 10)).toEqual({ items: ['a'], total: 11, page: 2, pageSize: 10 });
  });

  it('escapes LIKE wildcards', () => {
    expect(escapeLike('100%_done\\')).toBe('100\\%\\_done\\\\');
    expect(escapeLike('plain')).toBe('plain');
  });
});

describe('routeIdSchema', () => {
  it('accepts positive 32-bit integers from path strings', () => {
    expect(routeIdSchema.parse('42')).toBe(42);
    expect(routeIdSchema.parse('2147483647')).toBe(2_147_483_647);
  });

  it('rejects anything that cannot be an id', () => {
    for (const bad of ['0', '-1', '1.5', 'abc', '2147483648', '']) {
      expect(routeIdSchema.safeParse(bad).success).toBe(false);
    }
  });
});

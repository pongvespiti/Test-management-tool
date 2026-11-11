import { describe, expect, it } from '@jest/globals';
import { makeProject } from '@/test/render';
import { startPath } from './root-redirect';
import { parseProjectId } from './project-scope';

describe('startPath', () => {
  const a = makeProject({ id: 1 });
  const b = makeProject({ id: 2 });
  const archived = makeProject({ id: 3, isArchived: true });

  it('opens the last visited project when it is still available', () => {
    expect(startPath([a, b], 2)).toBe('/projects/2');
  });

  it('ignores a last project that is archived or gone', () => {
    expect(startPath([a, b, archived], 3)).toBe('/projects');
    expect(startPath([a, b], 99)).toBe('/projects');
  });

  it('opens the only active project directly', () => {
    expect(startPath([a, archived], null)).toBe('/projects/1');
    expect(startPath([], null)).toBe('/projects');
  });
});

describe('parseProjectId', () => {
  it('distinguishes absent, valid and malformed ids', () => {
    expect(parseProjectId(undefined)).toBeNull();
    expect(parseProjectId('7')).toBe(7);
    expect(parseProjectId(['8'])).toBe(8);
    expect(parseProjectId('abc')).toBeNaN();
    expect(parseProjectId('0')).toBeNaN();
  });
});

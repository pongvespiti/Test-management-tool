import { describe, expect, it } from '@jest/globals';
import { DEFAULT_ENV_DIMENSIONS, type EnvDimension } from '@tmt/shared';
import {
  addDimension,
  addValue,
  parentChoices,
  removeDimension,
  removeValue,
  setParent,
} from './env-lists-model';

const base = (): EnvDimension[] => structuredClone([...DEFAULT_ENV_DIMENSIONS]);

describe('environment list edits', () => {
  it('adds a list once, ignoring spelling and blanks', () => {
    const dims = addDimension(base(), 'Region');
    expect(dims.map((d) => d.label)).toContain('Region');
    expect(addDimension(dims, ' region ')).toBe(dims);
    expect(addDimension(dims, '  ')).toBe(dims);
  });

  it('adds a value under a parent value without duplicates', () => {
    let dims = addValue(base(), 'OS ver', '15', 'Android');
    dims = addValue(dims, 'OS ver', ' 15 ', 'android');
    dims = addValue(dims, 'OS ver', '15', 'iOS');
    const os = dims.find((d) => d.label === 'OS ver')!;
    expect(os.values).toEqual([
      { value: '15', parent: 'Android' },
      { value: '15', parent: 'iOS' },
    ]);
  });

  it('removes a parent value together with the values listed under it', () => {
    let dims = addValue(base(), 'OS ver', '15', 'Android');
    dims = addValue(dims, 'OS ver', '18', 'iOS');
    dims = removeValue(dims, 'Platform', 'iOS', null);
    expect(dims.find((d) => d.label === 'OS ver')!.values).toEqual([
      { value: '15', parent: 'Android' },
    ]);
  });

  it('frees dependent lists when their parent list is removed', () => {
    let dims = addValue(base(), 'OS ver', '15', 'Android');
    dims = removeDimension(dims, 'Platform');
    const os = dims.find((d) => d.label === 'OS ver')!;
    expect(os.parent).toBeNull();
    expect(os.values).toEqual([{ value: '15', parent: null }]);
  });

  it('offers only parentless lists as parents, and none for a list others depend on', () => {
    const dims = base();
    expect(parentChoices(dims, 'Unit model')).toEqual([
      'Platform',
      'App version',
      'FW version',
      'ADP&FW',
      'Router',
    ]);
    expect(parentChoices(dims, 'Platform')).toEqual([]);
  });

  it('changing the parent clears the parent values of the list', () => {
    const dims = setParent(addValue(base(), 'OS ver', '15', 'Android'), 'OS ver', null);
    expect(dims.find((d) => d.label === 'OS ver')!.values).toEqual([{ value: '15', parent: null }]);
  });
});

import { describe, expect, it } from '@jest/globals';
import { citationIndex, keyOf, viaOfCases } from './requirement-links.js';

describe('citationIndex', () => {
  it('indexes cases by canonical reference, whatever the spelling', () => {
    const index = citationIndex([
      { id: 1, references: 'req 1, Sec 3' },
      { id: 2, references: 'REQ_1' },
      { id: 3, references: null },
    ]);
    expect([...(index.get(keyOf('REQ-1')) ?? [])]).toEqual([1, 2]);
    expect([...(index.get(keyOf('SEC-3')) ?? index.get(keyOf('Sec 3')) ?? [])]).toEqual([1]);
    expect(index.size).toBe(2);
  });
});

describe('viaOfCases', () => {
  it('tells linked, cited and both apart', () => {
    const via = viaOfCases(new Set([1, 2]), new Set([2, 3]));
    expect([...via]).toEqual([
      [1, 'linked'],
      [2, 'both'],
      [3, 'refs'],
    ]);
  });
  it('leaves out cases that no longer count', () => {
    const via = viaOfCases(new Set([1, 2]), new Set([2, 3]), new Set([2]));
    expect([...via]).toEqual([[2, 'both']]);
  });
  it('is empty without links or citations', () => {
    expect(viaOfCases(undefined, undefined).size).toBe(0);
  });
});

import { describe, expect, it } from '@jest/globals';
import { SUMMARY_TOPIC, emptyCounts, type StatusCounts } from '@tmt/shared';
import { compareValues, summaryOf, valueOfRun, type SummaryRun } from './summary.js';

const counts = (c: Partial<StatusCounts>): StatusCounts => ({ ...emptyCounts(), ...c });

function run(
  id: number,
  env: Record<string, string>,
  c: Partial<StatusCounts>,
  topic: string | null = 'Unit operation test',
): SummaryRun {
  return {
    id,
    planId: 1,
    code: `R${id}`,
    environment: Object.entries(env).map(([label, value]) => ({ label, value })),
    topic,
    release: 'Step 1',
    build: null,
    counts: counts(c),
  };
}

const RUNS = [
  run(1, { Platform: 'Android', 'OS ver': '15', 'Unit model': 'A' }, { ok: 8, ng: 2 }),
  run(2, { Platform: 'Android', 'OS ver': '14', 'Unit model': 'B' }, { ok: 5, blocked: 1 }),
  run(3, { Platform: 'iOS', 'OS ver': '18', 'Unit model': 'A' }, { ok: 6, untested: 4 }, 'Adapter'),
];
const ORDER = ['Platform', 'OS ver', 'Unit model'];

describe('valueOfRun', () => {
  it('reads labels loosely and the built-ins', () => {
    expect(valueOfRun(RUNS[0]!, ' platform ')).toBe('Android');
    expect(valueOfRun(RUNS[0]!, 'FW version')).toBe('');
    expect(valueOfRun(RUNS[2]!, SUMMARY_TOPIC)).toBe('Adapter');
  });
});

describe('compareValues', () => {
  it('sorts numbers naturally and the empty value last', () => {
    expect(['10', '2', '', '15.1', '15'].sort(compareValues)).toEqual([
      '2',
      '10',
      '15',
      '15.1',
      '',
    ]);
  });
});

describe('summaryOf', () => {
  it('sums everything when nothing is chosen', () => {
    const s = summaryOf(RUNS, { rows: null, cols: null, filters: {}, labelOrder: ORDER });
    expect(s.totals.runs).toBe(3);
    expect(s.totals.counts.ok).toBe(19);
    expect(s.cells).toHaveLength(1);
    expect(s.rowValues).toEqual(['']);
  });

  it('groups by a row and a column dimension', () => {
    const s = summaryOf(RUNS, {
      rows: 'Platform',
      cols: 'Unit model',
      filters: {},
      labelOrder: ORDER,
    });
    expect(s.rowValues).toEqual(['Android', 'iOS']);
    expect(s.colValues).toEqual(['A', 'B']);
    const androidA = s.cells.find((c) => c.row === 'Android' && c.col === 'A')!;
    expect(androidA.counts.ng).toBe(2);
    expect(androidA.runs.map((r) => r.code)).toEqual(['R1']);
    expect(s.cells.find((c) => c.row === 'iOS' && c.col === 'B')).toBeUndefined();
  });

  it('filters (any of the values within one dimension, all dimensions together)', () => {
    const s = summaryOf(RUNS, {
      rows: 'OS ver',
      cols: null,
      filters: { Platform: ['Android'], 'Unit model': ['A', 'B'] },
      labelOrder: ORDER,
    });
    expect(s.totals.runs).toBe(2);
    expect(s.rowValues).toEqual(['14', '15']);
    expect(s.scopeRuns).toBe(3);
  });

  it('narrows the options of other dimensions but not of the filtered one', () => {
    const s = summaryOf(RUNS, {
      rows: null,
      cols: null,
      filters: { Platform: ['Android'] },
      labelOrder: ORDER,
    });
    const platform = s.dimensions.find((d) => d.key === 'Platform')!;
    expect(platform.options.map((o) => o.value)).toEqual(['Android', 'iOS']);
    const os = s.dimensions.find((d) => d.key === 'OS ver')!;
    expect(os.options.map((o) => o.value)).toEqual(['14', '15']);
  });

  it('keeps a chosen value that no run has, so it can be unticked', () => {
    const s = summaryOf(RUNS, {
      rows: null,
      cols: null,
      filters: { Platform: ['Windows'] },
      labelOrder: ORDER,
    });
    expect(s.totals.runs).toBe(0);
    expect(s.dimensions.find((d) => d.key === 'Platform')!.options).toContainEqual({
      value: 'Windows',
      runs: 0,
    });
  });

  it('groups runs without the value under the empty one and offers labels the lists lack', () => {
    const runs = [...RUNS, run(4, { Router: 'R-1' }, { ok: 1 })];
    const s = summaryOf(runs, { rows: 'Platform', cols: null, filters: {}, labelOrder: ORDER });
    expect(s.rowValues).toEqual(['Android', 'iOS', '']);
    expect(s.dimensions.map((d) => d.key)).toContain('Router');
    expect(s.dimensions.map((d) => d.key)).toContain(SUMMARY_TOPIC);
  });

  it('does not offer a dimension that no run carries', () => {
    const s = summaryOf(RUNS, {
      rows: null,
      cols: null,
      filters: {},
      labelOrder: [...ORDER, 'FW version'],
    });
    expect(s.dimensions.map((d) => d.key)).not.toContain('FW version');
    expect(s.dimensions.map((d) => d.key)).not.toContain('@build');
  });
});

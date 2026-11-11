import { describe, expect, it } from '@jest/globals';
import { counts } from '@/features/plans/test-fixtures';
import { makeSavedView, makeSummary } from './test-fixtures';
import {
  activeSavedView,
  cleanFilters,
  filterCount,
  rateText,
  readView,
  sameView,
  summaryCsv,
  valueLabel,
  writeView,
} from './summary-format';

describe('summary view in the URL', () => {
  it('reads rows, columns and filters and writes them back, keeping other params', () => {
    const params = new URLSearchParams(
      'tab=summary&release=5&rows=Platform&cols=%40topic&f=Platform%3DAndroid&f=Platform%3DiOS&f=FW%20version%3D',
    );
    const view = readView(params);
    expect(view).toEqual({
      rows: 'Platform',
      cols: '@topic',
      filters: { Platform: ['Android', 'iOS'], 'FW version': [''] },
    });
    const next = writeView(params, {
      rows: null,
      cols: 'Unit model',
      filters: { Platform: ['iOS'] },
    });
    expect(next.get('tab')).toBe('summary');
    expect(next.get('release')).toBe('5');
    expect(next.has('rows')).toBe(false);
    expect(next.get('cols')).toBe('Unit model');
    expect(next.getAll('f')).toEqual(['Platform=iOS']);
  });

  it('counts only filters that have a value', () => {
    const view = { rows: null, cols: null, filters: { Platform: [], 'Unit model': ['A'] } };
    expect(cleanFilters(view.filters)).toEqual({ 'Unit model': ['A'] });
    expect(filterCount(view)).toBe(1);
  });
});

describe('saved views', () => {
  const view = { rows: 'Platform', cols: 'Unit model', filters: { Platform: ['iOS', 'Android'] } };

  it('matches a saved view that is exactly on screen, whatever the order of values', () => {
    expect(
      sameView(view, {
        rows: 'Platform',
        cols: 'Unit model',
        filters: { Platform: ['Android', 'iOS'] },
      }),
    ).toBe(true);
    expect(sameView(view, { ...view, rows: null })).toBe(false);
    expect(sameView(view, { ...view, filters: { Platform: ['Android'] } })).toBe(false);
    expect(sameView(view, { ...view, filters: {} })).toBe(false);
  });

  it('finds the active view in a list', () => {
    const a = makeSavedView({ id: 1, config: { rows: null, cols: null, filters: {} } });
    const b = makeSavedView({ id: 2, config: view });
    expect(activeSavedView([a, b], view)?.id).toBe(2);
    expect(activeSavedView([a], view)).toBeNull();
  });
});

describe('labels', () => {
  it('names empty values and formats rates', () => {
    expect(valueLabel('')).toBe('(not set)');
    expect(valueLabel('15')).toBe('15');
    expect(rateText(null)).toBe('—');
    expect(rateText(0.8571)).toBe('86%');
  });
});

describe('summaryCsv', () => {
  it('writes one row per value with every result status', () => {
    const data = makeSummary({
      rows: 'Platform',
      rowValues: ['Android', ''],
      cells: [
        {
          row: 'Android',
          col: '',
          counts: counts({ ok: 3, ng: 1 }),
          runs: [{ id: 1, planId: 7, code: 'R1' }],
        },
        { row: '', col: '', counts: counts({ ok: 1 }), runs: [{ id: 2, planId: 7, code: 'R2' }] },
      ],
    });
    const lines = summaryCsv(data).trim().split('\n');
    expect(lines[0]).toBe('Platform,Runs,Pass rate,Untested,OK,NG,OK w/ cond.,Blocked,N/T,N/A');
    expect(lines[1]!.startsWith('Android,1,75%,')).toBe(true);
    expect(lines[2]!.startsWith('(not set),1,100%,')).toBe(true);
  });

  it('writes runs and pass rate per column value for a matrix', () => {
    const data = makeSummary({
      rows: 'Platform',
      cols: 'Unit model',
      rowValues: ['Android'],
      colValues: ['A', 'B'],
      cells: [
        {
          row: 'Android',
          col: 'A',
          counts: counts({ ok: 1, ng: 1 }),
          runs: [{ id: 1, planId: 7, code: 'R1' }],
        },
      ],
    });
    expect(summaryCsv(data).trim().split('\n')).toEqual([
      'Platform \\ Unit model,A runs,A pass rate,B runs,B pass rate',
      'Android,1,50%,,',
    ]);
  });
});

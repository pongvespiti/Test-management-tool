import { describe, expect, it } from '@jest/globals';
import { Grid } from '@tmt/excel';
import { planRequirementImport, suggestField, suggestFields } from './requirement-import.js';

const grid = (rows: string[][]) => Grid.fromRows(rows);
const mapping = { key: 1, title: 2, description: 3, sourceRef: 4 };

describe('suggestField', () => {
  it('recognises the usual headers', () => {
    expect(suggestField('Requirement ID')).toBe('key');
    expect(suggestField('Jira Key')).toBe('key');
    expect(suggestField('Summary')).toBe('title');
    expect(suggestField('Description')).toBe('description');
    expect(suggestField('Source')).toBe('sourceRef');
    expect(suggestField('Req ID')).toBe('key');
    expect(suggestField('Requirement')).toBe('title');
    expect(suggestField('Source doc')).toBe('sourceRef');
    expect(suggestField('Priority')).toBeNull();
    expect(suggestField('')).toBeNull();
  });
  it('gives each field to one column only', () => {
    expect(suggestFields([{ header: 'ID' }, { header: 'Key' }, { header: 'Title' }])).toEqual([
      'key',
      null,
      'title',
    ]);
  });
});

describe('planRequirementImport', () => {
  const header = ['ID', 'Title', 'Description', 'Source'];
  const run = (
    rows: string[][],
    onExisting: 'update' | 'skip' = 'update',
    existing: string[] = [],
  ) =>
    planRequirementImport(
      grid([header, ...rows]),
      { headerRow: 1, mapping, onExisting },
      new Set(existing),
    ).rows;

  it('creates new keys in canonical spelling and keeps texts', () => {
    const [r] = run([['req 12', ' Fan  speed ', 'Line 1\r\nLine 2', 'Spec v3 §4']]);
    expect(r).toMatchObject({
      row: 2,
      key: 'REQ-12',
      title: 'Fan speed',
      description: 'Line 1\nLine 2',
      sourceRef: 'Spec v3 §4',
      action: 'create',
    });
  });

  it('ignores blank rows and flags missing id or title', () => {
    const rows = run([
      ['', '', '', ''],
      ['REQ-1', '', '', ''],
      ['', 'No id', '', ''],
    ]);
    expect(rows.map((r) => [r.row, r.action, r.reason])).toEqual([
      [3, 'invalid', 'No title'],
      [4, 'invalid', 'No requirement ID'],
    ]);
  });

  it('skips a key repeated in the file', () => {
    const rows = run([
      ['REQ-1', 'A', '', ''],
      ['req_1', 'B', '', ''],
    ]);
    expect(rows.map((r) => r.action)).toEqual(['create', 'skip']);
    expect(rows[1]!.reason).toBe('Same ID as row 2');
  });

  it('updates or skips keys that exist, as chosen', () => {
    expect(run([['REQ-1', 'A', '', '']], 'update', ['req-1'])[0]!.action).toBe('update');
    expect(run([['REQ-1', 'A', '', '']], 'skip', ['req-1'])[0]!.action).toBe('skip');
  });

  it('rejects values over the limits', () => {
    const rows = run([
      ['K'.repeat(101), 'A', '', ''],
      ['REQ-2', 'T'.repeat(501), '', ''],
    ]);
    expect(rows.map((r) => r.action)).toEqual(['invalid', 'invalid']);
  });
});

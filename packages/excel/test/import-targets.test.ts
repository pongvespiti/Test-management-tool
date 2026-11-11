/**
 * W1 — import engine v1.1 targets: priority / tags / estimate / references (synonyms, parsing,
 * warnings). Pure unit tests (no database).
 */
import { describe, expect, it } from '@jest/globals';
import {
  analyzeSheet,
  Grid,
  parseEstimate,
  parseGrid,
  parsePriority,
  parseTags,
  readUpload,
  targetFor,
  type ParseOptions,
} from '../src/import';

describe('parsePriority', () => {
  it('reads names, P1–P4 and 1–4 case-insensitively', () => {
    const cases: [string, string | null][] = [
      ['Critical', 'critical'],
      [' HIGH ', 'high'],
      ['medium', 'medium'],
      ['Low', 'low'],
      ['P1', 'critical'],
      ['p2', 'high'],
      ['3', 'medium'],
      ['P 4', 'low'],
      ['4 - Critical', 'critical'],
      ['Highest', 'critical'],
      ['Lowest', 'low'],
      ['Normal', 'medium'],
      ['P5', null],
      ['10', null],
      ['1.5', null],
      ['soon', null],
      ['', null],
    ];
    expect(cases.map(([raw]) => [raw, parsePriority(raw)])).toEqual(cases);
  });
});

describe('parseTags', () => {
  it('splits on comma, semicolon and line breaks; trims and dedupes case-insensitively', () => {
    expect(parseTags('smoke, UI; Regression\nSMOKE\r\n  wifi   adapter ')).toEqual([
      'smoke',
      'UI',
      'Regression',
      'wifi adapter',
    ]);
    expect(parseTags(' , ;\n')).toEqual([]);
    expect(parseTags(null)).toEqual([]);
  });
});

describe('parseEstimate', () => {
  it('reads minutes, units, h:mm and Excel time cells', () => {
    const cases: [string, number | null][] = [
      ['90', 90],
      ['12.4', 12],
      ['90m', 90],
      ['90 min', 90],
      ['45 minutes', 45],
      ['1h 30m', 90],
      ['1h30m', 90],
      ['1.5h', 90],
      ['2 hours', 120],
      ['1 h and 15 min', 75],
      ['1:30', 90],
      ['0:45', 45],
      ['1:30:00', 90],
      ['1899-12-30 01:30', 90],
      ['1899-12-31 02:00', 1560],
      ['', null],
      ['abc', null],
      ['1 day', null],
      ['-5', null],
      ['200000', null],
      ['2026-10-27 09:00', null],
    ];
    expect(cases.map(([raw]) => [raw, parseEstimate(raw)])).toEqual(cases);
  });
});

describe('header synonyms', () => {
  it('maps the v1.1 headers', () => {
    const headers: [string, string][] = [
      ['Priority', 'priority'],
      ['Prio', 'priority'],
      ['Tags', 'tags'],
      ['Labels', 'tags'],
      ['Estimate', 'estimate'],
      ['Est.', 'estimate'],
      ['Estimate (min)', 'estimate'],
      ['Duration (min)', 'estimate'],
      ['Reference(s)', 'references'],
      ['References', 'references'],
      ['Requirement', 'references'],
      ['Req ID', 'references'],
      ['Jira', 'references'],
      ['Story', 'references'],
    ];
    expect(headers.map(([h]) => [h, targetFor('generic', h)])).toEqual(headers);
  });

  it('suggests each new target once in an analysis', async () => {
    const csv = [
      'Title,Prio,Labels,Est.,Requirement,Priority',
      'Login,P1,smoke,15,REQ-1,High',
    ].join('\n');
    const wb = await readUpload(Buffer.from(csv), 'cases.csv');
    const a = analyzeSheet(wb);
    expect(a.columns.map((c) => [c.header, c.suggested.target])).toEqual([
      ['Title', 'title'],
      ['Prio', 'priority'],
      ['Labels', 'tags'],
      ['Est.', 'estimate'],
      ['Requirement', 'references'],
      ['Priority', 'new_custom'],
    ]);
  });
});

describe('parseGrid with the v1.1 targets', () => {
  const opts = (columns: ParseOptions['columns']): ParseOptions => ({
    sheet: 'S',
    headerRow: 1,
    columns,
    fieldDefs: [],
    onDuplicateInFile: 'renumber',
  });
  const cols: ParseOptions['columns'] = [
    { col: 1, target: 'section' },
    { col: 2, target: 'title' },
    { col: 3, target: 'priority' },
    { col: 4, target: 'tags' },
    { col: 5, target: 'estimate' },
    { col: 6, target: 'references' },
    { col: 7, target: 'references' },
    { col: 8, target: 'tags' },
  ];

  it('parses the values, joins multiple columns and warns on unknown values', () => {
    const long = 'x'.repeat(60);
    const many = Array.from({ length: 35 }, (_, i) => `t${i}`).join(',');
    const g = Grid.fromRows([
      ['Section', 'Title', 'Prio', 'Tags', 'Est', 'Ref', 'Jira', 'Labels'],
      ['Login', 'A', 'P2', 'smoke; UI', '1h 30m', 'REQ-1', 'ACS-7', 'ui, nightly'],
      ['', 'B', 'urgent-ish', '', 'soon', '', '', ''],
      ['', 'C', '', `${long},ok`, '', '', '', ''],
      ['', 'D', 'low', many, '15', '', '', ''],
      ['Group only', '', '', '', '', '', '', ''],
      ['', 'E', '', '', '', '', '', ''],
    ]);
    const p = parseGrid(g, opts(cols));
    expect(
      p.cases.map((c) => [c.title, c.priority, c.tags.length, c.estimateMinutes, c.references]),
    ).toEqual([
      ['A', 'high', 3, 90, 'REQ-1, ACS-7'],
      ['B', 'critical', 0, null, null],
      ['C', 'medium', 2, null, null],
      ['D', 'low', 30, 15, null],
      ['E', 'medium', 0, null, null],
    ]);
    expect(p.cases[0]!.tags).toEqual(['smoke', 'UI', 'nightly']);
    expect(p.cases[2]!.tags).toEqual(['x'.repeat(50), 'ok']);
    expect(p.cases[4]!.sectionPath).toEqual(['Group only']);
    const messages = p.warnings.map((w) => `${w.kind}:${w.rows.join('/')}:${w.message}`);
    expect(messages).toEqual([
      'section_filled_down:3/4/5/7:Empty section cell — the case was put in the section above',
      'unknown_estimate:3:Unknown estimate “soon” — left empty (use minutes, 1h 30m or 1:30)',
      'truncated:4:Tags longer than 50 characters were cut',
      'truncated:5:Only the first 30 tags of a case are kept',
    ]);
  });

  it('warns about an unknown priority and keeps rows with values but no title as continuation-free', () => {
    const g = Grid.fromRows([
      ['Title', 'Priority', 'Tags'],
      ['A', 'Someday', ''],
      ['', 'High', 'orphan'],
    ]);
    const p = parseGrid(
      g,
      opts([
        { col: 1, target: 'title' },
        { col: 2, target: 'priority' },
        { col: 3, target: 'tags' },
      ]),
    );
    expect(p.cases).toHaveLength(1);
    expect(p.cases[0]!.priority).toBe('medium');
    expect(p.warnings).toEqual([
      {
        kind: 'unknown_priority',
        message: 'Unknown priority “Someday” — set to Medium',
        count: 1,
        rows: [2],
      },
    ]);
  });
});

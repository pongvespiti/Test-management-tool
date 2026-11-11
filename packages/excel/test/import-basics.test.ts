import JSZip from 'jszip';
import { describe, expect, it } from '@jest/globals';
import {
  assertSafeZip,
  cellText,
  columnLetter,
  columnNumber,
  detectDelimiter,
  formatNumber,
  Grid,
  ImportFormatError,
  parseCsv,
  parseGrid,
  parseRange,
  readUpload,
  type ParseOptions,
} from '../src/import';

describe('cellText', () => {
  it('joins rich text and reads formula results and hyperlinks', () => {
    expect(cellText({ richText: [{ text: 'App ' }, { text: 'result' }] })).toBe('App result');
    expect(cellText({ formula: 'A1+1', result: 3 })).toBe('3');
    expect(cellText({ sharedFormula: 'B2', result: 'OK' })).toBe('OK');
    expect(cellText({ text: 'Spec', hyperlink: 'http://example.test' })).toBe('Spec');
    expect(cellText({ error: '#N/A' })).toBe('#N/A');
    expect(cellText(true)).toBe('TRUE');
    expect(cellText(null)).toBe('');
  });

  it('formats numbers without float noise and respects fixed/percent formats', () => {
    expect(formatNumber(0.1 + 0.2)).toBe('0.3');
    expect(formatNumber(18.5)).toBe('18.5');
    expect(formatNumber(1, '0.0')).toBe('1.0');
    expect(formatNumber(2, '#,##0.00')).toBe('2.00');
    expect(formatNumber(0.25, '0%')).toBe('25%');
    expect(formatNumber(1000001)).toBe('1000001');
  });

  it('writes dates as ISO dates, with time only when the format shows it', () => {
    const d = new Date(Date.UTC(2026, 8, 25, 13, 45));
    expect(cellText(d, 'mm-dd-yy')).toBe('2026-09-25');
    expect(cellText(d, 'yyyy-mm-dd hh:mm')).toBe('2026-09-25 13:45');
  });

  it('turns CRLF into LF', () => {
    expect(cellText('a\r\nb\rc')).toBe('a\nb\nc');
  });
});

describe('parseCsv', () => {
  it('handles BOM, quotes, escaped quotes, embedded newlines and CRLF', () => {
    const rows = parseCsv('﻿a,b,c\r\n1,"x, y","say ""hi""\r\nthere"\r\n\r\n');
    expect(rows).toEqual([
      ['a', 'b', 'c'],
      ['1', 'x, y', 'say "hi"\r\nthere'],
    ]);
  });

  it('detects semicolon and tab delimiters', () => {
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';');
    expect(detectDelimiter('a\tb\tc')).toBe('\t');
    expect(detectDelimiter('"a;b",c,d')).toBe(',');
    expect(parseCsv('a;b\n1;2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('keeps a last line without newline', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('Grid', () => {
  it('resolves merged cells to the master value and reports spans', () => {
    const g = Grid.fromRows(
      [
        ['Cat', 'x'],
        ['', 'y'],
      ],
      [parseRange('A1:A2')],
    );
    expect(g.text(2, 1)).toBe('Cat');
    expect(g.ownText(2, 1)).toBe('');
    expect(g.mergeAt(2, 1)).toEqual({
      top: 1,
      left: 1,
      bottom: 2,
      right: 1,
      rowSpan: 2,
      colSpan: 1,
      isMaster: false,
    });
    expect(g.mergeAt(1, 1)!.isMaster).toBe(true);
    expect(g.mergeAt(1, 2)).toBeNull();
  });

  it('converts column letters', () => {
    expect(columnLetter(1)).toBe('A');
    expect(columnLetter(28)).toBe('AB');
    expect(columnNumber('AB')).toBe(28);
    expect(parseRange('$I$30:K30')).toEqual({ top: 30, left: 9, bottom: 30, right: 11 });
  });
});

describe('readUpload', () => {
  it('rejects old .xls and unknown file types', async () => {
    await expect(readUpload(Buffer.from('x'), 'old.xls')).rejects.toMatchObject({
      code: 'UNSUPPORTED_FILE_TYPE',
    });
    await expect(readUpload(Buffer.from('%PDF'), 'spec.pdf')).rejects.toBeInstanceOf(
      ImportFormatError,
    );
  });

  it('rejects files that are not workbooks', async () => {
    await expect(readUpload(Buffer.from('not a zip'), 'cases.xlsx')).rejects.toMatchObject({
      code: 'CORRUPT_FILE',
    });
    const zip = new JSZip();
    zip.file('hello.txt', 'not a workbook');
    const buf = await zip.generateAsync({ type: 'nodebuffer' });
    await expect(readUpload(buf, 'cases.xlsx')).rejects.toMatchObject({ code: 'CORRUPT_FILE' });
  });

  it('decodes Windows-874 (Thai) CSV files', async () => {
    // "ทดสอบ" in Windows-874 is 0xB7 0xB4 0xCA 0xCD 0xBA.
    const thai = Buffer.from([0xb7, 0xb4, 0xca, 0xcd, 0xba]);
    const buf = Buffer.concat([Buffer.from('Title,Steps\n'), thai, Buffer.from(',step 1\n')]);
    const wb = await readUpload(buf, 'thai.csv');
    expect(wb.grid('thai').text(2, 1)).toBe('ทดสอบ');
  });
});

describe('assertSafeZip', () => {
  it('rejects archives whose declared size or entry count is too large', async () => {
    const zip = new JSZip();
    zip.file('a.txt', 'x'.repeat(10_000));
    zip.file('b.txt', 'y');
    const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    expect(() => assertSafeZip(buf)).not.toThrow();
    expect(() => assertSafeZip(buf, { maxTotalUncompressed: 5_000, maxEntries: 10 })).toThrow(
      /too large/,
    );
    expect(() => assertSafeZip(buf, { maxTotalUncompressed: 1e9, maxEntries: 1 })).toThrow(
      /too many parts/,
    );
  });
});

describe('parseGrid row rules', () => {
  const opts = (
    columns: ParseOptions['columns'],
    extra: Partial<ParseOptions> = {},
  ): ParseOptions => ({
    sheet: 'S',
    headerRow: 1,
    columns,
    fieldDefs: [],
    onDuplicateInFile: 'renumber',
    ...extra,
  });
  const cols: ParseOptions['columns'] = [
    { col: 1, target: 'section' },
    { col: 2, target: 'code' },
    { col: 3, target: 'title' },
    { col: 4, target: 'type' },
    { col: 5, target: 'procedure' },
    { col: 6, target: 'expected' },
  ];

  it('appends continuation rows, uses codes as missing titles, warns on unknown types', () => {
    const g = Grid.fromRows([
      ['Section', 'ID', 'Title', 'Type', 'Steps', 'Expected'],
      ['Login', 'TC-1', 'Login ok', 'Normal', '1. Open', 'Home'],
      ['', '', '', '', '2. Tap login', 'Greeting'],
      ['', 'TC-2', '', 'Smoke', 'x', 'y'],
      ['', 'tc-1', 'Again', 'ABNORMAL', 'x', 'y'],
    ]);
    const p = parseGrid(g, opts(cols));
    expect(p.cases).toHaveLength(3);
    expect(p.cases[0]).toMatchObject({
      procedure: '1. Open\n2. Tap login',
      expected: 'Home\nGreeting',
    });
    expect(p.cases[1]).toMatchObject({
      code: 'TC-2',
      title: 'TC-2',
      caseType: 'Normal',
      sectionPath: ['Login'],
    });
    expect(p.cases[2]).toMatchObject({ code: 'tc-1-2', caseType: 'Abnormal' });
    const kinds = p.warnings.map((w) => `${w.kind}:${w.count}`);
    expect(kinds).toEqual([
      'continuation_row:1',
      'section_filled_down:2',
      'empty_title:1',
      'unknown_type:1',
      'duplicate_code_in_file:1',
    ]);
  });

  it('treats a row holding only a section value as a section header', () => {
    const g = Grid.fromRows([
      ['Section', 'ID', 'Title'],
      ['Group A', '', ''],
      ['', '1', 'First'],
      ['', '2', 'Second'],
    ]);
    const p = parseGrid(g, opts(cols.slice(0, 3)));
    expect(p.cases.map((c) => c.sectionPath)).toEqual([['Group A'], ['Group A']]);
  });

  it('opens sections from full-width merged rows', () => {
    const g = Grid.fromRows(
      [
        ['ID', 'Title', 'Steps', 'Expected'],
        ['Normal Case'],
        ['1', 'A', 's', 'e'],
        ['Abnormal Case'],
        ['2', 'B', 's', 'e'],
      ],
      [parseRange('A2:D2'), parseRange('A4:D4')],
    );
    const p = parseGrid(
      g,
      opts([
        { col: 1, target: 'code' },
        { col: 2, target: 'title' },
        { col: 3, target: 'procedure' },
        { col: 4, target: 'expected' },
      ]),
    );
    expect(p.cases.map((c) => [c.code, c.sectionPath.join('/')])).toEqual([
      ['1', 'Normal Case'],
      ['2', 'Abnormal Case'],
    ]);
  });

  it('cuts over-long values and reports it', () => {
    const g = Grid.fromRows([
      ['ID', 'Title'],
      ['1', 'x'.repeat(600)],
    ]);
    const p = parseGrid(
      g,
      opts([
        { col: 1, target: 'code' },
        { col: 2, target: 'title' },
      ]),
    );
    expect(p.cases[0]!.title).toHaveLength(500);
    expect(p.warnings[0]).toMatchObject({ kind: 'truncated', count: 1, rows: [2] });
  });

  it('creates unique keys for new custom fields and reuses fields with the same label', () => {
    const g = Grid.fromRows([
      ['Title', 'Priority', 'Priority', 'Owner'],
      ['A', 'High', 'P1', 'me'],
    ]);
    const p = parseGrid(
      g,
      opts(
        [
          { col: 1, target: 'title' },
          { col: 2, target: 'new_custom' },
          { col: 3, target: 'new_custom', newFieldLabel: 'Priority 2' },
          { col: 4, target: 'new_custom', newFieldLabel: 'owner' },
        ],
        { fieldDefs: [{ key: 'owner_name', label: 'Owner', type: 'text', showInTable: false }] },
      ),
    );
    expect(p.newFields).toEqual([
      { key: 'priority', label: 'Priority', col: 2 },
      { key: 'priority_2', label: 'Priority 2', col: 3 },
    ]);
    expect(p.cases[0]!.custom).toEqual({ priority: 'High', priority_2: 'P1', owner_name: 'me' });
  });
});

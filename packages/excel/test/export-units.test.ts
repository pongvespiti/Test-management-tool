import { describe, expect, it } from '@jest/globals';
import {
  isKnownPlaceholder,
  placeholderReference,
  quoteSheetName,
  sanitizeSheetName,
} from '../src/export';
import { textHeight } from '../src/export/fill-sheet';
import { RowMap, shiftFormula, translateFormula } from '../src/export/refs';
import { isDateFormatCode } from '../src/export/styles';

describe('sanitizeSheetName', () => {
  it('removes characters Excel forbids and trims', () => {
    expect(sanitizeSheetName('KR-02 iOS: [beta]')).toBe('KR-02 iOS beta');
    expect(sanitizeSheetName("  'quoted'  ")).toBe('quoted');
    expect(sanitizeSheetName('a/b\\c?d*e')).toBe('a b c d e');
    expect(sanitizeSheetName('   ')).toBe('Run');
    expect(sanitizeSheetName('History')).toBe('History (1)');
  });

  it('cuts to 31 characters and keeps names unique (case-insensitive)', () => {
    expect(sanitizeSheetName('x'.repeat(40))).toHaveLength(31);
    expect(sanitizeSheetName('KR_01', ['kr_01'])).toBe('KR_01 (2)');
    expect(sanitizeSheetName('KR_01', ['KR_01', 'KR_01 (2)'])).toBe('KR_01 (3)');
    const long = sanitizeSheetName('y'.repeat(40), ['y'.repeat(31)]);
    expect(long).toBe(`${'y'.repeat(27)} (2)`);
    expect(long).toHaveLength(31);
    expect(sanitizeSheetName('ทดสอบ😀'.repeat(6))).toHaveLength(
      [...'ทดสอบ😀'.repeat(6)].slice(0, 31).join('').length,
    );
  });

  it('quotes names for formulas when needed', () => {
    expect(quoteSheetName('Data')).toBe('Data');
    expect(quoteSheetName('KR 01')).toBe("'KR 01'");
    expect(quoteSheetName("Bob's")).toBe("'Bob''s'");
    expect(quoteSheetName('A1')).toBe("'A1'");
  });
});

describe('placeholderReference', () => {
  const ref = placeholderReference(
    [{ key: 'register' }],
    ['Unit model', 'OS(ver)'],
    ['Set temperature'],
  );

  it('lists workbook, summary, run and case placeholders', () => {
    expect(ref.workbook).toContain('${plan.docNo}');
    expect(ref.workbook).toContain('${today}');
    expect(ref.runs).toEqual(
      expect.arrayContaining([
        '${table:runs.code}',
        '${table:runs.env_unit_model}',
        '${table:runs.env_os_ver}',
        '${table:runs.g_set_temperature}',
        '${table:runs.ng}',
      ]),
    );
    expect(ref.run).toEqual(
      expect.arrayContaining([
        '${run.code}',
        '${run.judgementNote}',
        '${env.unit_model}',
        '${table:envList.value}',
      ]),
    );
    expect(ref.cases).toEqual(
      expect.arrayContaining([
        '${table:cases.no}',
        '${table:cases.sectionMerged}',
        '${table:cases.cf_register}',
        '${table:cases.priority}',
        '${table:cases.tags}',
        '${table:cases.references}',
        '${table:cases.estimate}',
      ]),
    );
    expect(isKnownPlaceholder('table:cases.estimate')).toBe(true);
  });

  it('lists the tables that work on every sheet', () => {
    expect(ref.requirements).toEqual(
      expect.arrayContaining([
        '${table:requirements.key}',
        '${table:requirements.status}',
        '${table:requirements.review}',
        '${table:requirements.ng}',
        '${table:requirements.total}',
      ]),
    );
    expect(ref.dimensions).toEqual(
      expect.arrayContaining(['${table:dimensions.dimension}', '${table:dimensions.value}']),
    );
    expect(ref.sessions).toEqual(
      expect.arrayContaining(['${table:sessions.key}', '${table:sessions.timeBox}']),
    );
    expect(isKnownPlaceholder('table:requirements.jiraStatus')).toBe(true);
    expect(isKnownPlaceholder('table:requirements.colour')).toBe(false);
    expect(isKnownPlaceholder('table:sessions.summary')).toBe(true);
    expect(isKnownPlaceholder('table:dimensions.runs')).toBe(true);
  });

  it('accepts data-dependent names by shape', () => {
    expect(isKnownPlaceholder('plan.title')).toBe(true);
    expect(isKnownPlaceholder('env.anything_new')).toBe(true);
    expect(isKnownPlaceholder('table:runs.g_new_group')).toBe(true);
    expect(isKnownPlaceholder('table:cases.cf_x')).toBe(true);
    expect(isKnownPlaceholder('run.ok')).toBe(true);
    expect(isKnownPlaceholder('plan.owner')).toBe(false);
    expect(isKnownPlaceholder('table:cases.colour')).toBe(false);
    expect(isKnownPlaceholder('table:other.x')).toBe(false);
  });
});

describe('RowMap and formulas', () => {
  // Row 10 became 3 rows, row 20 became 2 rows.
  const map = new RowMap([
    { row: 10, count: 3 },
    { row: 20, count: 2 },
  ]);

  it('maps rows and ranges', () => {
    expect([
      map.start(5),
      map.start(10),
      map.end(10),
      map.start(11),
      map.start(20),
      map.end(20),
      map.start(21),
    ]).toEqual([5, 10, 12, 13, 22, 23, 24]);
    expect(map.mapSqref('A10 B5:B11 C21')).toBe('A10:A12 B5:B13 C24');
    expect(map.inserted).toBe(3);
  });

  it('shifts references like inserting rows', () => {
    expect(shiftFormula('SUM(A10:A10)+$B$11+C5', map)).toBe('SUM(A10:A12)+$B$13+C5');
    expect(shiftFormula('Other!A11+A11', map)).toBe('Other!A11+A13');
    expect(shiftFormula('"A11"&A11', map)).toBe('"A11"&A13');
    expect(shiftFormula('LOG10(A11)', map)).toBe('LOG10(A13)');
    expect(shiftFormula('SUM(11:11)+SUM(A:A)', map)).toBe('SUM(13:13)+SUM(A:A)');
    expect(shiftFormula("'My Sheet'!$A$11:$B$21", map, { sheets: ['My Sheet'] })).toBe(
      "'My Sheet'!$A$13:$B$24",
    );
    expect(shiftFormula("'My Sheet'!$A$11+A11", map, { sheets: ['other'] })).toBe(
      "'My Sheet'!$A$11+A11",
    );
  });

  it('translates relative references like fill-down', () => {
    expect(translateFormula('A2*$B$2+B$2+$C2', 2, 0)).toBe('A4*$B$2+B$2+$C4');
    expect(translateFormula('SUM(A1:A3)', 1, 1)).toBe('SUM(B2:B4)');
    expect(translateFormula('A1', -1, 0)).toBe('#REF!');
  });
});

describe('styles and heights', () => {
  it('recognises date formats', () => {
    expect(isDateFormatCode('yyyy-mm-dd')).toBe(true);
    expect(isDateFormatCode('[$-409]d-mmm-yy;@')).toBe(true);
    expect(isDateFormatCode('[h]:mm:ss')).toBe(true);
    expect(isDateFormatCode('0.00')).toBe(false);
    expect(isDateFormatCode('#,##0 "days"')).toBe(false);
    expect(isDateFormatCode('General')).toBe(false);
    expect(isDateFormatCode('0.00E+00')).toBe(false);
  });

  it('estimates taller rows for longer text and smaller columns', () => {
    const short = textHeight('OK', 20, 11);
    const long = textHeight('word '.repeat(60), 20, 11);
    const narrow = textHeight('word '.repeat(60), 10, 11);
    const lines = textHeight('a\nb\nc', 20, 11);
    expect(short).toBeLessThan(20);
    expect(long).toBeGreaterThan(short * 5);
    expect(narrow).toBeGreaterThan(long);
    expect(lines).toBeCloseTo(3 * 11 * 1.3 + 3);
  });
});

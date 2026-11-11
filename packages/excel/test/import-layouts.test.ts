import type { FieldDef } from '@tmt/shared';
import { beforeAll, describe, expect, it } from '@jest/globals';
import {
  analyzeSheet,
  listSheets,
  mappingFromAnalysis,
  parseImport,
  readUpload,
  type SheetAnalysis,
  type SourceWorkbook,
} from '../src/import';
import {
  adapterWorkbook,
  modbusWorkbook,
  testRailCsv,
  unitOperationWorkbook,
} from './fixtures/workbooks';

function targets(a: SheetAnalysis): Record<string, string> {
  return Object.fromEntries(
    a.columns.map((c) => [
      `${c.letter}:${c.header}`,
      c.suggested.target + (c.suggested.customKey ? `:${c.suggested.customKey}` : ''),
    ]),
  );
}

function parseWithSuggestions(
  wb: SourceWorkbook,
  a: SheetAnalysis,
  fieldDefs: FieldDef[] = [],
  keepFirst = false,
) {
  return parseImport(wb, {
    sheet: a.sheet,
    headerRow: a.headerRow,
    columns: mappingFromAnalysis(a.columns),
    fieldDefs,
    onDuplicateInFile: keepFirst ? 'keep_first' : 'renumber',
  });
}

describe('unit operation layout', () => {
  let wb: SourceWorkbook;
  beforeAll(async () => {
    wb = await readUpload(await unitOperationWorkbook(), 'Unit_operation.xlsx');
  });

  it('lists every sheet with its visibility', () => {
    const sheets = listSheets(wb);
    expect(sheets.map((s) => [s.name, s.state])).toEqual([
      ['Summary_Unit operation', 'visible'],
      ['MODE A (Router)', 'hidden'],
      ['MODE B (AP)', 'visible'],
      ['MODE C (Online)', 'visible'],
      ['refer', 'visible'],
    ]);
    const online = sheets.find((s) => s.name === 'MODE C (Online)')!;
    expect(online.rowCount).toBe(40);
    expect(online.columnCount).toBe(12);
  });

  it('picks the largest visible case sheet, never summary/refer or hidden sheets', () => {
    const a = analyzeSheet(wb);
    expect(a.sheet).toBe('MODE C (Online)');
    expect(a.headerRow).toBe(30);
    expect(a.headerCandidates[0]).toBe(30);
    expect(a.layout).toBe('unit_operation');
    expect(a.dataRowCount).toBe(10);
  });

  it('suggests the unit-operation mapping (merged Expected Result counts once)', () => {
    const a = analyzeSheet(wb, { sheet: 'MODE C (Online)' });
    expect(targets(a)).toEqual({
      'C:Category': 'section',
      'D:No.': 'code',
      'E:Test Topic': 'title',
      'F:Type': 'type',
      'G:Pre condition': 'precondition',
      'H:Test procedure': 'procedure',
      'I:Expected Result': 'expected',
      'L:Actual result': 'ignore',
    });
    const expected = a.columns.find((c) => c.letter === 'I')!;
    expect(expected.span).toBe(3);
    expect(expected.samples[0]).toBe('App result Login successful');
    expect(a.columns.find((c) => c.letter === 'D')!.samples).toEqual(['1', '2', '3']);
  });

  it('finds the environment block and drops run-level labels', () => {
    const a = analyzeSheet(wb, { sheet: 'MODE C (Online)' });
    expect(a.envBlock).not.toBeNull();
    const { labels, columns } = a.envBlock!;
    expect(labels).toHaveLength(19);
    expect(labels.slice(0, 4)).toEqual(['Platform', 'Brand', 'Mobile model', 'OS(ver)']);
    expect(labels).not.toContain('Tester');
    expect(labels).not.toContain('Tested date');
    expect(labels).not.toContain('Judgement');
    expect(labels).not.toContain('Remark');
    expect(columns).toHaveLength(1);
    expect(columns[0]![labels.indexOf('OS(ver)')]).toBe('16');
    expect(columns[0]![labels.indexOf('SW ID')]).toBe('1000001');
  });

  it('parses cases with merged and filled-down categories', () => {
    const a = analyzeSheet(wb, { sheet: 'MODE C (Online)' });
    const p = parseWithSuggestions(wb, a);
    expect(p.sheet).toBe('MODE C (Online)');
    expect(p.cases).toHaveLength(10);
    expect(p.cases.map((c) => c.code)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
    expect(p.sectionPaths.map((s) => s.path)).toEqual([
      ['Login'],
      ['Unit control of Cool mode'],
      ['Display unit'],
      ['Unnamed section (row 37)'],
      ['Child lock'],
    ]);
    expect(p.cases.map((c) => c.sectionPath[0])).toEqual([
      'Login',
      'Unit control of Cool mode',
      'Unit control of Cool mode',
      'Unit control of Cool mode',
      'Display unit',
      'Display unit',
      'Unnamed section (row 37)',
      'Unnamed section (row 37)',
      'Unnamed section (row 37)',
      'Child lock',
    ]);
    const first = p.cases[0]!;
    expect(first).toMatchObject({
      row: 31,
      title: 'Login with account',
      caseType: 'Normal',
      precondition: 'Not logged in',
      procedure: '1. Open app\n2. Log in',
      expected: 'App result\n\nLogin successful',
      remark: null,
      summaryGroup: null,
      custom: {},
    });
    expect(p.cases[2]!.expected).toBe('Mode = Cool');
    expect(p.cases[3]!.caseType).toBe('Normal');
    expect(p.cases[9]!.caseType).toBe('Abnormal');
    expect(p.newFields).toEqual([]);
  });

  it('reports fill-down, unnamed merged sections and defaulted types', () => {
    const a = analyzeSheet(wb, { sheet: 'MODE C (Online)' });
    const p = parseWithSuggestions(wb, a);
    const byKind = (k: string) => p.warnings.filter((w) => w.kind === k);
    expect(byKind('type_defaulted')).toEqual([
      {
        kind: 'type_defaulted',
        message: 'Type is empty — set to Normal',
        count: 2,
        rows: [35, 38],
      },
    ]);
    const filled = byKind('section_filled_down');
    expect(filled.map((w) => [w.count, w.rows])).toEqual([
      [2, [36, 39]],
      [2, [37, 38]],
    ]);
    expect(filled[1]!.message).toContain('Unnamed section (row 37)');
    expect(byKind('continuation_row')).toEqual([]);
  });

  it('can read a hidden sheet on request', () => {
    const a = analyzeSheet(wb, { sheet: 'MODE A (Router)' });
    const p = parseWithSuggestions(wb, a);
    expect(p.cases.map((c) => c.title)).toEqual(['Login', 'Logout', 'Mode']);
    expect(p.sectionPaths.map((s) => s.path[0])).toEqual(['Login', 'Mode']);
  });

  it('honours a manual header row', () => {
    const a = analyzeSheet(wb, { sheet: 'MODE C (Online)', headerRow: 4 });
    expect(a.headerRow).toBe(4);
    expect(a.headerCandidates).toEqual([4, 30]);
    expect(a.layout).toBe('generic');
  });
});

describe('adapter layout', () => {
  let wb: SourceWorkbook;
  let a: SheetAnalysis;
  beforeAll(async () => {
    wb = await readUpload(await adapterWorkbook(), 'Adapter.xlsx');
    a = analyzeSheet(wb);
  });

  it('detects sheet, header row 24 and the adapter mapping', () => {
    expect(a.sheet).toBe('GRP_01_KR');
    expect(a.headerRow).toBe(24);
    expect(a.layout).toBe('adapter');
    expect(targets(a)).toEqual({
      'C:Test ID': 'section_code',
      'D:Case ID': 'code',
      'E:Test Topic': 'title',
      'F:Test Case Type': 'type',
      'G:Precondition': 'precondition',
      'H:Test Procedures': 'procedure',
      'I:Expected Result': 'expected',
      'J:Actual Result': 'ignore',
      'K:Remark': 'remark',
    });
    expect(a.columns.find((c) => c.letter === 'K')!.span).toBe(2);
    expect(a.envBlock!.labels).toEqual([
      'Router',
      'Wi-Fi Adapter',
      'SSID',
      'FW version',
      'SW ID',
      'EPROM ID',
      'SW OD',
      'EPROM OD',
      'Unit Type',
      'Unit Model',
      'Mobile',
      'OS Ver',
      'App ver.',
    ]);
    expect(a.envBlock!.columns[0]!.slice(0, 3)).toEqual(['Router-1', 'Gen 4', 'AP-0002']);
  });

  it('builds two-level sections with codes from full-width rows', () => {
    const p = parseWithSuggestions(wb, a);
    expect(p.sectionPaths).toEqual([
      { path: ['Normal Case'], codes: [null] },
      { path: ['Normal Case', 'Connection & operation'], codes: [null, 'GRP_01_001'] },
      { path: ['Normal Case', 'Pairing method'], codes: [null, 'GRP_01_002'] },
      { path: ['Abnormal Case'], codes: [null] },
      { path: ['Abnormal Case', 'Network change'], codes: [null, 'GRP_02_001'] },
    ]);
    expect(p.cases).toHaveLength(8);
    expect(p.cases[0]!.sectionPath).toEqual(['Normal Case', 'Connection & operation']);
    expect(p.cases[7]!.sectionPath).toEqual(['Abnormal Case', 'Network change']);
    expect(p.cases[7]!.caseType).toBe('Abnormal');
    expect(p.cases[1]!.remark).toBe('http://(ip)/config/');
    expect(p.cases[0]!.precondition).toBe('1. Adapter is ON\n2. Router is ON');
  });

  it('renumbers duplicate case IDs by default', () => {
    const p = parseWithSuggestions(wb, a);
    expect(p.cases.map((c) => c.code)).toContain('GRP_01_002_02-2');
    const dup = p.warnings.find((w) => w.kind === 'duplicate_code_in_file')!;
    expect(dup.count).toBe(1);
    expect(dup.message).toContain('GRP_01_002_02 → GRP_01_002_02-2');
    expect(dup.rows).toEqual([33]);
  });

  it('keeps the first duplicate when asked', () => {
    const p = parseWithSuggestions(wb, a, [], true);
    expect(p.cases).toHaveLength(7);
    expect(p.cases.filter((c) => c.code === 'GRP_01_002_02').map((c) => c.title)).toEqual([
      'Pairing timeout',
    ]);
    expect(p.warnings.find((w) => w.kind === 'duplicate_code_in_file')!.message).toContain(
      'skipped',
    );
  });
});

describe('modbus layouts', () => {
  let wb: SourceWorkbook;
  beforeAll(async () => {
    wb = await readUpload(await modbusWorkbook(), 'Modbus_system_test.xlsx');
  });

  it('lists hidden and very hidden sheets', () => {
    expect(listSheets(wb).map((s) => `${s.name}:${s.state}`)).toEqual([
      'MBF_01:visible',
      'Modbus:visible',
      'MBS_01:visible',
      'refer:visible',
      'Cover Page:hidden',
      'env:veryHidden',
    ]);
  });

  it('system test: header row 8, merged test topics become sections, extra columns custom fields', () => {
    const a = analyzeSheet(wb);
    expect(a.sheet).toBe('MBS_01');
    expect(a.headerRow).toBe(8);
    expect(a.layout).toBe('modbus_system');
    expect(targets(a)).toEqual({
      'B:Test topic': 'section',
      'C:Function': 'title',
      'D:Register': 'new_custom',
      'E:Pre-conditions': 'precondition',
      'F:Test step': 'procedure',
      'G:Modbus Test method': 'new_custom',
      'H:Expected result of controller': 'expected',
      'I:Expected result of device': 'new_custom',
      'J:Result (OK/NG, etc.)': 'ignore',
      'K:Remark': 'remark',
      'L:Judgement': 'ignore',
    });
    const p = parseWithSuggestions(wb, a);
    expect(p.cases).toHaveLength(10);
    expect(p.sectionPaths.map((s) => s.path[0])).toEqual([
      'Operation status',
      'Mode',
      'Humidity setting (some device support)',
      'Air flow',
    ]);
    expect(p.newFields).toEqual([
      { key: 'register', label: 'Register', col: 4 },
      { key: 'modbus_test_method', label: 'Modbus Test method', col: 7 },
      { key: 'expected_result_of_device', label: 'Expected result of device', col: 9 },
    ]);
    const humidity = p.cases.filter(
      (c) => c.sectionPath[0] === 'Humidity setting (some device support)',
    );
    expect(humidity.map((c) => c.title)).toEqual(['0 (off)', '0', '1', 'CONTINUE.']);
    expect(humidity.every((c) => c.custom.register === '2003')).toBe(true);
    expect(humidity[0]!.remark).toBe('Device not support');
    expect(p.cases[0]!.custom).toEqual({
      register: '2001',
      modbus_test_method: 'set -> get',
      expected_result_of_device: 'Device responds',
    });
    expect(p.cases.every((c) => c.code === null)).toBe(true);
    expect(p.warnings).toEqual([]);
  });

  it('maps headers to existing suite fields', () => {
    const fieldDefs: FieldDef[] = [
      { key: 'register', label: 'Register', type: 'text', showInTable: true },
    ];
    const a = analyzeSheet(wb, { sheet: 'MBS_01', fieldDefs });
    expect(a.columns.find((c) => c.letter === 'D')!.suggested).toEqual({
      target: 'custom',
      customKey: 'register',
    });
    const p = parseWithSuggestions(wb, a, fieldDefs);
    expect(p.newFields.map((f) => f.key)).toEqual([
      'modbus_test_method',
      'expected_result_of_device',
    ]);
    expect(p.cases[0]!.custom.register).toBe('2001');
  });

  it('function check: unlabeled merged category column becomes the section', () => {
    const a = analyzeSheet(wb, { sheet: 'MBF_01' });
    expect(a.headerRow).toBe(13);
    expect(a.layout).toBe('modbus_function');
    expect(targets(a)).toEqual({
      'B:': 'section',
      'C:Register': 'new_custom',
      'D:Name function': 'title',
      'E:Expected result': 'expected',
      'F:Actual result': 'ignore',
      'G:Result (OK/NG, etc.)': 'ignore',
      'H:Remark': 'remark',
      'I:Judgement': 'ignore',
    });
    const p = parseWithSuggestions(wb, a);
    expect(p.cases.map((c) => c.title)).toEqual([
      'Modbus SW ver',
      'Adapter SW ver',
      'Indoor temp exist',
      'Mode exist auto',
      'Mode exist cool',
      'Flap auto control (UD)',
      'Fan speed steps',
    ]);
    expect(p.sectionPaths.map((s) => s.path)).toEqual([['Unit info'], ['Functional']]);
    expect(p.cases[0]!.custom).toEqual({ register: '0002' });
    expect(p.cases[0]!.expected).toBe('1.0');
    expect(p.cases[5]!.custom).toEqual({});
    expect(p.cases[5]!.remark).toBe('Device not support');
    expect(p.cases[2]!.expected).toBe('0: Not supported\n1: Supported');
  });
});

describe('generic CSV (TestRail-like export)', () => {
  it('reads quotes, embedded line breaks and maps TestRail columns', async () => {
    const wb = await readUpload(testRailCsv(), 'testrail-export.csv');
    expect(wb.kind).toBe('csv');
    expect(listSheets(wb)).toEqual([
      { name: 'testrail-export', state: 'visible', rowCount: 4, columnCount: 10 },
    ]);
    const a = analyzeSheet(wb);
    expect(a.headerRow).toBe(1);
    expect(a.layout).toBe('generic');
    expect(a.envBlock).toBeNull();
    expect(targets(a)).toEqual({
      'A:ID': 'code',
      'B:Title': 'title',
      'C:Section': 'section',
      'D:Section Depth': 'ignore',
      'E:Type': 'new_custom',
      'F:Priority': 'priority',
      'G:Preconditions': 'precondition',
      'H:Steps': 'procedure',
      'I:Expected Result': 'expected',
      'J:References': 'references',
    });
    const p = parseWithSuggestions(wb, a);
    expect(p.cases.map((c) => c.code)).toEqual(['C101', 'C102', 'C103']);
    expect(p.cases[0]!.procedure).toBe('1. Open app\n2. Enter "user" and password');
    expect(p.cases[0]!.expected).toBe('Home page, with greeting');
    expect(p.cases[0]!.custom).toEqual({ type: 'Functional' });
    expect(p.cases.map((c) => [c.priority, c.references])).toEqual([
      ['high', 'REQ-1'],
      ['medium', null],
      ['low', 'REQ-2'],
    ]);
    expect(p.cases[2]!.precondition).toBeNull();
    expect(p.sectionPaths.map((s) => s.path)).toEqual([['Login'], ['Account']]);
    expect(p.newFields.map((f) => f.key)).toEqual(['type']);
    expect(p.warnings).toEqual([]);
  });
});

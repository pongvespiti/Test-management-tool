import { describe, expect, it } from '@jest/globals';
import type { FileRejection } from 'react-dropzone';
import type {
  ColumnMapping,
  FieldDef,
  ImportAnalysisDTO,
  ImportColumnInfo,
  ImportRecordDTO,
} from '@tmt/shared';
import { ApiError } from '@/lib/api/client';
import { makeSuite } from '../cases/test-utils';
import {
  buildRunBody,
  checkMapping,
  columnLetter,
  columnRange,
  DEFAULT_OPTIONS,
  defaultTarget,
  EMPTY_TARGET,
  mappingFromAnalysis,
  mappingFromValue,
  mappingValue,
  recordSummary,
  rowsText,
  runErrorTarget,
  targetOptions,
  validateTarget,
} from './import-model';
import { rejectionMessage } from './upload-step';

const column = (col: number, header = `H${col}`, span = 1): ImportColumnInfo => ({
  col,
  letter: columnLetter(col),
  header,
  span,
  samples: [],
  suggested: { target: 'ignore' },
});

const field: FieldDef = { key: 'test_id', label: 'Test ID', type: 'text', showInTable: false };

const record = (overrides: Partial<ImportRecordDTO>): ImportRecordDTO => ({
  id: 1,
  kind: 'cases',
  suite: null,
  run: null,
  fileName: 'cases.xlsx',
  sheet: 'Cases',
  layout: null,
  stats: {},
  createdBy: null,
  createdAt: '2026-11-01T00:00:00.000Z',
  ...overrides,
});

const err = (code: string) => new ApiError(422, code, `msg ${code}`);

const rejection = (name: string, ...codes: string[]): FileRejection => ({
  file: new File(['x'], name),
  errors: codes.map((code) => ({ code, message: code })),
});

describe('column helpers', () => {
  it('converts column numbers to Excel letters', () => {
    expect(columnLetter(1)).toBe('A');
    expect(columnLetter(26)).toBe('Z');
    expect(columnLetter(27)).toBe('AA');
    expect(columnLetter(703)).toBe('AAA');
  });

  it('shows merged headers as a letter range', () => {
    expect(columnRange({ col: 5, letter: 'E', span: 1 })).toBe('E');
    expect(columnRange({ col: 9, letter: 'I', span: 3 })).toBe('I–K');
  });
});

describe('mapping values', () => {
  it('starts from the suggestions of the analysis', () => {
    const analysis = {
      columns: [
        { ...column(1), suggested: { target: 'title' } },
        { ...column(2), suggested: { target: 'custom', customKey: 'test_id' } },
        { ...column(3, 'Model'), suggested: { target: 'new_custom', newFieldLabel: 'Unit model' } },
        { ...column(4, 'OS'), suggested: { target: 'new_custom' } },
      ],
    } as ImportAnalysisDTO;
    expect(mappingFromAnalysis(analysis)).toEqual([
      { col: 1, target: 'title' },
      { col: 2, target: 'custom', customKey: 'test_id' },
      { col: 3, target: 'new_custom', newFieldLabel: 'Unit model' },
      { col: 4, target: 'new_custom', newFieldLabel: 'OS' },
    ]);
  });

  it('round-trips select values', () => {
    expect(mappingValue({ col: 1, target: 'custom', customKey: 'test_id' })).toBe('custom:test_id');
    expect(mappingValue({ col: 1, target: 'custom' })).toBe('custom:');
    expect(mappingValue({ col: 1, target: 'title' })).toBe('title');
    const col = { col: 3, header: 'Model' };
    expect(mappingFromValue('custom:test_id', col)).toEqual({
      col: 3,
      target: 'custom',
      customKey: 'test_id',
    });
    expect(mappingFromValue('expected', col)).toEqual({ col: 3, target: 'expected' });
    expect(mappingFromValue('new_custom', col)).toEqual({
      col: 3,
      target: 'new_custom',
      newFieldLabel: 'Model',
    });
    expect(
      mappingFromValue('new_custom', col, { col: 3, target: 'new_custom', newFieldLabel: 'Kept' }),
    ).toMatchObject({ newFieldLabel: 'Kept' });
    expect(mappingFromValue('new_custom', { col: 4, header: '' })).toMatchObject({
      newFieldLabel: 'Column 4',
    });
  });

  it('groups the targets and lists the suite fields', () => {
    expect(targetOptions([]).map((g) => g.group)).toEqual(['Test case', 'Sections', 'Other']);
    const groups = targetOptions([field]);
    expect(groups.map((g) => g.group)).toEqual([
      'Test case',
      'Sections',
      'Custom fields of the suite',
      'Other',
    ]);
    expect(groups[2]!.items).toEqual([{ value: 'custom:test_id', label: 'Test ID' }]);
    expect(groups[3]!.items.map((i) => i.label)).toEqual(['New custom field…', 'Do not import']);
  });
});

describe('checkMapping', () => {
  const columns = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((c) => column(c));

  it('requires a title or a case code', () => {
    const check = checkMapping([{ col: 1, target: 'procedure' }], columns, []);
    expect(check.general).toBe('Import at least one column as Title or Case code.');
    expect(checkMapping([{ col: 1, target: 'code' }], columns, []).general).toBeNull();
  });

  it('explains shared targets and blocks ambiguous ones', () => {
    const mapping: ColumnMapping[] = [
      { col: 10, target: 'ignore' },
      { col: 3, target: 'section' },
      { col: 1, target: 'section' },
      { col: 2, target: 'title' },
      { col: 4, target: 'section_code' },
      { col: 5, target: 'section_code' },
      { col: 6, target: 'priority' },
      { col: 7, target: 'priority' },
      { col: 8, target: 'procedure' },
      { col: 9, target: 'procedure' },
    ];
    const check = checkMapping(mapping, columns, []);
    expect(check.notes.get(1)).toBe('Section level 1');
    expect(check.notes.get(3)).toBe('Section level 2');
    expect(check.errors.get(5)).toBe('Already imported from column D — choose one column');
    expect(check.notes.get(7)).toBe('Used when column F is empty');
    expect(check.notes.get(9)).toBe('Joined with column H');
    expect(check.errors.size).toBe(1);
    expect(check.notes.has(10)).toBe(false);
  });

  it('checks custom fields', () => {
    const mapping: ColumnMapping[] = [
      { col: 1, target: 'title' },
      { col: 2, target: 'custom', customKey: 'gone' },
      { col: 3, target: 'custom', customKey: 'test_id' },
      { col: 4, target: 'custom', customKey: 'test_id' },
      { col: 5, target: 'new_custom', newFieldLabel: ' ' },
      { col: 6, target: 'new_custom', newFieldLabel: 'Model' },
      { col: 7, target: 'new_custom' },
      // A column the analysis does not know (named by its letter).
      { col: 30, target: 'custom', customKey: 'test_id' },
    ];
    const check = checkMapping(mapping, columns, [field]);
    expect(check.errors.get(2)).toBe('This field does not exist in the chosen suite');
    expect(check.errors.get(4)).toBe('Already imported from column C — choose one column');
    expect(check.errors.get(5)).toBe('Name the new field');
    expect(check.errors.has(6)).toBe(false);
    expect(check.errors.get(7)).toBe('Name the new field');
    expect(check.errors.get(30)).toBe('Already imported from column C — choose one column');
    expect(check.notes.size).toBe(0);
    const unknown = checkMapping(
      [
        { col: 40, target: 'title' },
        { col: 41, target: 'title' },
      ],
      columns,
      [],
    );
    expect(unknown.notes.get(41)).toBe('Joined with column AN');
  });
});

describe('rowsText', () => {
  it('lists rows with a remainder', () => {
    expect(rowsText([], 0)).toBe('');
    expect(rowsText([5], 1)).toBe('row 5');
    expect(rowsText([5], 3)).toBe('rows 5 and 2 more');
    expect(rowsText([1, 2], 2)).toBe('rows 1, 2');
    expect(rowsText([1, 2, 3, 4], 0, 2)).toBe('rows 1, 2 and 2 more');
  });
});

describe('recordSummary', () => {
  it('summarises case imports', () => {
    expect(
      recordSummary(
        record({
          stats: {
            created: 3,
            updated: 2,
            skipped: 1,
            sectionsCreated: 2,
            fieldsCreated: 1,
            warnings: 4,
          },
        }),
      ),
    ).toBe('3 created · 2 updated · 1 skipped · 2 new sections · 1 new field · 4 warnings');
    expect(recordSummary(record({ stats: { created: 0, updated: 0 } }))).toBe('0 created');
    expect(recordSummary(record({}))).toBe('');
  });

  it('summarises JUnit imports', () => {
    expect(
      recordSummary(
        record({
          kind: 'junit',
          stats: { tests: 12, matched: 10, updatedRunCases: 9, createdCases: 2 },
        }),
      ),
    ).toBe('12 tests · 10 matched · 9 results · 2 cases created');
    expect(recordSummary(record({ kind: 'junit', stats: { createdCases: 0 } }))).toBe('');
  });
});

describe('wizard decisions', () => {
  const uot = makeSuite({ id: 1, prefix: 'UOT' });
  const mbs = makeSuite({ id: 2, name: 'Modbus system', prefix: 'MBS' });

  it('picks the default target suite', () => {
    expect(defaultTarget('a.xlsx', [uot, mbs], 2, true)).toEqual({ ...EMPTY_TARGET, suiteId: '2' });
    expect(defaultTarget('a.xlsx', [uot], null, false)).toEqual({ ...EMPTY_TARGET, suiteId: '1' });
    expect(defaultTarget('a.xlsx', [uot, mbs], 9, true)).toEqual(EMPTY_TARGET);
    expect(defaultTarget('a.xlsx', [], null, false)).toEqual(EMPTY_TARGET);
    expect(defaultTarget('Modbus_system__test.xlsx', [], null, true)).toEqual({
      mode: 'new',
      suiteId: null,
      name: 'Modbus system test',
      prefix: 'MST',
      prefixEdited: false,
    });
  });

  it('validates the target before mapping', () => {
    expect(validateTarget(EMPTY_TARGET, [uot])).toEqual({
      suite: 'Choose the suite to import into',
    });
    expect(validateTarget({ ...EMPTY_TARGET, suiteId: '1' }, [uot])).toEqual({});
    const fresh = { ...EMPTY_TARGET, mode: 'new' as const };
    expect(validateTarget({ ...fresh, name: ' ', prefix: '1X' }, [uot])).toEqual({
      name: 'Required',
      prefix: '1–10 letters/digits, starting with a letter',
    });
    expect(validateTarget({ ...fresh, name: 'Unit', prefix: 'uot' }, [uot])).toEqual({
      prefix: 'Another suite of this project uses this prefix',
    });
    expect(validateTarget({ ...fresh, name: 'Unit', prefix: 'NEW' }, [uot])).toEqual({});
  });

  it('builds the preview/commit body', () => {
    const analysis = {
      sheet: 'Cases',
      headerRow: 2,
      envBlock: { labels: ['Model'], columns: [] },
    };
    const mapping: ColumnMapping[] = [
      { col: 1, target: 'title' },
      { col: 2, target: 'ignore' },
    ];
    expect(
      buildRunBody({
        uploadId: 'u1',
        analysis,
        mapping,
        options: { ...DEFAULT_OPTIONS, parentSectionId: '11', onExisting: 'skip' },
        suite: uot,
        target: { ...EMPTY_TARGET, suiteId: '1' },
      }),
    ).toEqual({
      uploadId: 'u1',
      sheet: 'Cases',
      headerRow: 2,
      columns: [{ col: 1, target: 'title' }],
      options: {
        onDuplicateInFile: 'renumber',
        onExisting: 'skip',
        saveEnvTemplate: true,
        parentSectionId: 11,
      },
      suiteId: 1,
    });
    const body = buildRunBody({
      uploadId: 'u1',
      analysis: { ...analysis, envBlock: null },
      mapping,
      options: { ...DEFAULT_OPTIONS, parentSectionId: '11' },
      suite: null,
      target: { ...EMPTY_TARGET, mode: 'new', name: ' Unit ', prefix: ' uot ' },
    });
    expect(body.newSuite).toEqual({ name: 'Unit', prefix: 'UOT' });
    expect(body.suiteId).toBeUndefined();
    expect(body.options).toMatchObject({ saveEnvTemplate: false, parentSectionId: null });
  });

  it('sends server errors back to the step that can fix them', () => {
    expect(runErrorTarget(new Error('x'), 'existing')).toBeNull();
    expect(runErrorTarget(err('SUITE_PREFIX_TAKEN'), 'new')).toEqual({
      step: 1,
      fieldErrors: { prefix: 'msg SUITE_PREFIX_TAKEN' },
    });
    expect(runErrorTarget(err('BAD_SUITE'), 'new')).toEqual({
      step: 1,
      fieldErrors: { name: 'msg BAD_SUITE' },
    });
    expect(runErrorTarget(err('BAD_SUITE'), 'existing')).toEqual({
      step: 1,
      fieldErrors: { suite: 'msg BAD_SUITE' },
    });
    expect(runErrorTarget(err('FORBIDDEN'), 'new')).toEqual({
      step: 1,
      fieldErrors: { name: 'msg FORBIDDEN' },
    });
    expect(runErrorTarget(err('FORBIDDEN'), 'existing')).toBeNull();
    expect(runErrorTarget(err('UNKNOWN_FIELD'), 'existing')).toEqual({ step: 2, showError: true });
    expect(runErrorTarget(err('TOO_MANY_FIELDS'), 'new')).toEqual({ step: 2, showError: true });
    expect(runErrorTarget(err('BAD_SECTION'), 'existing')).toEqual({
      step: 3,
      fieldErrors: { section: 'msg BAD_SECTION' },
    });
    expect(runErrorTarget(err('UPLOAD_NOT_FOUND'), 'existing')).toBeNull();
  });
});

describe('rejectionMessage', () => {
  it('explains why a file was refused', () => {
    expect(rejectionMessage([])).toBe('This file cannot be imported.');
    expect(rejectionMessage([rejection('old.xls', 'file-invalid-type')])).toMatch(
      /old .xls workbooks cannot be imported/,
    );
    expect(rejectionMessage([rejection('big.xlsx', 'file-too-large')])).toBe(
      'big.xlsx is larger than 25 MB.',
    );
    expect(rejectionMessage([rejection('a.xlsx', 'too-many-files')])).toBe(
      'Drop one file at a time.',
    );
    expect(rejectionMessage([rejection('notes.txt', 'file-invalid-type')])).toBe(
      'notes.txt: only .xlsx and .csv files can be imported.',
    );
  });
});

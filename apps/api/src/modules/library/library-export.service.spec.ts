import { describe, expect, it } from '@jest/globals';
import { ExcelJS } from '@tmt/excel';
import { caseRow, sectionRow, suiteRow } from '../../../test/unit/fixtures.js';
import { createPrismaMock } from '../../../test/unit/prisma-mock.js';
import { caseTexts, LibraryExportService, sheetName } from './library-export.service.js';

describe('library export helpers', () => {
  it('makes valid sheet names', () => {
    expect(sheetName('Modbus [RTU]: test/cases?')).toBe('Modbus  RTU   test cases');
    expect(sheetName('x'.repeat(40))).toHaveLength(31);
    expect(sheetName('???')).toBe('Sheet1');
  });

  it('writes step-by-step cases as numbered procedure/expected text', () => {
    const shared = new Map([
      [3, { name: 'Login', steps: [{ action: 'Sign in', expected: 'Home' }] }],
    ]);
    expect(
      caseTexts(
        caseRow({
          template: 'steps',
          steps: [
            { kind: 'shared', sharedStepId: 3 },
            { kind: 'step', action: 'Tap', expected: '' },
          ] as never,
        }),
        shared,
      ),
    ).toEqual({ procedure: '1. Sign in\n2. Tap', expected: '1. Home' });
    expect(caseTexts(caseRow({ procedure: 'P', expected: null }), shared)).toEqual({
      procedure: 'P',
      expected: null,
    });
    expect(caseTexts(caseRow({ template: 'steps' }), shared)).toEqual({
      procedure: null,
      expected: null,
    });
  });
});

describe('LibraryExportService', () => {
  it('exports the live cases in library order with custom field columns', async () => {
    const { prisma, db } = createPrismaMock();
    db.suite.findFirst.mockResolvedValue(
      suiteRow({
        name: 'Modbus',
        fieldDefs: [{ key: 'reg', label: 'Register', type: 'text', showInTable: true }] as never,
      }),
    );
    db.section.findMany.mockResolvedValue([sectionRow({ id: 1, name: 'Power' })]);
    db.$queryRaw.mockResolvedValue([{ id: 100 }] as never);
    db.testCase.findMany.mockResolvedValue([
      caseRow({
        sectionId: 1,
        code: 'P-1',
        priority: 'high',
        tags: ['Smoke', 'UI'],
        estimateMinutes: 15,
        custom: { reg: '2001' } as never,
      }),
    ]);
    const { fileName, buffer } = await new LibraryExportService(prisma).suiteWorkbook(10, 2);
    expect(fileName).toBe('Modbus test cases.xlsx');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as never);
    const ws = wb.worksheets[0]!;
    expect(ws.name).toBe('Modbus');
    expect((ws.getRow(1).values as unknown[]).slice(-2)).toEqual(['References', 'Register']);
    expect((ws.getRow(2).values as unknown[]).slice(1)).toEqual([
      'Power',
      'P-1',
      'Power ON from app',
      'Normal',
      'Ready',
      '',
      '',
      '',
      '',
      '',
      'High',
      'Smoke, UI',
      15,
      '',
      '2001',
    ]);
  });
});

import { describe, expect, it } from '@jest/globals';
import { ExcelJS } from '@tmt/excel';
import { emptyCounts, type RunReportDTO } from '@tmt/shared';
import { runReportWorkbook } from './run-report-xlsx.js';

const tom = { id: 5, username: 'tom', displayName: 'Tom' };

function report(overrides: Partial<RunReportDTO> = {}): RunReportDTO {
  return {
    generatedAt: '2026-10-28T09:30:00.000+07:00',
    generatedBy: tom,
    timezone: 'Asia/Bangkok',
    project: { id: 10, key: 'ACS', name: 'ACS project' },
    plan: { id: 7, docNo: 'D-1', title: 'FW test', status: 'in_progress', release: null },
    run: {
      id: 3,
      code: 'KR_01',
      scenario: null,
      build: { id: 8, name: '1.1.7(2.0.0)' },
      suite: { id: 2, name: 'Modbus', prefix: 'MBS' },
      environment: [{ label: 'Phone', value: 'Pixel 9' }],
      tester: tom,
      testedDate: '2026-10-20',
      judgement: null,
      judgementNote: null,
      suggestedJudgement: 'not_pass',
      remark: null,
      sourceRun: null,
      createdAt: '2026-10-27T08:00:00.000+07:00',
    },
    firstExecutedAt: '2026-10-27T09:00:00.000+07:00',
    lastExecutedAt: '2026-10-27T10:00:00.000+07:00',
    estimate: { totalMinutes: 90, remainingMinutes: 0 },
    actualDurationSec: 120,
    counts: { ...emptyCounts(), ok: 1, ng: 1 },
    passRate: 0.5,
    progress: 1,
    sections: [{ path: ['A'], counts: { ...emptyCounts(), ok: 1, ng: 1 } }],
    cases: [
      {
        runCaseId: 50,
        displayId: 'MBS-001',
        code: 'C-1',
        title: 'Power on',
        sectionPath: ['A'],
        caseType: 'Normal',
        priority: 'high',
        status: 'ok',
        assignee: tom,
        executedBy: tom,
        executedAt: '2026-10-27T09:00:00.000+07:00',
        elapsedSec: 90,
        actualResult: null,
        resultRemark: null,
        steps: [],
        defects: [],
      },
      {
        runCaseId: 51,
        displayId: 'MBS-002',
        code: null,
        title: 'Sign in',
        sectionPath: ['A', 'A.1'],
        caseType: 'Abnormal',
        priority: 'low',
        status: 'ng',
        assignee: null,
        executedBy: tom,
        executedAt: '2026-10-27T10:00:00.000+07:00',
        elapsedSec: 30,
        actualResult: 'Timeout',
        resultRemark: 'Retest',
        steps: [
          { action: 'Open', expected: 'Login', sharedStepName: 'Login', status: 'ok', actual: '' },
          {
            action: 'Sign in',
            expected: 'Home',
            sharedStepName: null,
            status: 'ng',
            actual: 'Spinner',
          },
        ],
        defects: [
          {
            id: 9,
            key: 'BUG-4',
            title: 'Times out',
            status: 'open',
            severity: 'critical',
            externalKey: 'ACS-77',
          },
        ],
      },
    ],
    defects: [
      {
        id: 9,
        key: 'BUG-4',
        title: 'Times out',
        status: 'open',
        severity: 'critical',
        externalKey: 'ACS-77',
        externalStatus: 'In Progress',
      },
    ],
    ...overrides,
  };
}

async function load(buf: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  return wb;
}

describe('run report workbook', () => {
  it('writes Summary, Results and Steps with formulas over the results', async () => {
    const wb = await load(await runReportWorkbook(report()));
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Summary', 'Results', 'Steps']);
    const results = wb.getWorksheet('Results')!;
    expect(results.getCell('H2').value).toBe('OK');
    expect(results.getCell('H3').value).toBe('NG');
    expect(results.getCell('D3').value).toBe('A / A.1');
    expect(results.getCell('G2').value).toBe('High');
    expect(results.getCell('O3').value).toBe('BUG-4 (ACS-77)');
    expect(results.getCell('K2').value).toEqual(new Date(Date.UTC(2026, 9, 27, 9, 0, 0)));
    const steps = wb.getWorksheet('Steps')!;
    expect(steps.rowCount).toBe(3);
    expect([
      steps.getCell('E2').value,
      steps.getCell('H3').value,
      steps.getCell('I3').value,
    ]).toEqual(['Login', 'NG', 'Spinner']);
    const rows: Record<string, unknown> = {};
    wb.getWorksheet('Summary')!.eachRow((row) => {
      const key = row.getCell(1).value;
      if (typeof key === 'string') rows[key] = row.getCell(2).value;
    });
    expect(rows['Test run']).toBe('KR_01');
    expect(rows.Build).toBe('1.1.7(2.0.0)');
    expect(rows.Phone).toBe('Pixel 9');
    expect(rows['Suggested judgement']).toBe('NOT PASS');
    expect(rows['Actual duration']).toBe('2:00');
    expect(rows.Estimate).toBe('1h 30m total, 0m remaining');
    expect(rows.Generated).toBe('2026-10-28 09:30 by Tom');
    expect(rows.NG).toEqual({ formula: 'COUNTIF(Results!$H$2:$H$3,"NG")', result: 1 });
    expect(rows.Total).toEqual({ formula: 'COUNTA(Results!$A$2:$A$3)', result: 2 });
    expect(rows['Pass rate']).toMatchObject({ result: 0.5 });
    expect(rows.Progress).toMatchObject({ result: 1 });
    expect(rows['BUG-4']).toBe('Times out');
    expect(rows.Defect).toBe('Title');
  });

  it('skips the Steps sheet, sections and defects when there are none', async () => {
    const empty = report({
      cases: [],
      sections: [],
      defects: [],
      counts: emptyCounts(),
      passRate: null,
      progress: 0,
      run: { ...report().run, environment: [] },
    });
    const wb = await load(await runReportWorkbook(empty));
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Summary', 'Results']);
    const keys: string[] = [];
    wb.getWorksheet('Summary')!.eachRow((row) => {
      const key = row.getCell(1).value;
      if (typeof key === 'string') keys.push(key);
    });
    expect(keys).toContain('(none)');
    expect(keys).not.toContain('Results by section');
    expect(keys).not.toContain('Defects');
  });
});

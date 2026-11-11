import { describe, expect, it } from '@jest/globals';
import { emptyCounts, type ResultStatus } from '@tmt/shared';
import { createPrismaMock } from '../../../test/unit/prisma-mock.js';
import { buildPlanMatrix, computePlanMatrix, type MatrixRunCase } from './matrix.js';

const run = (id: number, code: string) => ({ id, code, scenario: null, environment: [] });
const rc = (
  runId: number,
  sortOrder: number,
  status: ResultStatus,
  extra: Partial<MatrixRunCase> = {},
): MatrixRunCase => ({
  runId,
  sortOrder,
  status,
  summaryGroup: null,
  sectionPath: [],
  caseType: 'Normal',
  ...extra,
});

describe('plan matrix', () => {
  it('orders groups by run order, then case order, and aggregates cells', () => {
    const m = computePlanMatrix(
      [run(2, 'KR_02'), run(1, 'KR_01')],
      [
        rc(1, 1, 'ng', { summaryGroup: 'Late' }),
        rc(2, 2, 'ok', { summaryGroup: 'Power' }),
        rc(2, 1, 'ok_cond', { summaryGroup: 'Status' }),
        rc(2, 3, 'ok', { summaryGroup: 'Power' }),
        rc(9, 1, 'ng', { summaryGroup: 'Foreign' }),
      ],
      'summary',
    );
    expect(m.groups).toEqual(['Status', 'Power', 'Late']);
    expect(m.rows.map((r) => r.run.code)).toEqual(['KR_02', 'KR_01']);
    expect(m.rows[0]!.cells).toEqual(['pass_cond', 'pass', null]);
    expect(m.rows[1]!.cells).toEqual([null, null, 'ng']);
    expect(m.counts[0]![1]).toEqual({ ...emptyCounts(), ok: 2 });
    expect(m.counts[1]![0]).toEqual(emptyCounts());
  });

  it('falls back to sections and supports section and type grouping', () => {
    const cases = [
      rc(1, 1, 'untested', { sectionPath: ['A', 'A.1'] }),
      rc(1, 2, 'ok', { sectionPath: [], caseType: 'Abnormal' }),
      rc(1, 3, 'na', { summaryGroup: 'G', sectionPath: ['B'] }),
    ];
    expect(computePlanMatrix([run(1, 'R')], cases, 'summary').groups).toEqual([
      'A',
      '(No section)',
      'G',
    ]);
    const bySection = computePlanMatrix([run(1, 'R')], cases, 'section');
    expect(bySection.groups).toEqual(['A.1', '(No section)', 'B']);
    expect(bySection.rows[0]!.cells).toEqual(['untested', 'pass', 'na']);
    expect(computePlanMatrix([run(1, 'R')], cases, 'type').groups).toEqual(['Normal', 'Abnormal']);
  });

  it('is empty without runs', () => {
    expect(computePlanMatrix([], [rc(1, 1, 'ok')], 'type')).toEqual({
      groupBy: 'type',
      groups: [],
      rows: [],
      counts: [],
    });
  });

  it('loads runs and run cases of a plan', async () => {
    const { db } = createPrismaMock();
    db.testRun.findMany.mockResolvedValue([]);
    expect((await buildPlanMatrix(db, 7, 'summary')).rows).toEqual([]);
    expect(db.runCase.findMany).not.toHaveBeenCalled();
    db.testRun.findMany.mockResolvedValue([run(1, 'KR_01')] as never);
    db.runCase.findMany.mockResolvedValue([rc(1, 1, 'ok', { summaryGroup: 'G' })] as never);
    const m = await buildPlanMatrix(db, 7, 'summary');
    expect(m.rows[0]!.cells).toEqual(['pass']);
    expect(db.testRun.findMany.mock.calls[1]![0]!.where).toEqual({ planId: 7 });
    expect(db.runCase.findMany.mock.calls[0]![0]!.where).toEqual({ runId: { in: [1] } });
  });
});

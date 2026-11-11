import { describe, expect, it } from '@jest/globals';
import { Prisma } from '@tmt/database';
import { emptyCounts } from '@tmt/shared';
import {
  planRow,
  runCaseResultRow,
  runCaseRow,
  runRow,
  suiteRow,
} from '../../../test/unit/fixtures.js';
import {
  envInput,
  stepResultsInput,
  toPlanDTO,
  toResultHistoryDTO,
  toRunCaseDTO,
  toRunDTO,
  toRunSummaryDTO,
} from './execution.mapper.js';

const users = new Map([[5, { id: 5, username: 'tom', displayName: 'Tom' }]]);

describe('execution mapper', () => {
  it('maps a run with defaults for source run and estimate', () => {
    const dto = toRunDTO(
      runRow({ environment: [{ label: 'FW', value: '1.1' }], testerId: 5, judgement: 'pass' }),
      planRow({ status: 'completed' }),
      suiteRow({ fieldDefs: [{ key: 'reg', label: 'Register', type: 'text' }] }),
      { ...emptyCounts(), ok: 1 },
      users,
    );
    expect(dto).toMatchObject({
      planStatus: 'completed',
      environment: [{ label: 'FW', value: '1.1' }],
      tester: { id: 5 },
      judgement: 'pass',
      testedDate: null,
      suggestedJudgement: 'pass',
      sourceRun: null,
      estimate: { totalMinutes: 0, remainingMinutes: 0 },
      createdAt: '2026-01-15T08:00:00.000Z',
    });
    expect(dto.suite.fieldDefs).toEqual([{ key: 'reg', label: 'Register', type: 'text' }]);
  });

  it('maps run cases, their history and run summaries', () => {
    const rc = toRunCaseDTO(
      runCaseRow({
        template: 'steps',
        steps: [{ action: 'a', expected: 'b', sharedStepName: null }],
        stepResults: [{ status: 'ok', actual: '' }],
        executedById: 5,
        executedAt: new Date('2026-10-27T07:00:00Z'),
        custom: { reg: '40001' },
      }),
      users,
      2,
      1,
    );
    expect(rc).toMatchObject({
      steps: [{ action: 'a', expected: 'b', sharedStepName: null }],
      stepResults: [{ status: 'ok', actual: '' }],
      executedBy: { id: 5 },
      executedAt: '2026-10-27T07:00:00.000Z',
      custom: { reg: '40001' },
      defectCount: 2,
      attachmentCount: 1,
      assignee: null,
    });
    expect(toRunCaseDTO(runCaseRow(), users)).toMatchObject({
      stepResults: null,
      defectCount: 0,
      attachmentCount: 0,
    });
    expect(
      toResultHistoryDTO(runCaseResultRow({ source: 'junit', executedById: 5 }), users),
    ).toMatchObject({ source: 'junit', executedBy: { id: 5 }, stepResults: null });
    expect(toRunSummaryDTO(runRow(), 'Modbus', emptyCounts(), { id: 1, code: 'S' })).toEqual({
      id: 3,
      code: 'KR_01',
      scenario: null,
      suiteName: 'Modbus',
      environment: [],
      counts: emptyCounts(),
      judgement: null,
      sourceRun: { id: 1, code: 'S' },
    });
  });

  it('sums plan counts over its runs and suggests a judgement', () => {
    const runs = [
      toRunSummaryDTO(runRow(), 'S', { ...emptyCounts(), ok: 2 }, null),
      toRunSummaryDTO(runRow({ id: 4 }), 'S', { ...emptyCounts(), ng: 1 }, null),
    ];
    const dto = toPlanDTO(planRow({ completedAt: new Date('2026-02-01T00:00:00Z') }), {
      release: null,
      signedCopy: null,
      runs,
      users,
    });
    expect(dto.counts).toMatchObject({ ok: 2, ng: 1 });
    expect(dto.suggestedJudgement).toBe('not_pass');
    expect(dto.completedAt).toBe('2026-02-01T00:00:00.000Z');
    const empty = toPlanDTO(planRow(), { release: null, signedCopy: null, runs: [], users });
    expect(empty.counts).toEqual(emptyCounts());
    expect(empty.suggestedJudgement).toBeNull();
  });

  it('converts JSON inputs', () => {
    expect(stepResultsInput(null)).toBe(Prisma.DbNull);
    expect(stepResultsInput([{ status: 'ok', actual: '' }])).toEqual([
      { status: 'ok', actual: '' },
    ]);
    expect(envInput([{ label: 'OS', value: '16' }])).toEqual([{ label: 'OS', value: '16' }]);
  });
});

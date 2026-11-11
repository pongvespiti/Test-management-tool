import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Prisma } from '@tmt/database';
import {
  authUser,
  planRow,
  projectCtx,
  runCaseResultRow,
  runCaseRow,
  runRow,
  groupByMock,
} from '../../../test/unit/fixtures.js';
import { createPrismaMock, type PrismaMock } from '../../../test/unit/prisma-mock.js';
import type { ActivityService } from '../activity/activity.service.js';
import { nextResultValues, ResultsService } from './results.service.js';

const steps = [
  { action: 'a', expected: '', sharedStepName: null },
  { action: 'b', expected: '', sharedStepName: null },
];

describe('nextResultValues', () => {
  const current = runCaseRow({
    actualResult: 'old',
    resultRemark: 'remark',
    elapsedSec: 10,
    stepResults: [{ status: 'ok', actual: '' }],
  });

  it('keeps omitted fields', () => {
    expect(nextResultValues(current, { status: 'ok' })).toEqual({
      actualResult: 'old',
      remark: 'remark',
      elapsedSec: 10,
      stepResults: [{ status: 'ok', actual: '' }],
    });
  });

  it('clears with null or empty values and normalises texts', () => {
    expect(
      nextResultValues(current, {
        status: 'ng',
        actualResult: null,
        remark: 'Line 1  \r\n',
        elapsedSec: null,
        stepResults: [],
      }),
    ).toEqual({ actualResult: null, remark: 'Line 1', elapsedSec: null, stepResults: null });
    expect(
      nextResultValues(current, {
        status: 'ng',
        stepResults: [
          { status: 'ng', actual: 'Spinner\r\n' },
          { status: 'ok', actual: '' },
        ],
      }).stepResults,
    ).toEqual([
      { status: 'ng', actual: 'Spinner' },
      { status: 'ok', actual: '' },
    ]);
  });
});

describe('ResultsService', () => {
  const me = authUser({ id: 1 });
  const ctx = projectCtx();
  let mock: PrismaMock;
  let activity: { log: jest.Mock<ActivityService['log']> };
  let service: ResultsService;

  beforeEach(() => {
    mock = createPrismaMock();
    activity = { log: jest.fn<ActivityService['log']>().mockResolvedValue(undefined) };
    service = new ResultsService(mock.prisma, activity as unknown as ActivityService);
    mock.db.testPlan.findUnique.mockResolvedValue(planRow());
    groupByMock(mock.db.attachment.groupBy).mockResolvedValue([]);
  });

  const withRunCase = (rc = runCaseRow({ steps })) => {
    mock.db.runCase.findFirst.mockResolvedValue({
      ...rc,
      run: { ...runRow(), plan: planRow() },
    } as never);
    mock.db.runCase.findUnique.mockResolvedValue(rc);
    mock.db.runCase.findMany.mockResolvedValue([{ ...rc, _count: { defectLinks: 0 } }] as never);
  };

  it('checks the step count against the snapshot', async () => {
    withRunCase();
    await expect(
      service.setResult(
        ctx,
        me,
        50,
        { status: 'ok', stepResults: [{ status: 'ok', actual: '' }] },
        'ui',
      ),
    ).rejects.toMatchObject({
      code: 'STEP_COUNT_MISMATCH',
      details: { expected: 2, received: 1 },
    });
  });

  it('records a result with its history row and moves the plan to in progress', async () => {
    withRunCase();
    await service.setResult(
      ctx,
      me,
      50,
      {
        status: 'ng',
        actualResult: 'No response',
        stepResults: [
          { status: 'ok', actual: '' },
          { status: 'ng', actual: 'x' },
        ],
      },
      'api',
    );
    const data = mock.db.runCase.update.mock.calls[0]![0].data;
    expect(data).toMatchObject({ status: 'ng', actualResult: 'No response', executedById: 1 });
    expect(data.executedAt).toBeInstanceOf(Date);
    expect(mock.db.runCaseResult.create.mock.calls[0]![0].data).toMatchObject({
      runCaseId: 50,
      status: 'ng',
      source: 'api',
      executedById: 1,
    });
    expect(mock.db.testPlan.updateMany).toHaveBeenCalled();
    expect(activity.log.mock.calls[0]![1]).toMatchObject({
      entityType: 'run_case',
      action: 'result_set',
      summary: 'MBS-036 → NG in run KR_01',
      data: { status: 'ng', previous: 'untested' },
    });
  });

  it('clears the executor when a result goes back to untested', async () => {
    withRunCase(runCaseRow({ status: 'ok', stepResults: null }));
    await service.setResult(ctx, me, 50, { status: 'untested' }, 'ui');
    expect(mock.db.runCase.update.mock.calls[0]![0].data).toMatchObject({
      executedById: null,
      executedAt: null,
      stepResults: Prisma.DbNull,
    });
    expect(mock.db.testPlan.updateMany).not.toHaveBeenCalled();
  });

  it('sets results in bulk for run cases of the run only', async () => {
    mock.db.testRun.findFirst.mockResolvedValue({ ...runRow(), plan: planRow() } as never);
    mock.db.runCase.updateManyAndReturn.mockResolvedValue([]);
    expect(await service.bulk(ctx, me, 3, { runCaseIds: [50], status: 'ok' })).toEqual({
      affected: 0,
    });
    expect(activity.log).not.toHaveBeenCalled();
    mock.db.runCase.updateManyAndReturn.mockResolvedValue([
      { id: 50, actualResult: 'a', resultRemark: null, elapsedSec: 5, stepResults: null },
      {
        id: 51,
        actualResult: null,
        resultRemark: 'r',
        elapsedSec: null,
        stepResults: [{ status: 'ok', actual: '' }],
      },
    ] as never);
    expect(await service.bulk(ctx, me, 3, { runCaseIds: [50, 51, 99], status: 'ok_cond' })).toEqual(
      {
        affected: 2,
      },
    );
    expect(mock.db.runCase.updateManyAndReturn.mock.calls[1]![0]!.where).toEqual({
      runId: 3,
      id: { in: [50, 51, 99] },
    });
    expect(mock.db.runCaseResult.createMany.mock.calls[0]![0]!.data).toEqual([
      expect.objectContaining({
        runCaseId: 50,
        status: 'ok_cond',
        source: 'bulk',
        stepResults: Prisma.DbNull,
      }),
      expect.objectContaining({
        runCaseId: 51,
        remark: 'r',
        stepResults: [{ status: 'ok', actual: '' }],
      }),
    ]);
    expect(activity.log.mock.calls[0]![1]).toMatchObject({
      action: 'results_bulk',
      summary: 'Set 2 result(s) to OK w/ cond. in run KR_01',
    });
  });

  it('returns the run case detail with history, files, defects and other runs', async () => {
    withRunCase(runCaseRow({ testCaseId: null }));
    mock.db.runCaseResult.findMany.mockResolvedValue([runCaseResultRow()]);
    mock.db.attachment.findMany.mockResolvedValue([]);
    mock.db.defectLink.findMany.mockResolvedValue([]);
    mock.db.user.findMany.mockResolvedValue([]);
    const d = await service.detail(10, 50);
    expect(d).toMatchObject({ id: 50, attachments: [], defects: [], otherRuns: [] });
    expect(d.history).toHaveLength(1);
    expect(mock.db.runCaseResult.findMany.mock.calls[0]![0]!.orderBy).toEqual([
      { executedAt: 'desc' },
      { id: 'desc' },
    ]);
  });
});

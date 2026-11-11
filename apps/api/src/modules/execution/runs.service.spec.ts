import type { DimensionsService } from '../dimensions/dimensions.service.js';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Prisma } from '@tmt/database';
import {
  authUser,
  caseRow,
  planRow,
  projectCtx,
  runRow,
  suiteRow,
  groupByMock,
} from '../../../test/unit/fixtures.js';
import { createPrismaMock, type PrismaMock } from '../../../test/unit/prisma-mock.js';
import type { ActivityService } from '../activity/activity.service.js';
import type { StorageService } from '../storage/storage.service.js';
import { RunsService } from './runs.service.js';

const codeTaken = new Prisma.PrismaClientKnownRequestError('dup', {
  code: 'P2002',
  clientVersion: 'test',
  meta: { driverAdapterError: { cause: { constraint: { index: 'test_runs_plan_id_code_key' } } } },
});

describe('RunsService', () => {
  const me = authUser({ id: 1 });
  const ctx = projectCtx();
  let mock: PrismaMock;
  let activity: { log: jest.Mock<ActivityService['log']> };
  let storage: { removeMany: jest.Mock<StorageService['removeMany']> };
  let service: RunsService;

  beforeEach(() => {
    mock = createPrismaMock();
    activity = { log: jest.fn<ActivityService['log']>().mockResolvedValue(undefined) };
    storage = { removeMany: jest.fn<StorageService['removeMany']>().mockResolvedValue(undefined) };
    service = new RunsService(
      mock.prisma,
      activity as unknown as ActivityService,
      storage as unknown as StorageService,
      // No lists defined: the environment is saved as typed.
      {
        canonicalize: async (_tx: unknown, _id: number, e: unknown) => e,
      } as unknown as DimensionsService,
    );
    // Queries behind the returned RunDTO and the plan lock.
    mock.db.suite.findMany.mockResolvedValue([suiteRow()]);
    groupByMock(mock.db.runCase.groupBy).mockResolvedValue([]);
    mock.db.$queryRaw.mockResolvedValue([] as never);
    mock.db.testPlan.findUnique.mockResolvedValue(planRow());
    mock.db.testRun.aggregate.mockResolvedValue({ _max: { sortOrder: 2 } } as never);
  });

  describe('create', () => {
    beforeEach(() => {
      mock.db.testPlan.findFirst.mockResolvedValue(planRow());
      mock.db.section.findMany.mockResolvedValue([]);
    });

    it('rejects foreign suites and empty selections', async () => {
      mock.db.suite.findFirst.mockResolvedValue(null);
      await expect(
        service.create(ctx, me, 7, {
          suiteId: 99,
          code: 'R',
          environment: [],
          caseStatuses: ['ready'],
        }),
      ).rejects.toMatchObject({ code: 'BAD_SUITE' });
      mock.db.suite.findFirst.mockResolvedValue(suiteRow());
      mock.db.testCase.findMany.mockResolvedValue([]);
      await expect(
        service.create(ctx, me, 7, {
          suiteId: 2,
          code: 'R',
          environment: [],
          caseStatuses: ['ready'],
        }),
      ).rejects.toMatchObject({ code: 'NO_CASES' });
    });

    it('snapshots the cases with the suite environment template', async () => {
      mock.db.suite.findFirst.mockResolvedValue(suiteRow({ envTemplate: ['Phone', 'OS'] }));
      mock.db.testCase.findMany.mockResolvedValue([
        caseRow({ id: 1 }),
        caseRow({ id: 2, seq: 37 }),
      ]);
      mock.db.testRun.create.mockResolvedValue(runRow({ id: 30, code: 'R1' }));
      mock.db.runCase.createManyAndReturn.mockResolvedValue([{ id: 1 }, { id: 2 }] as never);
      const dto = await service.create(ctx, me, 7, {
        suiteId: 2,
        code: 'R1',
        environment: [],
        caseStatuses: ['ready'],
        testedDate: '2026-10-20',
      });
      expect(dto.id).toBe(30);
      expect(mock.db.testRun.create.mock.calls[0]![0].data).toMatchObject({
        planId: 7,
        suiteId: 2,
        code: 'R1',
        environment: [
          { label: 'Phone', value: '' },
          { label: 'OS', value: '' },
        ],
        testedDate: new Date('2026-10-20T00:00:00.000Z'),
        sortOrder: 3,
      });
      const inserted = mock.db.runCase.createManyAndReturn.mock.calls[0]![0]!.data as unknown[];
      expect(inserted).toHaveLength(2);
      expect(mock.db.testPlan.update).toHaveBeenCalled();
      expect(activity.log.mock.calls[0]![1]).toMatchObject({
        entityType: 'run',
        action: 'created',
        summary: 'Created run R1 in 26TR-TEAM-10-001 with 2 cases from Modbus system test',
      });
    });

    it('maps a duplicate run code', async () => {
      mock.db.suite.findFirst.mockResolvedValue(suiteRow());
      mock.db.testCase.findMany.mockResolvedValue([caseRow()]);
      mock.db.testRun.create.mockRejectedValue(codeTaken);
      await expect(
        service.create(ctx, me, 7, {
          suiteId: 2,
          code: 'R1',
          environment: [],
          caseStatuses: ['ready'],
        }),
      ).rejects.toMatchObject({ code: 'RUN_CODE_TAKEN' });
    });
  });

  it('updates the given fields and refuses completed plans', async () => {
    mock.db.testRun.findFirst.mockResolvedValue({
      ...runRow(),
      plan: planRow({ status: 'completed' }),
    } as never);
    await expect(service.update(ctx, me, 3, { remark: 'x' })).rejects.toMatchObject({
      code: 'PLAN_LOCKED',
    });
    mock.db.testRun.findFirst.mockResolvedValue({ ...runRow(), plan: planRow() } as never);
    mock.db.testRun.update.mockResolvedValue(runRow({ remark: 'x' }));
    await service.update(ctx, me, 3, { remark: 'x', testedDate: null, judgement: 'pass' });
    expect(mock.db.testRun.update.mock.calls[0]![0].data).toEqual({
      remark: 'x',
      testedDate: null,
      judgement: 'pass',
    });
    mock.db.testRun.update.mockRejectedValue(codeTaken);
    await expect(service.update(ctx, me, 3, { code: 'KR_02' })).rejects.toMatchObject({
      code: 'RUN_CODE_TAKEN',
      message: 'Run code KR_02 is already used in this test plan',
    });
  });

  it('deletes a run with the files of its run cases', async () => {
    mock.db.testRun.findFirst.mockResolvedValue({ ...runRow(), plan: planRow() } as never);
    mock.db.runCase.findMany.mockResolvedValue([{ id: 50 }] as never);
    mock.db.comment.findMany.mockResolvedValue([]);
    mock.db.attachment.findMany.mockResolvedValue([{ storageKey: 'files/e' }] as never);
    await service.remove(ctx, me, 3);
    expect(mock.db.testRun.delete).toHaveBeenCalledWith({ where: { id: 3 } });
    expect(storage.removeMany).toHaveBeenCalledWith(['files/e']);
    expect(activity.log.mock.calls[0]![1]).toMatchObject({
      action: 'deleted',
      summary: 'Deleted run KR_01 from 26TR-TEAM-10-001',
    });
  });

  it('duplicates a run with its snapshot and the source settings', async () => {
    mock.db.testRun.findFirst.mockResolvedValue({
      ...runRow({ scenario: 'Android', testerId: 5, environment: [{ label: 'OS', value: '16' }] }),
      plan: planRow(),
    } as never);
    mock.db.testRun.create.mockResolvedValue(runRow({ id: 31, code: 'DUP' }));
    await service.duplicate(ctx, me, 3, { code: 'DUP', scenario: null });
    expect(mock.db.testRun.create.mock.calls[0]![0].data).toMatchObject({
      code: 'DUP',
      scenario: null,
      environment: [{ label: 'OS', value: '16' }],
      testerId: 5,
    });
    expect(mock.db.$executeRaw.mock.calls[0]!.slice(1)).toEqual([31, 3]);
    expect(activity.log.mock.calls[0]![1]).toMatchObject({
      summary: 'Duplicated run KR_01 as DUP in 26TR-TEAM-10-001',
      data: { sourceRunId: 3 },
    });
  });
});

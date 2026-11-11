import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  authUser,
  caseRow,
  planRow,
  projectCtx,
  runCaseRow,
  runRow,
  suiteRow,
  groupByMock,
} from '../../../test/unit/fixtures.js';
import { createPrismaMock, type PrismaMock } from '../../../test/unit/prisma-mock.js';
import type { ActivityService } from '../activity/activity.service.js';
import type { StorageService } from '../storage/storage.service.js';
import { assertAssignee, RunChangesService, runCasesOfRun } from './run-changes.service.js';

const user = (isActive: boolean, isAdmin: boolean, role?: string) => ({
  isActive,
  isAdmin,
  memberships: role ? [{ role }] : [],
});

describe('RunChangesService', () => {
  const me = authUser({ id: 1 });
  let mock: PrismaMock;
  let activity: { log: jest.Mock<ActivityService['log']> };
  let storage: { removeMany: jest.Mock<StorageService['removeMany']> };
  let service: RunChangesService;

  beforeEach(() => {
    mock = createPrismaMock();
    activity = { log: jest.fn<ActivityService['log']>().mockResolvedValue(undefined) };
    storage = { removeMany: jest.fn<StorageService['removeMany']>().mockResolvedValue(undefined) };
    service = new RunChangesService(
      mock.prisma,
      activity as unknown as ActivityService,
      storage as unknown as StorageService,
    );
    mock.db.testRun.findFirst.mockResolvedValue({ ...runRow(), plan: planRow() } as never);
    mock.db.testPlan.findUnique.mockResolvedValue(planRow());
    mock.db.suite.findUniqueOrThrow.mockResolvedValue(suiteRow({ envTemplate: ['OS'] }));
    mock.db.section.findMany.mockResolvedValue([]);
    mock.db.suite.findMany.mockResolvedValue([suiteRow()]);
    groupByMock(mock.db.runCase.groupBy).mockResolvedValue([]);
    mock.db.$queryRaw.mockResolvedValue([] as never);
  });

  it('checks that run cases belong to the run', async () => {
    mock.db.runCase.findMany.mockResolvedValue([{ id: 50, status: 'ok', displayId: 'X' }] as never);
    await expect(runCasesOfRun(mock.db, 3, [50, 51, 51])).rejects.toMatchObject({
      code: 'BAD_RUN_CASE',
      details: { runCaseIds: [51] },
    });
    expect(await runCasesOfRun(mock.db, 3, [50])).toHaveLength(1);
  });

  it('accepts only active testers/leads of the project or administrators as assignees', async () => {
    for (const u of [
      null,
      user(true, false, 'viewer'),
      user(true, false),
      user(false, false, 'lead'),
    ]) {
      mock.db.user.findUnique.mockResolvedValue(u as never);
      await expect(assertAssignee(mock.db, 10, 5)).rejects.toMatchObject({ code: 'UNKNOWN_USER' });
    }
    for (const u of [user(true, false, 'tester'), user(true, true)]) {
      mock.db.user.findUnique.mockResolvedValue(u as never);
      await expect(assertAssignee(mock.db, 10, 5)).resolves.toBeUndefined();
    }
  });

  it('adds only cases that are not in the run yet', async () => {
    mock.db.testCase.findMany.mockResolvedValue([
      caseRow({ id: 100 }),
      caseRow({ id: 101, seq: 37 }),
    ]);
    mock.db.runCase.findMany.mockResolvedValue([{ testCaseId: 100 }] as never);
    mock.db.runCase.aggregate.mockResolvedValue({ _max: { sortOrder: 4 } } as never);
    mock.db.runCase.createManyAndReturn.mockResolvedValue([{ id: 70 }] as never);
    expect(await service.addCases(projectCtx(), me, 3, { caseStatuses: ['ready'] })).toEqual({
      added: 1,
    });
    expect(mock.db.runCase.createManyAndReturn.mock.calls[0]![0]!.data).toEqual([
      expect.objectContaining({ testCaseId: 101, displayId: 'MBS-037', sortOrder: 5 }),
    ]);
    expect(activity.log.mock.calls[0]![1]).toMatchObject({
      action: 'cases_added',
      data: { testCaseIds: [101] },
    });
    mock.db.runCase.findMany.mockResolvedValue([{ testCaseId: 100 }, { testCaseId: 101 }] as never);
    expect(await service.addCases(projectCtx(), me, 3, { caseStatuses: ['ready'] })).toEqual({
      added: 0,
    });
  });

  it('lets only leads remove executed run cases', async () => {
    mock.db.runCase.findMany.mockResolvedValue([
      { id: 50, status: 'ng', displayId: 'A' },
      { id: 51, status: 'untested', displayId: 'B' },
    ] as never);
    await expect(
      service.removeCases(projectCtx({ role: 'tester' }), me, 3, { runCaseIds: [50, 51] }),
    ).rejects.toMatchObject({ code: 'EXECUTED_RUN_CASES', status: 403 });
    expect(mock.db.runCase.deleteMany).not.toHaveBeenCalled();
    mock.db.comment.findMany.mockResolvedValue([]);
    mock.db.attachment.findMany.mockResolvedValue([{ storageKey: 'files/x' }] as never);
    mock.db.runCase.deleteMany.mockResolvedValue({ count: 2 });
    expect(await service.removeCases(projectCtx(), me, 3, { runCaseIds: [50, 51] })).toEqual({
      removed: 2,
    });
    expect(storage.removeMany).toHaveBeenCalledWith(['files/x']);
    expect(activity.log.mock.calls[0]![1]).toMatchObject({
      action: 'cases_removed',
      data: { runCaseIds: [50, 51], displayIds: ['A', 'B'], executed: 1 },
    });
  });

  describe('rerun', () => {
    it('needs cases with one of the statuses', async () => {
      mock.db.runCase.findMany.mockResolvedValue([]);
      await expect(
        service.rerun(projectCtx(), me, 3, {
          code: 'R2',
          statuses: ['ng', 'blocked'],
          copyEnvironment: true,
          keepAssignees: true,
          refreshFromLibrary: false,
        }),
      ).rejects.toMatchObject({
        code: 'NO_CASES',
        message: 'No run case of KR_01 has one of the results NG, Blocked',
      });
    });

    it('copies the picked snapshots, refreshes them from the library on request', async () => {
      mock.db.runCase.findMany.mockResolvedValue([
        runCaseRow({ id: 50, testCaseId: 100, title: 'Old', assigneeId: 5, status: 'ng' }),
        runCaseRow({ id: 51, testCaseId: 101, title: 'Deleted', status: 'ng' }),
      ]);
      mock.db.testCase.findMany.mockResolvedValue([caseRow({ id: 100, title: 'New' })]);
      mock.db.testRun.aggregate.mockResolvedValue({ _max: { sortOrder: 1 } } as never);
      mock.db.testRun.create.mockResolvedValue(runRow({ id: 40, code: 'R2', sourceRunId: 3 }));
      mock.db.runCase.createManyAndReturn.mockResolvedValue([{ id: 1 }, { id: 2 }] as never);
      mock.db.testRun.findMany.mockResolvedValue([{ id: 3, code: 'KR_01' }] as never);
      const dto = await service.rerun(projectCtx(), me, 3, {
        code: 'R2',
        statuses: ['ng'],
        copyEnvironment: false,
        keepAssignees: false,
        refreshFromLibrary: true,
      });
      expect(dto.sourceRun).toEqual({ id: 3, code: 'KR_01' });
      expect(mock.db.testRun.create.mock.calls[0]![0].data).toMatchObject({
        sourceRunId: 3,
        environment: [{ label: 'OS', value: '' }],
      });
      expect(
        (
          mock.db.runCase.createManyAndReturn.mock.calls[0]![0]!.data as {
            title: string;
            assigneeId: null;
            sortOrder: number;
          }[]
        ).map((r) => [r.title, r.assigneeId, r.sortOrder]),
      ).toEqual([
        ['New', null, 1],
        ['Deleted', null, 2],
      ]);
      expect(activity.log.mock.calls[0]![1]).toMatchObject({
        action: 'rerun_created',
        summary: 'Re-run of KR_01 as R2 in 26TR-TEAM-10-001 with 2 case(s)',
      });
    });
  });

  it('assigns and unassigns run cases', async () => {
    mock.db.runCase.findMany.mockResolvedValue([
      { id: 50, status: 'untested', displayId: 'A' },
    ] as never);
    mock.db.runCase.updateMany.mockResolvedValue({ count: 1 });
    expect(
      await service.assign(projectCtx(), me, 3, { runCaseIds: [50], assigneeId: null }),
    ).toEqual({ affected: 1 });
    expect(mock.db.runCase.updateMany.mock.calls[0]![0].data).toEqual({ assigneeId: null });
    expect(activity.log.mock.calls[0]![1]).toMatchObject({
      action: 'cases_assigned',
      summary: 'Unassigned 1 case(s) in run KR_01',
    });
  });
});

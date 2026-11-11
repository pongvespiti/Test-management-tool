import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Prisma } from '@tmt/database';
import {
  authUser,
  caseRow,
  projectCtx,
  sharedStepRow,
  userRow,
} from '../../../test/unit/fixtures.js';
import { createPrismaMock, type PrismaMock } from '../../../test/unit/prisma-mock.js';
import type { ActivityService } from '../activity/activity.service.js';
import { inlineSharedStep, normalizePlainSteps, plainStepsOf } from './shared-steps.mapper.js';
import { SharedStepsService, usesSharedStep } from './shared-steps.service.js';

describe('shared step mapping', () => {
  it('reads stored steps defensively and normalises new ones', () => {
    expect(plainStepsOf([{ action: 'a' }, { expected: 'b' }])).toEqual([
      { action: 'a', expected: '' },
      { action: '', expected: 'b' },
    ]);
    expect(plainStepsOf(null)).toEqual([]);
    expect(normalizePlainSteps([{ action: 'Open  \r\n' }])).toEqual([
      { action: 'Open', expected: '' },
    ]);
  });

  it('inlines a shared step as plain steps and keeps other references', () => {
    expect(
      inlineSharedStep(
        [
          { kind: 'shared', sharedStepId: 3 },
          { kind: 'shared', sharedStepId: 4 },
        ],
        3,
        [{ action: 'Open', expected: 'Home' }],
      ),
    ).toEqual([
      { kind: 'step', action: 'Open', expected: 'Home' },
      { kind: 'shared', sharedStepId: 4 },
    ]);
  });

  it('finds users through a JSON containment filter on live cases of the project', () => {
    expect(usesSharedStep(10, 3)).toEqual({
      isDeleted: false,
      suite: { projectId: 10 },
      steps: { array_contains: [{ kind: 'shared', sharedStepId: 3 }] },
    });
  });
});

describe('SharedStepsService', () => {
  const me = authUser({ id: 1 });
  const ctx = projectCtx();
  let mock: PrismaMock;
  let activity: { log: jest.Mock<ActivityService['log']> };
  let service: SharedStepsService;

  beforeEach(() => {
    mock = createPrismaMock();
    activity = { log: jest.fn<ActivityService['log']>().mockResolvedValue(undefined) };
    service = new SharedStepsService(mock.prisma, activity as unknown as ActivityService);
    mock.db.user.findMany.mockResolvedValue([userRow()]);
    mock.db.testCase.count.mockResolvedValue(0);
  });

  it('lists shared steps in name order with usage counts', async () => {
    mock.db.$queryRaw
      .mockResolvedValueOnce([{ id: 4 }, { id: 3 }] as never)
      .mockResolvedValueOnce([{ id: 3, n: 2 }] as never);
    mock.db.sharedStep.findMany.mockResolvedValue([
      sharedStepRow({ id: 3, name: 'Log in' }),
      sharedStepRow({ id: 4, name: 'Another' }),
    ]);
    const list = await service.list(10);
    expect(list.map((s) => [s.name, s.usageCount])).toEqual([
      ['Another', 0],
      ['Log in', 2],
    ]);
  });

  it('creates shared steps with unique names (case-insensitive)', async () => {
    mock.db.$queryRaw.mockResolvedValueOnce([{ id: 9 }] as never);
    await expect(
      service.create(ctx, me, { name: 'LOG IN', steps: [{ action: 'x', expected: '' }] }),
    ).rejects.toMatchObject({ code: 'SHARED_STEP_NAME_TAKEN' });
    const [, ...values] = mock.db.$queryRaw.mock.calls[0]! as unknown[];
    expect(values).toEqual([10, 'LOG IN', 0]);

    mock.db.$queryRaw.mockResolvedValueOnce([] as never);
    mock.db.sharedStep.create.mockResolvedValue(sharedStepRow({ id: 5, name: 'New' }));
    const dto = await service.create(ctx, me, {
      name: 'New',
      steps: [{ action: ' Open \r\n', expected: '' }],
    });
    expect(dto).toMatchObject({ id: 5, usageCount: 0, createdBy: { username: 'alice' } });
    expect(mock.db.sharedStep.create.mock.calls[0]![0].data).toMatchObject({
      projectId: 10,
      steps: [{ action: ' Open', expected: '' }],
      createdById: 1,
      updatedById: 1,
    });
    expect(activity.log.mock.calls[0]![1]).toMatchObject({
      entityType: 'shared_step',
      summary: 'Created shared step New',
    });
  });

  it('updates with optimistic concurrency', async () => {
    mock.db.sharedStep.findFirst.mockResolvedValue(sharedStepRow({ version: 2 }));
    await expect(service.update(ctx, me, 3, { version: 1 })).rejects.toMatchObject({
      code: 'VERSION_CONFLICT',
      details: { currentVersion: 2 },
    });
    mock.db.sharedStep.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('gone', { code: 'P2025', clientVersion: 'test' }),
    );
    await expect(service.update(ctx, me, 3, { description: 'x' })).rejects.toMatchObject({
      code: 'VERSION_CONFLICT',
    });
    expect(mock.db.sharedStep.update.mock.calls[0]![0].where).toEqual({ id: 3, version: 2 });
  });

  it('refuses to delete a used shared step unless it is inlined', async () => {
    mock.db.sharedStep.findFirst.mockResolvedValue(sharedStepRow());
    mock.db.sharedStep.findUniqueOrThrow.mockResolvedValue(sharedStepRow());
    mock.db.$queryRaw
      .mockResolvedValueOnce([{ id: 3 }] as never)
      .mockResolvedValueOnce([{ id: 100 }, { id: 101 }] as never);
    await expect(service.remove(ctx, me, 3, false)).rejects.toMatchObject({
      code: 'SHARED_STEP_IN_USE',
      details: { usageCount: 2 },
    });
    expect(mock.db.sharedStep.delete).not.toHaveBeenCalled();
  });

  it('inlines the steps into every using case before deleting', async () => {
    mock.db.sharedStep.findFirst.mockResolvedValue(sharedStepRow());
    mock.db.sharedStep.findUniqueOrThrow.mockResolvedValue(sharedStepRow());
    mock.db.$queryRaw
      .mockResolvedValueOnce([{ id: 3 }] as never)
      .mockResolvedValueOnce([{ id: 100 }] as never);
    mock.db.testCase.findMany.mockResolvedValue([
      {
        ...caseRow({
          id: 100,
          seq: 7,
          title: 'Uses it',
          steps: [{ kind: 'shared', sharedStepId: 3 }],
        }),
        suite: { prefix: 'MBS' },
      },
    ] as never);
    mock.db.testCase.update.mockResolvedValue(caseRow({ id: 100, version: 2 }));
    await service.remove(ctx, me, 3, true);
    expect(mock.db.testCase.update).toHaveBeenCalledWith({
      where: { id: 100 },
      data: {
        steps: [{ kind: 'step', action: 'Open the app', expected: 'Login page' }],
        version: { increment: 1 },
        updatedById: 1,
      },
    });
    expect(mock.db.testCaseVersion.createMany).toHaveBeenCalled();
    const entries = mock.db.activityLog.createMany.mock.calls[0]![0]!.data as Record<
      string,
      unknown
    >[];
    expect(entries[0]).toMatchObject({
      action: 'updated',
      summary: 'Inlined shared step Log in into MBS-007 Uses it',
      data: { sharedStepId: 3 },
    });
    expect(mock.db.sharedStep.delete).toHaveBeenCalledWith({ where: { id: 3 } });
    expect(activity.log.mock.calls[0]![1]).toMatchObject({
      action: 'deleted',
      summary: 'Deleted shared step Log in (inlined into 1 case(s))',
    });
  });

  it('shows the cases using a shared step', async () => {
    mock.db.sharedStep.findFirst.mockResolvedValue(sharedStepRow());
    mock.db.testCase.findMany.mockResolvedValue([
      { id: 100, suiteId: 2, seq: 7, code: null, title: 'Uses it', suite: { prefix: 'MBS' } },
    ] as never);
    mock.db.testCase.count.mockResolvedValue(1);
    const detail = await service.get(10, 3);
    expect(detail.usedBy).toEqual([
      { id: 100, suiteId: 2, displayId: 'MBS-007', code: null, title: 'Uses it' },
    ]);
    expect(detail.usageCount).toBe(1);
    expect(mock.db.testCase.findMany.mock.calls[0]![0]!.take).toBe(200);
    mock.db.sharedStep.findFirst.mockResolvedValue(null);
    await expect(service.get(10, 99)).rejects.toMatchObject({ code: 'SHARED_STEP_NOT_FOUND' });
  });
});

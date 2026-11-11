import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Prisma } from '@tmt/database';
import { authUser, projectCtx, suiteRow } from '../../../test/unit/fixtures.js';
import { createPrismaMock, type PrismaMock } from '../../../test/unit/prisma-mock.js';
import type { ActivityService } from '../activity/activity.service.js';
import type { StorageService } from '../storage/storage.service.js';
import { SuitesService } from './suites.service.js';

/** `groupBy` has overloads the deep mock cannot type. */
const groupByMock = (m: PrismaMock) =>
  m.db.testCase.groupBy as unknown as jest.Mock<(args: { where?: unknown }) => Promise<unknown>>;

const defs = [
  { key: 'reg', label: 'Register', type: 'text' as const, showInTable: false },
  { key: 'mode', label: 'Mode', type: 'text' as const, showInTable: false },
];

describe('SuitesService', () => {
  const me = authUser({ id: 1 });
  const ctx = projectCtx();
  let mock: PrismaMock;
  let activity: { log: jest.Mock<ActivityService['log']> };
  let storage: { removeMany: jest.Mock<StorageService['removeMany']> };
  let service: SuitesService;

  beforeEach(() => {
    mock = createPrismaMock();
    activity = { log: jest.fn<ActivityService['log']>().mockResolvedValue(undefined) };
    storage = { removeMany: jest.fn<StorageService['removeMany']>().mockResolvedValue(undefined) };
    service = new SuitesService(
      mock.prisma,
      activity as unknown as ActivityService,
      storage as unknown as StorageService,
    );
  });

  it('lists live suites by sort order with live case counts', async () => {
    mock.db.suite.findMany.mockResolvedValue([suiteRow({ id: 2 }), suiteRow({ id: 3 })]);
    groupByMock(mock).mockResolvedValue([{ suiteId: 2, _count: { _all: 5 } }] as never);
    const list = await service.list(10, false);
    expect(list.map((s) => [s.id, s.caseCount])).toEqual([
      [2, 5],
      [3, 0],
    ]);
    expect(mock.db.suite.findMany.mock.calls[0]![0]).toEqual({
      where: { projectId: 10, isArchived: false },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    expect(groupByMock(mock).mock.calls[0]![0]!.where).toEqual({
      isDeleted: false,
      suite: { projectId: 10 },
    });
    await service.list(10, true);
    expect(mock.db.suite.findMany.mock.calls[1]![0]!.where).toEqual({ projectId: 10 });
  });

  it('creates a suite at the end of the list and refuses a taken prefix', async () => {
    mock.db.suite.findFirst.mockResolvedValueOnce(null);
    mock.db.suite.aggregate.mockResolvedValue({ _max: { sortOrder: 4 } } as never);
    mock.db.suite.create.mockResolvedValue(suiteRow({ id: 9, name: 'New' }));
    const dto = await service.create(ctx, me, {
      name: 'New',
      prefix: 'NEW',
      fieldDefs: [],
      envTemplate: ['FW'],
    });
    expect(dto).toMatchObject({ id: 9, caseCount: 0 });
    expect(mock.db.suite.create.mock.calls[0]![0].data).toMatchObject({
      projectId: 10,
      prefix: 'NEW',
      description: null,
      envTemplate: ['FW'],
      sortOrder: 5,
    });
    expect(activity.log.mock.calls[0]![1]).toMatchObject({
      action: 'created',
      summary: 'Created suite New',
    });

    mock.db.suite.findFirst.mockResolvedValueOnce({ id: 1 } as never);
    await expect(
      service.create(ctx, me, { name: 'x', prefix: 'NEW', fieldDefs: [], envTemplate: [] }),
    ).rejects.toMatchObject({ code: 'SUITE_PREFIX_TAKEN' });
  });

  it('maps a concurrent duplicate prefix to SUITE_PREFIX_TAKEN', async () => {
    mock.db.suite.findFirst.mockResolvedValue(null);
    mock.db.suite.aggregate.mockResolvedValue({ _max: { sortOrder: null } } as never);
    mock.db.suite.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'test',
        meta: {
          driverAdapterError: { cause: { constraint: { index: 'suites_project_id_prefix_key' } } },
        },
      }),
    );
    await expect(
      service.create(ctx, me, { name: 'x', prefix: 'DUP', fieldDefs: [], envTemplate: [] }),
    ).rejects.toMatchObject({
      code: 'SUITE_PREFIX_TAKEN',
      message: expect.stringContaining('DUP'),
    });
  });

  it('strips removed custom fields from the cases when field definitions change', async () => {
    mock.db.suite.findFirst.mockResolvedValue(suiteRow({ fieldDefs: defs as never }));
    mock.db.suite.update.mockResolvedValue(suiteRow({ name: 'Renamed' }));
    mock.db.testCase.count.mockResolvedValue(3);
    const dto = await service.update(ctx, me, 2, { name: 'Renamed', fieldDefs: [defs[0]!] });
    expect(dto).toMatchObject({ name: 'Renamed', caseCount: 3 });
    expect(mock.db.$executeRaw).toHaveBeenCalledTimes(1);
    const [strings, ...values] = mock.db.$executeRaw.mock.calls[0]! as unknown[];
    expect((strings as string[]).join('?')).toMatch(/SET custom = custom - \?::text/);
    expect(values).toEqual(['mode', 2, 'mode']);
    expect(mock.db.suite.update.mock.calls[0]![0].data).toEqual({
      name: 'Renamed',
      fieldDefs: [defs[0]],
    });
    expect(activity.log.mock.calls[0]![1]).toMatchObject({
      action: 'updated',
      summary: 'Updated suite Renamed',
    });
  });

  it('checks a changed prefix only', async () => {
    mock.db.suite.findFirst
      .mockResolvedValueOnce(suiteRow({ prefix: 'MBS' }))
      .mockResolvedValueOnce({ id: 4 } as never);
    await expect(service.update(ctx, me, 2, { prefix: 'ADP' })).rejects.toMatchObject({
      code: 'SUITE_PREFIX_TAKEN',
    });
    mock.db.suite.findFirst.mockReset();
    mock.db.suite.findFirst.mockResolvedValue(suiteRow({ prefix: 'MBS' }));
    mock.db.suite.update.mockResolvedValue(suiteRow());
    await service.update(ctx, me, 2, { prefix: 'MBS' });
    expect(mock.db.suite.findFirst).toHaveBeenCalledTimes(1);
  });

  it('refuses to delete a suite with runs', async () => {
    mock.db.suite.findFirst.mockResolvedValue(suiteRow());
    mock.db.testRun.findFirst.mockResolvedValue({ id: 1 } as never);
    await expect(service.remove(ctx, me, 2)).rejects.toMatchObject({ code: 'SUITE_IN_USE' });
    expect(mock.db.suite.delete).not.toHaveBeenCalled();
  });

  it('deletes a suite with its case comments/attachments and removes their files', async () => {
    mock.db.suite.findFirst.mockResolvedValue(suiteRow());
    mock.db.testRun.findFirst.mockResolvedValue(null);
    mock.db.testCase.findMany.mockResolvedValue([{ id: 100 }] as never);
    mock.db.comment.findMany.mockResolvedValue([]);
    mock.db.attachment.findMany.mockResolvedValue([{ storageKey: 'files/a' }] as never);
    await service.remove(ctx, me, 2);
    expect(mock.db.attachment.deleteMany).toHaveBeenCalledWith({
      where: { entityType: 'test_case', entityId: { in: [100] } },
    });
    expect(mock.db.suite.delete).toHaveBeenCalledWith({ where: { id: 2 } });
    expect(activity.log.mock.calls[0]![1]).toMatchObject({
      action: 'deleted',
      summary: 'Deleted suite Modbus system test',
    });
    expect(storage.removeMany).toHaveBeenCalledWith(['files/a']);
  });
});

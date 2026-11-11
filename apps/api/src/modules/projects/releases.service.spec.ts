import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { authUser, projectCtx, releaseRow } from '../../../test/unit/fixtures.js';
import { createPrismaMock, type PrismaMock } from '../../../test/unit/prisma-mock.js';
import type { ActivityService } from '../activity/activity.service.js';
import { ReleasesService } from './releases.service.js';

describe('ReleasesService', () => {
  const me = authUser();
  const ctx = projectCtx();
  let mock: PrismaMock;
  let activity: { log: jest.Mock<ActivityService['log']> };
  let service: ReleasesService;

  beforeEach(() => {
    mock = createPrismaMock();
    activity = { log: jest.fn<ActivityService['log']>().mockResolvedValue(undefined) };
    service = new ReleasesService(mock.prisma, activity as unknown as ActivityService);
  });

  it('lists newest first with undated releases last', async () => {
    mock.db.release.findMany.mockResolvedValue([releaseRow()]);
    await service.list(10);
    expect(mock.db.release.findMany.mock.calls[0]![0]!.orderBy).toEqual([
      { startDate: { sort: 'desc', nulls: 'last' } },
      { id: 'desc' },
    ]);
  });

  it('stores calendar dates as UTC midnight and returns them as YYYY-MM-DD', async () => {
    mock.db.release.create.mockImplementation((async (args: { data: Record<string, unknown> }) =>
      releaseRow({
        startDate: args.data.startDate as Date,
        endDate: args.data.endDate as Date,
      })) as never);
    const dto = await service.create(ctx, me, {
      name: 'FW 2.4.0',
      startDate: '2026-11-01',
      endDate: '2026-11-30',
      status: 'planned',
    });
    expect(mock.db.release.create.mock.calls[0]![0].data.startDate).toEqual(
      new Date('2026-11-01T00:00:00.000Z'),
    );
    expect(dto).toMatchObject({ startDate: '2026-11-01', endDate: '2026-11-30' });
  });

  it('answers RELEASE_NOT_FOUND for releases of other projects', async () => {
    mock.db.release.findFirst.mockResolvedValue(null);
    await expect(service.update(ctx, me, 77, { name: 'x' })).rejects.toMatchObject({
      code: 'RELEASE_NOT_FOUND',
    });
    expect(mock.db.release.findFirst.mock.calls[0]![0]!.where).toEqual({ id: 77, projectId: 10 });
  });

  it('patches only the given fields (null clears a date)', async () => {
    mock.db.release.findFirst.mockResolvedValue(releaseRow());
    mock.db.release.update.mockResolvedValue(releaseRow({ status: 'active' }));
    await service.update(ctx, me, 5, { status: 'active', endDate: null });
    expect(mock.db.release.update.mock.calls[0]![0].data).toEqual({
      status: 'active',
      endDate: null,
    });
  });

  it('refuses to delete a release used by test plans', async () => {
    mock.db.release.findFirst.mockResolvedValue(releaseRow());
    mock.db.testPlan.count.mockResolvedValue(2);
    await expect(service.remove(ctx, me, 5)).rejects.toMatchObject({
      code: 'RELEASE_IN_USE',
      message: 'Release FW 2.4.0 is used by 2 test plan(s)',
    });
    expect(mock.db.release.delete).not.toHaveBeenCalled();
  });

  it('deletes an unused release and logs it', async () => {
    mock.db.release.findFirst.mockResolvedValue(releaseRow());
    mock.db.testPlan.count.mockResolvedValue(0);
    await service.remove(ctx, me, 5);
    expect(mock.db.release.delete).toHaveBeenCalledWith({ where: { id: 5 } });
    expect(activity.log.mock.calls[0]![1]).toMatchObject({ action: 'deleted', entityId: 5 });
  });
});

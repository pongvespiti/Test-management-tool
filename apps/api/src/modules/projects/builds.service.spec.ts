import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Build } from '@tmt/database';
import { authUser, projectCtx } from '../../../test/unit/fixtures.js';
import { createPrismaMock, type PrismaMock } from '../../../test/unit/prisma-mock.js';
import type { ActivityService } from '../activity/activity.service.js';
import { BuildsService } from './builds.service.js';

const T0 = new Date('2026-11-01T00:00:00.000Z');
const buildRow = (
  over: Partial<Build> = {},
  counts = { runs: 0, foundDefects: 0, fixedDefects: 0 },
) => ({
  id: 8,
  releaseId: 5,
  name: '1.1.7(1.0.0)',
  notes: null,
  builtDate: null,
  createdAt: T0,
  updatedAt: T0,
  ...over,
  _count: counts,
});

describe('BuildsService', () => {
  const me = authUser();
  const ctx = projectCtx();
  let mock: PrismaMock;
  let service: BuildsService;

  beforeEach(() => {
    mock = createPrismaMock();
    const activity = { log: jest.fn<ActivityService['log']>().mockResolvedValue(undefined) };
    service = new BuildsService(mock.prisma, activity as unknown as ActivityService);
  });

  it('lists the builds of the project newest first, undated last', async () => {
    mock.db.build.findMany.mockResolvedValue([
      buildRow({}, { runs: 2, foundDefects: 1, fixedDefects: 1 }),
    ] as never);
    const [dto] = await service.list(10);
    expect(mock.db.build.findMany.mock.calls[0]![0]!.where).toEqual({ release: { projectId: 10 } });
    expect(mock.db.build.findMany.mock.calls[0]![0]!.orderBy).toEqual([
      { builtDate: { sort: 'desc', nulls: 'last' } },
      { id: 'desc' },
    ]);
    expect(dto).toMatchObject({ runCount: 2, defectCount: 2, builtDate: null });
  });

  it('limits the list to a release of the project (404 otherwise)', async () => {
    mock.db.release.count.mockResolvedValue(0);
    await expect(service.list(10, 77)).rejects.toMatchObject({ code: 'RELEASE_NOT_FOUND' });
    mock.db.release.count.mockResolvedValue(1);
    mock.db.build.findMany.mockResolvedValue([] as never);
    await service.list(10, 5);
    expect(mock.db.build.findMany.mock.calls[0]![0]!.where).toEqual({
      release: { projectId: 10 },
      releaseId: 5,
    });
  });

  it('creates a build, storing the date as UTC midnight', async () => {
    mock.db.release.count.mockResolvedValue(1);
    mock.db.build.create.mockResolvedValue(
      buildRow({ builtDate: new Date('2026-11-08T00:00:00.000Z') }) as never,
    );
    const dto = await service.create(ctx, me, 5, { name: '1.1.7(1.0.0)', builtDate: '2026-11-08' });
    expect(mock.db.build.create.mock.calls[0]![0].data).toEqual({
      releaseId: 5,
      name: '1.1.7(1.0.0)',
      notes: null,
      builtDate: new Date('2026-11-08T00:00:00.000Z'),
    });
    expect(dto.builtDate).toBe('2026-11-08');
  });

  it('answers 404 for a release or build of another project', async () => {
    mock.db.release.count.mockResolvedValue(0);
    await expect(service.create(ctx, me, 9, { name: 'x' })).rejects.toMatchObject({
      code: 'RELEASE_NOT_FOUND',
    });
    mock.db.build.findFirst.mockResolvedValue(null);
    await expect(service.update(ctx, me, 9, { name: 'x' })).rejects.toMatchObject({
      code: 'BUILD_NOT_FOUND',
    });
    expect(mock.db.build.findFirst.mock.calls[0]![0]!.where).toEqual({
      id: 9,
      release: { projectId: 10 },
    });
  });

  it('patches only the given fields', async () => {
    mock.db.build.findFirst.mockResolvedValue(buildRow() as never);
    mock.db.build.update.mockResolvedValue(buildRow({ notes: 'fix' }) as never);
    await service.update(ctx, me, 8, { notes: 'fix' });
    expect(mock.db.build.update.mock.calls[0]![0].data).toEqual({ notes: 'fix' });
  });

  it('refuses to delete a build that runs or defects use', async () => {
    mock.db.build.findFirst.mockResolvedValue(
      buildRow({}, { runs: 1, foundDefects: 0, fixedDefects: 2 }) as never,
    );
    await expect(service.remove(ctx, me, 8)).rejects.toMatchObject({
      status: 409,
      code: 'BUILD_IN_USE',
    });
    expect(mock.db.build.delete).not.toHaveBeenCalled();
  });

  it('deletes an unused build', async () => {
    mock.db.build.findFirst.mockResolvedValue(buildRow() as never);
    mock.db.build.delete.mockResolvedValue(buildRow() as never);
    await service.remove(ctx, me, 8);
    expect(mock.db.build.delete.mock.calls[0]![0].where).toEqual({ id: 8 });
  });
});

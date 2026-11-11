import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createDefectSchema, DEFECT_STATUS_LABELS } from '@tmt/shared';
import {
  authUser,
  defectRow,
  planRow,
  projectCtx,
  runCaseRow,
  runRow,
} from '../../../test/unit/fixtures.js';
import { createPrismaMock, type PrismaMock } from '../../../test/unit/prisma-mock.js';
import type { ActivityService } from '../activity/activity.service.js';
import type { StorageService } from '../storage/storage.service.js';
import { allocateDefectSeq, DefectsService } from './defects.service.js';

describe('DefectsService', () => {
  const me = authUser({ id: 1 });
  const ctx = projectCtx({ id: 10 });
  let mock: PrismaMock;
  let activity: { log: jest.Mock<ActivityService['log']> };
  let storage: { removeMany: jest.Mock<StorageService['removeMany']> };
  let service: DefectsService;

  const logged = () => activity.log.mock.calls.map((c) => c[1]);

  beforeEach(() => {
    mock = createPrismaMock();
    activity = { log: jest.fn<ActivityService['log']>().mockResolvedValue(undefined) };
    storage = { removeMany: jest.fn<StorageService['removeMany']>().mockResolvedValue(undefined) };
    service = new DefectsService(
      mock.prisma,
      activity as unknown as ActivityService,
      storage as unknown as StorageService,
    );
    // Reads of the DTO builders (links, attachments, users, releases).
    mock.db.defectLink.findMany.mockResolvedValue([]);
    mock.db.attachment.findMany.mockResolvedValue([]);
    mock.db.user.findMany.mockResolvedValue([]);
    mock.db.release.findMany.mockResolvedValue([]);
    mock.db.user.count.mockResolvedValue(1);
    mock.db.release.count.mockResolvedValue(1);
  });

  it('lists one page newest first with the total', async () => {
    mock.db.defect.count.mockResolvedValue(3);
    mock.db.defect.findMany.mockResolvedValue([defectRow()]);
    const page = await service.list(10, { page: 2, pageSize: 2, status: ['new'] });
    expect(page).toMatchObject({ total: 3, page: 2, pageSize: 2 });
    expect(page.items.map((d) => d.key)).toEqual(['BUG-12']);
    expect(mock.db.defect.findMany.mock.calls[0]![0]).toMatchObject({
      where: { projectId: 10, status: { in: ['new'] } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: 2,
      take: 2,
    });
  });

  it('allocates numbers atomically and refuses an unknown project', async () => {
    mock.db.$queryRaw.mockResolvedValue([{ seq: 7 }]);
    await expect(allocateDefectSeq(mock.db, 10)).resolves.toBe(7);
    mock.db.$queryRaw.mockResolvedValue([]);
    await expect(allocateDefectSeq(mock.db, 10)).rejects.toMatchObject({
      code: 'PROJECT_NOT_FOUND',
    });
  });

  it('reports a defect from a run case: prefill, link and activity', async () => {
    const rc = runCaseRow({ id: 50, testCaseId: 100, procedure: 'Do it' });
    mock.db.runCase.findFirst.mockResolvedValue({
      ...rc,
      run: { ...runRow({ code: 'KR_01' }), plan: planRow({ releaseId: 4 }) },
    } as never);
    mock.db.$queryRaw.mockResolvedValue([{ seq: 12 }]);
    mock.db.defect.create.mockResolvedValue(defectRow({ id: 30, seq: 12, title: 'Broken' }));
    const dto = await service.create(
      ctx,
      me,
      createDefectSchema.parse({ title: 'Broken', runCaseId: 50, assigneeId: 2 }),
    );
    expect(dto.key).toBe('BUG-12');
    expect(mock.db.user.count).toHaveBeenCalledWith({ where: { id: 2, isActive: true } });
    expect(mock.db.defect.create.mock.calls[0]![0].data).toMatchObject({
      projectId: 10,
      seq: 12,
      steps: 'Do it',
      releaseId: 4,
      reporterId: 1,
    });
    expect(mock.db.defectLink.create).toHaveBeenCalledWith({
      data: { defectId: 30, runCaseId: 50, testCaseId: 100 },
    });
    expect(logged()).toEqual([
      expect.objectContaining({
        action: 'created',
        entityType: 'defect',
        entityId: 30,
        summary: 'Reported BUG-12 Broken from MBS-036 in run KR_01',
      }),
    ]);
  });

  it('reports a standalone defect and validates references first', async () => {
    mock.db.$queryRaw.mockResolvedValue([{ seq: 1 }]);
    mock.db.defect.create.mockResolvedValue(defectRow({ seq: 1, title: 'Typo' }));
    await service.create(ctx, me, createDefectSchema.parse({ title: 'Typo' }));
    expect(mock.db.defectLink.create).not.toHaveBeenCalled();
    expect(logged()[0]!.summary).toBe('Reported BUG-1 Typo');

    mock.db.user.count.mockResolvedValue(0);
    await expect(
      service.create(ctx, me, createDefectSchema.parse({ title: 'x', assigneeId: 9 })),
    ).rejects.toMatchObject({ code: 'UNKNOWN_USER' });
    mock.db.user.count.mockResolvedValue(1);
    mock.db.release.count.mockResolvedValue(0);
    await expect(
      service.create(ctx, me, createDefectSchema.parse({ title: 'x', releaseId: 9 })),
    ).rejects.toMatchObject({ code: 'BAD_RELEASE' });
    mock.db.release.count.mockResolvedValue(1);
    mock.db.runCase.findFirst.mockResolvedValue(null);
    await expect(
      service.create(ctx, me, createDefectSchema.parse({ title: 'x', runCaseId: 9 })),
    ).rejects.toMatchObject({ code: 'RUN_CASE_NOT_FOUND' });
  });

  it('updates only the sent fields and logs them', async () => {
    mock.db.defect.findFirst.mockResolvedValue(defectRow());
    mock.db.defect.update.mockResolvedValue(defectRow({ priority: 'high' }));
    await service.update(ctx, me, 30, { priority: 'high', fixedIn: '1.1.7' });
    const call = mock.db.defect.update.mock.calls[0]![0];
    expect(call.where).toEqual({ id: 30 });
    expect(call.data).toMatchObject({ priority: 'high', fixedIn: '1.1.7' });
    expect(call.data.updatedAt).toBeInstanceOf(Date);
    expect(logged()[0]).toMatchObject({
      action: 'updated',
      summary: 'Updated BUG-12 App shows wrong temperature',
      data: { priority: 'high', fixedIn: '1.1.7' },
    });
    mock.db.defect.findFirst.mockResolvedValue(null);
    await expect(service.update(ctx, me, 31, {})).rejects.toMatchObject({
      code: 'DEFECT_NOT_FOUND',
    });
  });

  describe('transition', () => {
    beforeEach(() => {
      mock.db.defect.findFirst.mockResolvedValue(defectRow({ status: 'new' }));
    });

    it('refuses moves outside the workflow with the allowed targets', async () => {
      await expect(service.transition(ctx, me, 30, { to: 'closed' })).rejects.toMatchObject({
        code: 'INVALID_TRANSITION',
        message: `BUG-12 cannot move from ${DEFECT_STATUS_LABELS.new} to ${DEFECT_STATUS_LABELS.closed}`,
        details: { from: 'new', to: 'closed', allowed: ['open', 'rejected'] },
      });
      expect(mock.db.defect.updateMany).not.toHaveBeenCalled();
    });

    it('moves with a status check, stores the comment and logs the move', async () => {
      mock.db.defect.updateMany.mockResolvedValue({ count: 1 });
      mock.db.defect.findUniqueOrThrow.mockResolvedValue(defectRow({ status: 'rejected' }));
      const dto = await service.transition(ctx, me, 30, { to: 'rejected', comment: 'Works' });
      expect(dto.status).toBe('rejected');
      const call = mock.db.defect.updateMany.mock.calls[0]![0]!;
      expect(call.where).toEqual({ id: 30, status: 'new' });
      expect(call.data).toMatchObject({ status: 'rejected', closedAt: expect.any(Date) });
      expect(mock.db.comment.create).toHaveBeenCalledWith({
        data: { projectId: 10, entityType: 'defect', entityId: 30, body: 'Works', authorId: 1 },
      });
      expect(logged()[0]).toMatchObject({
        action: 'transitioned',
        summary: `BUG-12: ${DEFECT_STATUS_LABELS.new} → ${DEFECT_STATUS_LABELS.rejected}`,
        data: { from: 'new', to: 'rejected' },
      });
    });

    it('answers 409 DEFECT_CHANGED when someone moved it meanwhile', async () => {
      mock.db.defect.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.transition(ctx, me, 30, { to: 'open' })).rejects.toMatchObject({
        code: 'DEFECT_CHANGED',
      });
      expect(mock.db.comment.create).not.toHaveBeenCalled();
      expect(activity.log).not.toHaveBeenCalled();
    });
  });

  it('links results idempotently', async () => {
    mock.db.defect.findFirst.mockResolvedValue(defectRow());
    mock.db.runCase.findFirst.mockResolvedValue({
      ...runCaseRow({ id: 51, testCaseId: null, displayId: 'OPS-2' }),
      run: { ...runRow({ code: 'KR_01' }), plan: planRow() },
    } as never);
    mock.db.defectLink.createMany.mockResolvedValue({ count: 1 });
    await service.link(ctx, me, 30, 51);
    expect(mock.db.defectLink.createMany).toHaveBeenCalledWith({
      data: [{ defectId: 30, runCaseId: 51, testCaseId: null }],
      skipDuplicates: true,
    });
    expect(logged()[0]).toMatchObject({
      action: 'linked',
      summary: 'Linked BUG-12 to OPS-2 in run KR_01',
    });

    mock.db.defectLink.createMany.mockResolvedValue({ count: 0 });
    mock.db.defect.update.mockClear();
    await service.link(ctx, me, 30, 51);
    expect(mock.db.defect.update).not.toHaveBeenCalled();
    expect(activity.log).toHaveBeenCalledTimes(1);
  });

  it('unlinks results of this defect only', async () => {
    mock.db.defect.findFirst.mockResolvedValue(defectRow());
    mock.db.defectLink.deleteMany.mockResolvedValue({ count: 0 });
    await expect(service.unlink(ctx, me, 30, 999)).rejects.toMatchObject({
      code: 'LINK_NOT_FOUND',
      message: 'Defect link not found',
    });
    expect(mock.db.defectLink.deleteMany).toHaveBeenCalledWith({
      where: { id: 999, defectId: 30 },
    });
    mock.db.defectLink.deleteMany.mockResolvedValue({ count: 1 });
    await service.unlink(ctx, me, 30, 5);
    expect(logged()[0]).toMatchObject({
      action: 'unlinked',
      summary: 'Removed a result link from BUG-12',
    });
  });

  it('deletes the defect with its comments and files', async () => {
    mock.db.defect.findFirst.mockResolvedValue(defectRow());
    mock.db.comment.findMany.mockResolvedValue([{ id: 4 }] as never);
    mock.db.attachment.findMany
      .mockResolvedValueOnce([{ storageKey: 'files/c' }] as never)
      .mockResolvedValueOnce([{ storageKey: 'files/d' }] as never);
    await service.remove(ctx, me, 30);
    expect(mock.db.defect.delete).toHaveBeenCalledWith({ where: { id: 30 } });
    expect(logged()[0]).toMatchObject({
      action: 'deleted',
      summary: 'Deleted BUG-12 App shows wrong temperature',
    });
    expect(storage.removeMany).toHaveBeenCalledWith(['files/c', 'files/d']);
  });
});

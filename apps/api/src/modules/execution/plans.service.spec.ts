import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Prisma } from '@tmt/database';
import type { PlanDTO } from '@tmt/shared';
import {
  attachmentRow,
  authUser,
  planRow,
  projectCtx,
  unitConfig,
} from '../../../test/unit/fixtures.js';
import { createPrismaMock, type PrismaMock } from '../../../test/unit/prisma-mock.js';
import type { ActivityService } from '../activity/activity.service.js';
import type { StorageService } from '../storage/storage.service.js';
import type { UploadService } from '../storage/upload.service.js';
import { PlansService } from './plans.service.js';

const uniqueViolation = (index: string) =>
  new Prisma.PrismaClientKnownRequestError('dup', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { driverAdapterError: { cause: { constraint: { index } } } },
  });
const multipart = { is: () => 'multipart/form-data' as const };

describe('PlansService', () => {
  const me = authUser({ id: 1 });
  const ctx = projectCtx();
  let mock: PrismaMock;
  let activity: { log: jest.Mock<ActivityService['log']> };
  let storage: { removeMany: jest.Mock<StorageService['removeMany']> };
  let uploads: { store: jest.Mock<UploadService['store']> };
  let service: PlansService;

  beforeEach(() => {
    mock = createPrismaMock();
    activity = { log: jest.fn<ActivityService['log']>().mockResolvedValue(undefined) };
    storage = { removeMany: jest.fn<StorageService['removeMany']>().mockResolvedValue(undefined) };
    uploads = { store: jest.fn<UploadService['store']>() };
    service = new PlansService(
      mock.prisma,
      unitConfig({ DEFAULT_DOC_NO_PATTERN: 'DOC-{YYYY}-{SEQ}' }),
      activity as unknown as ActivityService,
      storage as unknown as StorageService,
      uploads as unknown as UploadService,
    );
    jest.spyOn(service, 'get').mockResolvedValue({ id: 7 } as PlanDTO);
  });

  it('lists plans newest first, optionally of one release', async () => {
    mock.db.testPlan.findMany.mockResolvedValue([]);
    await service.list(10, 5);
    await service.list(10);
    expect(mock.db.testPlan.findMany.mock.calls.map((c) => c[0]!.where)).toEqual([
      { projectId: 10, releaseId: 5 },
      { projectId: 10 },
    ]);
    expect(mock.db.testPlan.findMany.mock.calls[0]![0]!.orderBy).toEqual([
      { createdAt: 'desc' },
      { id: 'desc' },
    ]);
  });

  it('suggests the next document number of the project pattern or the default', async () => {
    const now = new Date(2026, 9, 15);
    mock.db.project.findUnique.mockResolvedValue({ docNoPattern: '{YY}TR-X-{MM}-{SEQ}' } as never);
    mock.db.testPlan.findMany.mockResolvedValue([
      { docNo: '26TR-X-10- 3' },
      { docNo: 'other' },
    ] as never);
    expect(await service.suggestDocNo(10, now)).toEqual({ docNo: '26TR-X-10-4' });
    mock.db.project.findUnique.mockResolvedValue({ docNoPattern: '' } as never);
    expect(await service.suggestDocNo(10, now)).toEqual({ docNo: 'DOC-2026-1' });
  });

  describe('create', () => {
    it('creates the plan and logs it', async () => {
      mock.db.testPlan.create.mockResolvedValue(planRow({ id: 7 }));
      await service.create(ctx, me, { docNo: 'D-1', title: 'T', templateId: null });
      expect(mock.db.testPlan.create.mock.calls[0]![0].data).toMatchObject({
        projectId: 10,
        docNo: 'D-1',
        releaseId: null,
        templateId: null,
        createdById: 1,
      });
      expect(activity.log.mock.calls[0]![1]).toMatchObject({
        entityType: 'plan',
        action: 'created',
        summary: 'Created test plan 26TR-TEAM-10-001 FW 2.4 system test',
      });
      expect(service.get).toHaveBeenCalledWith(10, 7);
    });

    it('validates release and template and maps duplicate doc numbers', async () => {
      mock.db.release.count.mockResolvedValue(0);
      await expect(
        service.create(ctx, me, { docNo: 'D', title: 'T', releaseId: 9 }),
      ).rejects.toMatchObject({ code: 'BAD_RELEASE' });
      mock.db.reportTemplate.count.mockResolvedValue(0);
      await expect(
        service.create(ctx, me, { docNo: 'D', title: 'T', templateId: 4 }),
      ).rejects.toMatchObject({ code: 'BAD_TEMPLATE' });
      mock.db.testPlan.create.mockRejectedValue(
        uniqueViolation('test_plans_project_id_doc_no_key'),
      );
      await expect(service.create(ctx, me, { docNo: 'D-1', title: 'T' })).rejects.toMatchObject({
        code: 'DOC_NO_TAKEN',
        message: 'Doc no. D-1 is already used in this project',
      });
    });
  });

  it('updates only the given fields of an editable plan', async () => {
    mock.db.testPlan.findFirst.mockResolvedValue(planRow({ status: 'completed' }));
    await expect(service.update(ctx, me, 7, { title: 'x' })).rejects.toMatchObject({
      code: 'PLAN_LOCKED',
    });
    mock.db.testPlan.findFirst.mockResolvedValue(planRow());
    mock.db.testPlan.findUnique.mockResolvedValue(planRow());
    await service.update(ctx, me, 7, { docNo: 'D-2', overallJudgement: 'pass', templateId: null });
    expect(mock.db.$queryRaw).toHaveBeenCalled();
    expect(mock.db.testPlan.update.mock.calls[0]![0].data).toEqual({
      docNo: 'D-2',
      templateId: null,
      overallJudgement: 'pass',
    });
    expect(activity.log.mock.calls[0]![1]).toMatchObject({
      action: 'updated',
      summary: 'Updated test plan D-2',
    });
  });

  it('deletes a plan with the comments and files of its run cases', async () => {
    mock.db.testPlan.findFirst.mockResolvedValue(planRow());
    mock.db.testPlan.findUnique.mockResolvedValue(planRow());
    mock.db.runCase.findMany.mockResolvedValue([{ id: 50 }, { id: 51 }] as never);
    mock.db.comment.findMany.mockResolvedValue([]);
    mock.db.attachment.findMany
      .mockResolvedValueOnce([{ storageKey: 'files/a' }] as never)
      .mockResolvedValueOnce([{ storageKey: 'files/signed' }] as never);
    await service.remove(ctx, me, 7);
    expect(mock.db.runCase.findMany.mock.calls[0]![0]!.where).toEqual({ run: { planId: 7 } });
    expect(mock.db.attachment.findMany.mock.calls.map((c) => c[0]!.where)).toEqual([
      { entityType: 'run_case', entityId: { in: [50, 51] } },
      { entityType: 'plan', entityId: { in: [7] } },
    ]);
    expect(mock.db.testPlan.delete).toHaveBeenCalledWith({ where: { id: 7 } });
    expect(storage.removeMany).toHaveBeenCalledWith(['files/a', 'files/signed']);
    expect(activity.log.mock.calls[0]![1]).toMatchObject({ action: 'deleted' });
  });

  it('completes and reopens plans idempotently', async () => {
    mock.db.testPlan.findFirst.mockResolvedValue(planRow({ status: 'in_progress' }));
    await service.complete(ctx, me, 7);
    expect(mock.db.testPlan.update.mock.calls[0]![0].data).toMatchObject({
      status: 'completed',
      completedById: 1,
    });
    expect(activity.log.mock.calls[0]![1]).toMatchObject({
      action: 'completed',
      summary: 'Completed test plan 26TR-TEAM-10-001 — results locked',
    });
    await service.reopen(ctx, me, 7);
    expect(mock.db.testPlan.update).toHaveBeenCalledTimes(1);

    mock.db.testPlan.findFirst.mockResolvedValue(planRow({ status: 'completed' }));
    await service.complete(ctx, me, 7);
    expect(mock.db.testPlan.update).toHaveBeenCalledTimes(1);
    await service.reopen(ctx, me, 7);
    expect(mock.db.testPlan.update.mock.calls[1]![0].data).toEqual({
      status: 'in_progress',
      completedAt: null,
      completedById: null,
    });
    expect(activity.log.mock.calls[1]![1]).toMatchObject({ action: 'reopened' });
  });

  it('returns the matrix without the cell counts', async () => {
    mock.db.testPlan.findFirst.mockResolvedValue(planRow());
    mock.db.testRun.findMany.mockResolvedValue([]);
    expect(await service.matrix(10, 7, 'type')).toEqual({ groupBy: 'type', groups: [], rows: [] });
  });

  describe('signed copy', () => {
    const stored = {
      fileName: 'scan.pdf',
      mimeType: 'application/pdf',
      stored: { storageKey: 'files/new', sizeBytes: 3, sha256: 'x' },
    };

    it('needs a completed plan and a multipart upload', async () => {
      mock.db.testPlan.findFirst.mockResolvedValue(planRow());
      await expect(
        service.uploadSignedCopy(ctx, me, 7, multipart, undefined),
      ).rejects.toMatchObject({ code: 'PLAN_NOT_COMPLETED' });
      mock.db.testPlan.findFirst.mockResolvedValue(planRow({ status: 'completed' }));
      await expect(
        service.uploadSignedCopy(ctx, me, 7, { is: () => false }, undefined),
      ).rejects.toMatchObject({ code: 'MULTIPART_REQUIRED' });
    });

    it('replaces the previous signed copy and removes its file', async () => {
      mock.db.testPlan.findFirst.mockResolvedValue(
        planRow({ status: 'completed', signedCopyId: 'old' }),
      );
      mock.db.attachment.findUnique.mockResolvedValue({ storageKey: 'files/old' } as never);
      mock.db.attachment.create.mockResolvedValue(attachmentRow({ id: 'new' }));
      uploads.store.mockResolvedValue(stored);
      (service.get as jest.Mock).mockResolvedValue({ signedCopy: { id: 'new' } } as never);
      expect(await service.uploadSignedCopy(ctx, me, 7, multipart, undefined)).toEqual({
        id: 'new',
      });
      expect(uploads.store.mock.calls[0]![1]!.allowExtensions).toEqual(
        new Set(['pdf', 'png', 'jpg', 'jpeg']),
      );
      expect(mock.db.attachment.create.mock.calls[0]![0].data).toMatchObject({
        entityType: 'plan',
        entityId: 7,
        storageKey: 'files/new',
        createdById: 1,
      });
      expect(mock.db.testPlan.update.mock.calls[0]![0].data).toEqual({ signedCopyId: 'new' });
      expect(mock.db.attachment.deleteMany).toHaveBeenCalledWith({ where: { id: 'old' } });
      expect(storage.removeMany).toHaveBeenCalledWith(['files/old']);
      expect(activity.log.mock.calls[0]![1]).toMatchObject({
        action: 'signed_copy_attached',
        summary: 'Attached signed copy scan.pdf to 26TR-TEAM-10-001',
      });
    });

    it('removes the stored file when the database write fails', async () => {
      mock.db.testPlan.findFirst.mockResolvedValue(planRow({ status: 'completed' }));
      uploads.store.mockResolvedValue(stored);
      mock.db.attachment.create.mockRejectedValue(new Error('db down'));
      await expect(service.uploadSignedCopy(ctx, me, 7, multipart, undefined)).rejects.toThrow(
        'db down',
      );
      expect(storage.removeMany).toHaveBeenCalledWith(['files/new']);
    });

    it('deletes the signed copy (no-op without one)', async () => {
      mock.db.testPlan.findFirst.mockResolvedValue(planRow());
      await service.deleteSignedCopy(ctx, me, 7);
      expect(mock.db.$transaction).not.toHaveBeenCalled();
      mock.db.testPlan.findFirst.mockResolvedValue(planRow({ signedCopyId: 'a' }));
      mock.db.attachment.findUnique.mockResolvedValue(attachmentRow({ storageKey: 'files/a' }));
      await service.deleteSignedCopy(ctx, me, 7);
      expect(mock.db.testPlan.update.mock.calls[0]![0].data).toEqual({ signedCopyId: null });
      expect(storage.removeMany).toHaveBeenCalledWith(['files/a']);
      expect(activity.log.mock.calls[0]![1]).toMatchObject({ action: 'signed_copy_removed' });
    });
  });
});

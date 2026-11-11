import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  attachmentRow,
  authUser,
  planRow,
  projectCtx,
  runCaseRow,
  runRow,
} from '../../../test/unit/fixtures.js';
import { createPrismaMock, type PrismaMock } from '../../../test/unit/prisma-mock.js';
import type { ActivityService } from '../activity/activity.service.js';
import type { StorageService } from '../storage/storage.service.js';
import type { MultipartFile, UploadService } from '../storage/upload.service.js';
import { AttachmentsService } from './attachments.service.js';

const multipart = { is: () => 'multipart/form-data' as const };
const json = { is: () => false as const };
const file: MultipartFile = { originalname: 'shot.png', size: 3, buffer: Buffer.from('abc') };
const stored = {
  fileName: 'shot.png',
  mimeType: 'image/png',
  stored: { storageKey: 'files/2026/11/new', sizeBytes: 3, sha256: 'f'.repeat(64) },
};
const ID = attachmentRow().id;

describe('AttachmentsService', () => {
  let mock: PrismaMock;
  let activity: { log: jest.Mock<ActivityService['log']> };
  let storage: {
    removeMany: jest.Mock<StorageService['removeMany']>;
    exists: jest.Mock<StorageService['exists']>;
    openReadStream: jest.Mock<(key: string) => Readable>;
  };
  let uploads: { store: jest.Mock<UploadService['store']> };
  let service: AttachmentsService;

  /** The run case 50 of plan D-1 with the given plan status. */
  function runCaseOfPlan(status: 'in_progress' | 'completed') {
    mock.db.runCase.findFirst.mockResolvedValue({
      ...runCaseRow({ id: 50, displayId: 'MBS-036' }),
      run: { ...runRow(), plan: planRow({ docNo: 'D-1', status }) },
    } as never);
  }

  beforeEach(() => {
    mock = createPrismaMock();
    activity = { log: jest.fn<ActivityService['log']>().mockResolvedValue(undefined) };
    storage = {
      removeMany: jest.fn<StorageService['removeMany']>().mockResolvedValue(undefined),
      exists: jest.fn<StorageService['exists']>().mockResolvedValue(true),
      openReadStream: jest.fn((_key: string) => Readable.from(['data'])),
    };
    uploads = { store: jest.fn<UploadService['store']>().mockResolvedValue(stored) };
    service = new AttachmentsService(
      mock.prisma,
      activity as unknown as ActivityService,
      storage as unknown as StorageService,
      uploads as unknown as UploadService,
    );
    mock.db.user.findMany.mockResolvedValue([]);
  });

  it('lists the attachments of an entity', async () => {
    mock.db.attachment.findMany.mockResolvedValue([attachmentRow()]);
    const list = await service.list(10, 'defect', 30);
    expect(list.map((a) => a.url)).toEqual([`/api/v1/projects/10/attachments/${ID}/download`]);
    expect(mock.db.attachment.findMany.mock.calls[0]![0]!.where).toEqual({
      projectId: 10,
      entityType: 'defect',
      entityId: { in: [30] },
    });
  });

  describe('upload', () => {
    it('requires multipart and stores nothing otherwise', async () => {
      await expect(
        service.upload(projectCtx(), authUser(), json, file, {
          entityType: 'run_case',
          entityId: 50,
        }),
      ).rejects.toMatchObject({ code: 'MULTIPART_REQUIRED' });
      expect(uploads.store).not.toHaveBeenCalled();
    });

    it('attaches the stored file to the entity and logs it', async () => {
      runCaseOfPlan('in_progress');
      mock.db.attachment.create.mockResolvedValue(attachmentRow({ entityType: 'run_case' }));
      const dto = await service.upload(projectCtx(), authUser({ id: 1 }), multipart, file, {
        entityType: 'run_case',
        entityId: 50,
      });
      expect(dto.entityType).toBe('run_case');
      expect(uploads.store).toHaveBeenCalledWith(file);
      expect(mock.db.attachment.create).toHaveBeenCalledWith({
        data: {
          projectId: 10,
          entityType: 'run_case',
          entityId: 50,
          fileName: 'shot.png',
          mimeType: 'image/png',
          sizeBytes: 3,
          sha256: 'f'.repeat(64),
          storageKey: 'files/2026/11/new',
          createdById: 1,
        },
      });
      expect(activity.log.mock.calls[0]![1]).toMatchObject({
        action: 'attachment_added',
        entityType: 'run_case',
        entityId: 50,
        summary: 'Attached shot.png to MBS-036',
      });
      expect(storage.removeMany).not.toHaveBeenCalled();
    });

    it('removes the stored file when the target is locked or missing', async () => {
      runCaseOfPlan('completed');
      await expect(
        service.upload(projectCtx(), authUser(), multipart, file, {
          entityType: 'run_case',
          entityId: 50,
        }),
      ).rejects.toMatchObject({ code: 'PLAN_LOCKED' });
      mock.db.testPlan.findFirst.mockResolvedValue(null);
      await expect(
        service.upload(projectCtx(), authUser(), multipart, file, {
          entityType: 'plan',
          entityId: 9,
        }),
      ).rejects.toMatchObject({ code: 'PLAN_NOT_FOUND' });
      expect(storage.removeMany.mock.calls).toEqual([
        [['files/2026/11/new']],
        [['files/2026/11/new']],
      ]);
      expect(mock.db.attachment.create).not.toHaveBeenCalled();
    });
  });

  describe('download', () => {
    it('answers 404 for malformed, unknown and foreign ids', async () => {
      await expect(service.open(10, null, false)).rejects.toMatchObject({
        code: 'ATTACHMENT_NOT_FOUND',
      });
      expect(mock.db.attachment.findFirst).not.toHaveBeenCalled();
      mock.db.attachment.findFirst.mockResolvedValue(null);
      await expect(service.open(10, ID, false)).rejects.toMatchObject({
        code: 'ATTACHMENT_NOT_FOUND',
      });
      expect(mock.db.attachment.findFirst.mock.calls[0]![0]!.where).toEqual({
        id: ID,
        projectId: 10,
      });
    });

    it('serves safe types inline unless a download is requested', async () => {
      mock.db.attachment.findFirst.mockResolvedValue(attachmentRow({ mimeType: 'image/png' }));
      expect((await service.open(10, ID, false)).inline).toBe(true);
      expect((await service.open(10, ID, true)).inline).toBe(false);
      mock.db.attachment.findFirst.mockResolvedValue(attachmentRow({ mimeType: 'text/csv' }));
      expect((await service.open(10, ID, false)).inline).toBe(false);
      expect(storage.openReadStream).toHaveBeenCalledWith('files/2026/01/x');
    });

    it('reports a lost file as 404 FILE_MISSING', async () => {
      mock.db.attachment.findFirst.mockResolvedValue(attachmentRow());
      storage.exists.mockResolvedValue(false);
      await expect(service.open(10, ID, false)).rejects.toMatchObject({ code: 'FILE_MISSING' });
    });
  });

  describe('remove', () => {
    it('lets only the uploader or a lead delete, never template files', async () => {
      mock.db.attachment.findFirst.mockResolvedValue(attachmentRow({ createdById: 2 }));
      await expect(
        service.remove(projectCtx({ role: 'tester' }), authUser({ id: 3 }), ID),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: 'Only the uploader or a project lead can delete this file',
      });
      mock.db.attachment.findFirst.mockResolvedValue(attachmentRow({ entityType: 'template' }));
      await expect(service.remove(projectCtx(), authUser(), ID)).rejects.toMatchObject({
        code: 'TEMPLATE_FILE',
      });
      expect(mock.db.attachment.delete).not.toHaveBeenCalled();
    });

    it('keeps evidence of completed plans', async () => {
      mock.db.attachment.findFirst.mockResolvedValue(
        attachmentRow({ entityType: 'run_case', entityId: 50 }),
      );
      runCaseOfPlan('completed');
      await expect(service.remove(projectCtx(), authUser(), ID)).rejects.toMatchObject({
        code: 'PLAN_LOCKED',
      });
    });

    it('deletes the row, logs the owner and removes the file after the commit', async () => {
      mock.db.attachment.findFirst.mockResolvedValue(
        attachmentRow({ entityType: 'run_case', entityId: 50, fileName: 'a1.txt' }),
      );
      runCaseOfPlan('in_progress');
      await service.remove(projectCtx({ role: 'tester' }), authUser({ id: 1 }), ID);
      expect(mock.db.attachment.delete).toHaveBeenCalledWith({ where: { id: ID } });
      expect(activity.log.mock.calls[0]![1]).toMatchObject({
        action: 'attachment_deleted',
        entityType: 'run_case',
        entityId: 50,
        summary: 'Deleted a1.txt from MBS-036',
      });
      expect(storage.removeMany).toHaveBeenCalledWith(['files/2026/01/x']);
    });

    it('deletes orphaned files without an owner label', async () => {
      mock.db.attachment.findFirst.mockResolvedValue(attachmentRow({ entityId: 999 }));
      mock.db.defect.findFirst.mockResolvedValue(null);
      await service.remove(projectCtx(), authUser(), ID);
      expect(activity.log.mock.calls[0]![1].summary).toBe('Deleted screen.png');
      mock.db.attachment.findFirst.mockResolvedValue(attachmentRow({ entityId: null }));
      await service.remove(projectCtx(), authUser(), ID);
      expect(activity.log.mock.calls[1]![1].summary).toBe('Deleted screen.png');
    });
  });
});

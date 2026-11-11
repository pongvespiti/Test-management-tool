import fs from 'node:fs';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ExcelJS, TemplateError } from '@tmt/excel';
import {
  authUser,
  planRow,
  projectCtx,
  reportTemplateRow,
  unitConfig,
} from '../../../test/unit/fixtures.js';
import { createPrismaMock, type PrismaMock } from '../../../test/unit/prisma-mock.js';
import type { ActivityService } from '../activity/activity.service.js';
import type { StorageService } from '../storage/storage.service.js';
import type { MultipartFile, UploadService } from '../storage/upload.service.js';
import { PlanExportService } from './plan-export.service.js';
import { looksLikeXlsx } from './templates.queries.js';
import { TemplatesService, withTemplateErrors } from './templates.service.js';

const multipart = { is: () => 'multipart/form-data' as const };
const withFile = (overrides = {}) => ({
  ...reportTemplateRow(overrides),
  attachment: { fileName: 'team.xlsx', storageKey: 'files/t' },
});

async function workbook(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet('RUN').getCell('A1').value = '${run.code}';
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('TemplatesService', () => {
  const me = authUser({ id: 1 });
  const ctx = projectCtx();
  let mock: PrismaMock;
  let activity: { log: jest.Mock<ActivityService['log']> };
  let storage: {
    removeMany: jest.Mock<StorageService['removeMany']>;
    exists: jest.Mock<StorageService['exists']>;
    readBuffer: jest.Mock<StorageService['readBuffer']>;
    openReadStream: jest.Mock<StorageService['openReadStream']>;
  };
  let uploads: { store: jest.Mock<UploadService['store']> };
  let service: TemplatesService;

  beforeEach(() => {
    mock = createPrismaMock();
    activity = { log: jest.fn<ActivityService['log']>().mockResolvedValue(undefined) };
    storage = {
      removeMany: jest.fn<StorageService['removeMany']>().mockResolvedValue(undefined),
      exists: jest.fn<StorageService['exists']>(),
      readBuffer: jest.fn<StorageService['readBuffer']>(),
      openReadStream: jest.fn<StorageService['openReadStream']>(),
    };
    uploads = { store: jest.fn<UploadService['store']>() };
    service = new TemplatesService(
      mock.prisma,
      activity as unknown as ActivityService,
      storage as unknown as StorageService,
      uploads as unknown as UploadService,
    );
    mock.db.user.findMany.mockResolvedValue([]);
  });

  it('lists the built-in template first, default only when no project default exists', async () => {
    mock.db.reportTemplate.findMany.mockResolvedValue([withFile({ isDefault: true })] as never);
    const list = await service.list(10);
    expect(list.map((t) => [t.id, t.isDefault, t.fileName])).toEqual([
      [0, false, 'default-report.xlsx'],
      [4, true, 'team.xlsx'],
    ]);
    mock.db.reportTemplate.findMany.mockResolvedValue([]);
    expect((await service.list(10))[0]!.isDefault).toBe(true);
  });

  describe('upload', () => {
    const stored = {
      fileName: 'team.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      stored: { storageKey: 'files/new', sizeBytes: 10, sha256: 'x' },
    };
    const fields = { name: 'TEAM', isDefault: true, runSheet: 'RUN', suiteId: null };

    it('needs a multipart request', async () => {
      await expect(
        service.upload(ctx, me, { is: () => false }, undefined, fields),
      ).rejects.toMatchObject({ code: 'MULTIPART_REQUIRED' });
    });

    it('refuses files that are not workbooks and removes them', async () => {
      uploads.store.mockResolvedValue(stored);
      const file: MultipartFile = { originalname: 'x.xlsx', size: 3, buffer: Buffer.from('zip?') };
      await expect(service.upload(ctx, me, multipart, file, fields)).rejects.toMatchObject({
        code: 'BAD_TEMPLATE_FILE',
      });
      expect(storage.removeMany).toHaveBeenCalledWith(['files/new']);
      expect(mock.db.attachment.create).not.toHaveBeenCalled();
    });

    it('stores the template, links its attachment and moves the default flag', async () => {
      uploads.store.mockResolvedValue(stored);
      const buffer = await workbook();
      mock.db.attachment.create.mockResolvedValue({ id: 'a-1' } as never);
      mock.db.reportTemplate.create.mockResolvedValue(reportTemplateRow({ id: 9, name: 'TEAM' }));
      mock.db.reportTemplate.findFirst.mockResolvedValue(withFile({ id: 9 }) as never);
      const dto = await service.upload(
        ctx,
        me,
        multipart,
        { originalname: 'team.xlsx', size: buffer.length, buffer },
        fields,
      );
      expect(dto.id).toBe(9);
      expect(mock.db.attachment.create.mock.calls[0]![0].data).toMatchObject({
        entityType: 'template',
        entityId: null,
        storageKey: 'files/new',
      });
      expect(mock.db.reportTemplate.updateMany.mock.calls[0]![0].where).toEqual({
        projectId: 10,
        isDefault: true,
      });
      expect(mock.db.reportTemplate.create.mock.calls[0]![0].data).toMatchObject({
        attachmentId: 'a-1',
        config: { runSheet: 'RUN' },
        isDefault: true,
      });
      expect(mock.db.attachment.update).toHaveBeenCalledWith({
        where: { id: 'a-1' },
        data: { entityId: 9 },
      });
      expect(activity.log.mock.calls[0]![1]).toMatchObject({
        summary: 'Uploaded report template TEAM (team.xlsx)',
      });
    });
  });

  it('updates settings, keeps one default and merges the run sheet into the config', async () => {
    mock.db.reportTemplate.findFirst.mockResolvedValue(
      withFile({ config: { runSheet: 'RUN', x: 1 } }) as never,
    );
    mock.db.suite.count.mockResolvedValue(0);
    await expect(service.update(ctx, me, 4, { suiteId: 99 })).rejects.toMatchObject({
      code: 'BAD_SUITE',
    });
    await service.update(ctx, me, 4, { isDefault: true, runSheet: 'Result' });
    expect(mock.db.reportTemplate.updateMany.mock.calls[0]![0].where).toEqual({
      projectId: 10,
      isDefault: true,
      id: { not: 4 },
    });
    expect(mock.db.reportTemplate.update.mock.calls[0]![0].data).toEqual({
      config: { runSheet: 'Result', x: 1 },
      isDefault: true,
    });
  });

  it('deletes a template with its attachment and file', async () => {
    mock.db.reportTemplate.findFirst.mockResolvedValue(withFile() as never);
    await service.remove(ctx, me, 4);
    expect(mock.db.reportTemplate.delete).toHaveBeenCalledWith({ where: { id: 4 } });
    expect(mock.db.attachment.delete).toHaveBeenCalledWith({
      where: { id: reportTemplateRow().attachmentId },
    });
    expect(storage.removeMany).toHaveBeenCalledWith(['files/t']);
    mock.db.reportTemplate.findFirst.mockResolvedValue(null);
    await expect(service.remove(ctx, me, 5)).rejects.toMatchObject({ code: 'TEMPLATE_NOT_FOUND' });
  });

  it('reports missing template files', async () => {
    jest.spyOn(fs, 'existsSync').mockReturnValueOnce(false);
    await expect(service.download(10, 0)).rejects.toMatchObject({ code: 'TEMPLATE_FILE_MISSING' });
    mock.db.reportTemplate.findFirst.mockResolvedValue(withFile() as never);
    storage.exists.mockResolvedValue(false);
    await expect(service.download(10, 4)).rejects.toMatchObject({ code: 'FILE_MISSING' });
    storage.readBuffer.mockRejectedValue(new Error('ENOENT'));
    await expect(service.resolveTemplate(10, { templateId: 4 })).rejects.toMatchObject({
      code: 'FILE_MISSING',
    });
  });

  it('resolves explicit, plan, project default and built-in templates', async () => {
    mock.db.reportTemplate.findFirst.mockImplementation((async (args: {
      where: { id?: number };
    }) => (args.where.id ? withFile({ id: args.where.id }) : { id: 7 })) as never);
    storage.readBuffer.mockResolvedValue(Buffer.from('xlsx'));
    expect((await service.resolveTemplate(10, { templateId: 4, planTemplateId: 5 })).id).toBe(4);
    expect((await service.resolveTemplate(10, { planTemplateId: 5 })).id).toBe(5);
    expect((await service.resolveTemplate(10, {})).id).toBe(7);
    const builtIn = await service.resolveTemplate(10, { templateId: 0, planTemplateId: 5 });
    expect(builtIn).toMatchObject({ id: 0, builtIn: true, runSheet: 'RUN' });
    expect(builtIn.buffer.length).toBeGreaterThan(1000);
  });

  it('maps template errors to 422 TEMPLATE_INVALID', async () => {
    await expect(
      withTemplateErrors(() => Promise.reject(new TemplateError('RUN_SHEET_NOT_FOUND', 'No RUN'))),
    ).rejects.toMatchObject({
      code: 'TEMPLATE_INVALID',
      message: 'No RUN',
      details: { reason: 'RUN_SHEET_NOT_FOUND' },
    });
    await expect(withTemplateErrors(() => Promise.reject(new Error('x')))).rejects.toThrow('x');
    expect(await looksLikeXlsx(await workbook())).toBe(true);
    expect(await looksLikeXlsx(Buffer.from('nope'))).toBe(false);
  });

  it('exports a plan with the resolved template and a safe file name', async () => {
    const exports = new PlanExportService(mock.prisma, unitConfig(), service);
    mock.db.testPlan.findFirst.mockResolvedValue(planRow({ title: 'Unit/operation: test' }));
    mock.db.testRun.findMany.mockResolvedValue([]);
    mock.db.reportTemplate.findFirst.mockResolvedValue(null);
    const res = await exports.export(ctx, 7);
    expect(res.fileName).toBe('26TR-TEAM-10-001 Unit operation test.xlsx');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.buffer as unknown as ArrayBuffer);
    // Without runs the template's run sheet stays as it is.
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Summary', 'RUN', 'refer']);
  });
});

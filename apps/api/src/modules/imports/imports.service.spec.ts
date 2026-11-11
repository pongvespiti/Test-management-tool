import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { readUpload } from '@tmt/excel';
import { authUser, importRow, projectCtx, suiteRow, userRow } from '../../../test/unit/fixtures.js';
import { createPrismaMock, type PrismaMock } from '../../../test/unit/prisma-mock.js';
import type { ActivityService } from '../activity/activity.service.js';
import { LONG_TX } from '../library/library.errors.js';
import type { ImportUploadStore, UploadMeta } from './import-uploads.service.js';
import { importFile, importFormatError, ImportsService } from './imports.service.js';

const file = (originalname: string, content = 'Title\nA\n') => ({
  originalname,
  size: Buffer.byteLength(content),
  buffer: Buffer.from(content),
});

describe('import file checks', () => {
  it('accepts .xlsx, .xlsm and .csv files only', () => {
    expect(importFile(file('cases.CSV'))).toMatchObject({ fileName: 'cases.CSV' });
    expect(() => importFile(undefined)).toThrow(expect.objectContaining({ code: 'FILE_REQUIRED' }));
    expect(() => importFile(file('old.xls'))).toThrow(
      expect.objectContaining({
        code: 'UNSUPPORTED_FILE_TYPE',
        message: expect.stringContaining('save it as .xlsx'),
      }),
    );
    expect(() => importFile(file('a.pdf'))).toThrow(
      expect.objectContaining({ message: 'Only .xlsx and .csv files can be imported' }),
    );
    expect(() => importFile(file('empty.csv', ''))).toThrow(
      expect.objectContaining({ code: 'EMPTY_FILE' }),
    );
  });

  it('maps engine format errors to HTTP statuses', () => {
    expect(importFormatError({ code: 'FILE_TOO_LARGE', message: 'x' }).getStatus()).toBe(413);
    expect(importFormatError({ code: 'UNSUPPORTED_FILE_TYPE', message: 'x' }).getStatus()).toBe(
      415,
    );
    expect(importFormatError({ code: 'CORRUPT_FILE', message: 'x' }).getStatus()).toBe(422);
  });
});

describe('ImportsService', () => {
  const me = authUser({ id: 1 });
  const ctx = projectCtx({ role: 'tester' });
  const meta: UploadMeta = {
    id: '00000000-0000-4000-8000-000000000000',
    projectId: 10,
    userId: 1,
    fileName: 'cases.csv',
    sizeBytes: 8,
    createdAt: new Date().toISOString(),
  };
  let mock: PrismaMock;
  let store: {
    cleanup: jest.Mock<ImportUploadStore['cleanup']>;
    save: jest.Mock<ImportUploadStore['save']>;
    get: jest.Mock<ImportUploadStore['get']>;
    read: jest.Mock<ImportUploadStore['read']>;
    cachedWorkbook: jest.Mock<ImportUploadStore['cachedWorkbook']>;
    cacheWorkbook: jest.Mock<ImportUploadStore['cacheWorkbook']>;
  };
  let service: ImportsService;

  beforeEach(() => {
    mock = createPrismaMock();
    store = {
      cleanup: jest.fn<ImportUploadStore['cleanup']>().mockRejectedValue(new Error('disk')),
      save: jest.fn<ImportUploadStore['save']>().mockResolvedValue(meta),
      get: jest.fn<ImportUploadStore['get']>().mockResolvedValue(meta),
      read: jest.fn<ImportUploadStore['read']>().mockResolvedValue(Buffer.from('Title\nA\n')),
      cachedWorkbook: jest.fn<ImportUploadStore['cachedWorkbook']>().mockReturnValue(null),
      cacheWorkbook: jest.fn<ImportUploadStore['cacheWorkbook']>(),
    };
    service = new ImportsService(
      mock.prisma,
      store as unknown as ImportUploadStore,
      { log: jest.fn() } as unknown as ActivityService,
    );
  });

  it('stores an upload for its owner and lists its sheets (cleanup failures are ignored)', async () => {
    const res = await service.upload(ctx, me, file('cases.csv'));
    expect(res).toMatchObject({ uploadId: meta.id, fileName: 'cases.csv' });
    expect(res.sheets).toHaveLength(1);
    expect(store.save).toHaveBeenCalledWith(
      { projectId: 10, userId: 1, fileName: 'cases.csv' },
      Buffer.from('Title\nA\n'),
    );
    expect(store.cacheWorkbook).toHaveBeenCalledWith(meta.id, expect.anything());
    await expect(service.upload(ctx, me, file('broken.xlsx', 'not a zip'))).rejects.toMatchObject({
      code: 'CORRUPT_FILE',
    });
  });

  it('analyzes the caller’s upload against the fields of a suite of the project', async () => {
    mock.db.suite.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.analyze(ctx, me, { uploadId: meta.id, suiteId: 99 }),
    ).rejects.toMatchObject({ code: 'BAD_SUITE' });
    expect(mock.db.suite.findFirst.mock.calls[0]![0]!.where).toEqual({ id: 99, projectId: 10 });

    mock.db.suite.findFirst.mockResolvedValue(suiteRow());
    const analysis = await service.analyze(ctx, me, { uploadId: meta.id, suiteId: 2 });
    expect(analysis).toMatchObject({ uploadId: meta.id, fileName: 'cases.csv', headerRow: 1 });
    expect(store.get).toHaveBeenCalledWith(meta.id, { projectId: 10, userId: 1 });
    expect(store.read).toHaveBeenCalledTimes(1);

    store.cachedWorkbook.mockReturnValue(await readUpload(Buffer.from('Title\nB\n'), 'b.csv'));
    await service.analyze(ctx, me, { uploadId: meta.id, sheet: 'nope' }).catch(() => undefined);
    expect(store.read).toHaveBeenCalledTimes(1);
  });

  it('commits in one long transaction', async () => {
    mock.db.$transaction.mockResolvedValue({ importId: 1 } as never);
    await service.commit(ctx, me, {
      uploadId: meta.id,
      sheet: 'x',
      headerRow: 1,
      columns: [{ col: 1, target: 'title' }],
      options: { onDuplicateInFile: 'renumber', onExisting: 'update', saveEnvTemplate: true },
      suiteId: 2,
    });
    expect(mock.db.$transaction).toHaveBeenCalledWith(expect.any(Function), LONG_TX);
  });

  it('lists the latest 50 imports with suite, run and author', async () => {
    mock.db.import.findMany.mockResolvedValue([
      { ...importRow(), suite: { id: 2, name: 'Modbus' }, run: null },
      {
        ...importRow({ id: 5, kind: 'junit', layout: null }),
        suite: null,
        run: { id: 8, code: 'T1' },
      },
    ] as never);
    mock.db.user.findMany.mockResolvedValue([userRow()]);
    const list = await service.list(10);
    expect(list[0]).toEqual({
      id: 4,
      kind: 'cases',
      suite: { id: 2, name: 'Modbus' },
      run: null,
      fileName: 'cases.xlsx',
      sheet: 'Cases',
      layout: 'generic',
      stats: { created: 3 },
      createdBy: { id: 1, username: 'alice', displayName: 'Alice' },
      createdAt: '2026-01-15T08:00:00.000Z',
    });
    expect(list[1]).toMatchObject({
      kind: 'junit',
      suite: null,
      run: { id: 8, code: 'T1' },
      layout: null,
    });
    const args = mock.db.import.findMany.mock.calls[0]![0]!;
    expect(args.where).toEqual({ projectId: 10 });
    expect(args.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
    expect(args.take).toBe(50);
  });
});

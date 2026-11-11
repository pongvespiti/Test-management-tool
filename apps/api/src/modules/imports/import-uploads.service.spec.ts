import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import type { SourceWorkbook } from '@tmt/excel';
import { unitConfig } from '../../../test/unit/fixtures.js';
import { StorageService } from '../storage/storage.service.js';
import { ImportUploadStore, UPLOAD_TTL_MS } from './import-uploads.service.js';

const fakeWorkbook = (name: string) => ({ fileName: name }) as unknown as SourceWorkbook;

describe('ImportUploadStore', () => {
  const owner = { projectId: 10, userId: 1 };
  let dataDir: string;
  let store: ImportUploadStore;

  beforeAll(async () => {
    dataDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'tmt-import-store-'));
    store = new ImportUploadStore(new StorageService(unitConfig({ DATA_DIR: dataDir })));
  });
  afterAll(() => fsp.rm(dataDir, { recursive: true, force: true }));

  it('keeps an upload under DATA_DIR/tmp/imports for its owner only', async () => {
    const meta = await store.save({ ...owner, fileName: 'cases.csv' }, Buffer.from('Title\nA'));
    expect(meta).toMatchObject({ ...owner, fileName: 'cases.csv', sizeBytes: 7 });
    expect(await fsp.readdir(path.join(dataDir, 'tmp', 'imports'))).toEqual(
      expect.arrayContaining([`${meta.id}.json`, `${meta.id}.upload`]),
    );
    await expect(store.get(meta.id, owner)).resolves.toEqual(meta);
    await expect(store.read(meta)).resolves.toEqual(Buffer.from('Title\nA'));
    for (const other of [
      { projectId: 11, userId: 1 },
      { projectId: 10, userId: 2 },
    ]) {
      await expect(store.get(meta.id, other)).rejects.toMatchObject({ code: 'UPLOAD_NOT_FOUND' });
    }
    await expect(store.get('../etc/passwd', owner)).rejects.toMatchObject({
      getStatus: expect.any(Function),
      code: 'UPLOAD_NOT_FOUND',
    });
    await expect(store.get(crypto.randomUUID(), owner)).rejects.toMatchObject({
      code: 'UPLOAD_NOT_FOUND',
    });
  });

  it('expires uploads after 2 hours and removes their files', async () => {
    const meta = await store.save({ ...owner, fileName: 'old.csv' }, Buffer.from('x'));
    const later = Date.parse(meta.createdAt) + UPLOAD_TTL_MS + 1;
    await expect(store.get(meta.id, owner, later)).rejects.toMatchObject({
      code: 'UPLOAD_NOT_FOUND',
    });
    const files = await fsp.readdir(await store.dir());
    expect(files.some((f) => f.startsWith(meta.id))).toBe(false);
  });

  it('cleans up expired uploads and orphan data files', async () => {
    const live = await store.save({ ...owner, fileName: 'live.csv' }, Buffer.from('x'));
    const dir = await store.dir();
    const orphan = crypto.randomUUID();
    await fsp.writeFile(path.join(dir, `${orphan}.upload`), 'x');
    await fsp.writeFile(path.join(dir, 'README.txt'), 'not an upload');
    expect(await store.cleanup()).toBe(0);
    const removed = await store.cleanup(Date.now() + UPLOAD_TTL_MS + 60_000);
    expect(removed).toBeGreaterThanOrEqual(2);
    const left = await fsp.readdir(dir);
    expect(left.some((f) => f.startsWith(live.id) || f.startsWith(orphan))).toBe(false);
    expect(left).toContain('README.txt');
  });

  it('caches the three most recent parsed workbooks for ten minutes', () => {
    store.cacheWorkbook('a', fakeWorkbook('a'), 0);
    store.cacheWorkbook('b', fakeWorkbook('b'), 0);
    store.cacheWorkbook('c', fakeWorkbook('c'), 0);
    expect(store.cachedWorkbook('a', 1)?.fileName).toBe('a'); // a is now the most recent
    store.cacheWorkbook('d', fakeWorkbook('d'), 2);
    expect(store.cachedWorkbook('b', 3)).toBeNull();
    expect(store.cachedWorkbook('c', 3)?.fileName).toBe('c');
    expect(store.cachedWorkbook('d', 11 * 60_000)).toBeNull();
  });
});

import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { unitConfig } from '../../../test/unit/fixtures.js';
import { StorageService } from './storage.service.js';

describe('StorageService', () => {
  let dir: string;
  let storage: StorageService;

  beforeAll(async () => {
    dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'tmt-storage-'));
    storage = new StorageService(unitConfig({ DATA_DIR: dir, MAX_UPLOAD_MB: '1' }));
  });

  afterAll(() => fsp.rm(dir, { recursive: true, force: true }));

  it('saves a buffer under an opaque dated key and reads it back', async () => {
    const stored = await storage.saveBuffer(Buffer.from('evidence'));
    expect(stored.storageKey).toMatch(/^files\/\d{4}\/\d{2}\/[0-9a-f-]{36}$/);
    expect(stored.sizeBytes).toBe(8);
    expect(stored.sha256).toHaveLength(64);
    await expect(storage.readBuffer(stored.storageKey)).resolves.toEqual(Buffer.from('evidence'));
    await expect(storage.exists(stored.storageKey)).resolves.toBe(true);
    await storage.remove(stored.storageKey);
    await expect(storage.exists(stored.storageKey)).resolves.toBe(false);
  });

  it('refuses files above MAX_UPLOAD_MB', async () => {
    await expect(storage.saveBuffer(Buffer.alloc(1024 * 1024 + 1))).rejects.toMatchObject({
      code: 'FILE_TOO_LARGE',
    });
  });

  it('never resolves keys outside the data directory', () => {
    expect(() => storage.resolve('../etc/passwd')).toThrow('Invalid file reference');
    expect(() => storage.resolve('/etc/passwd')).toThrow('Invalid file reference');
    expect(storage.resolve('files/2026/01/x')).toBe(path.join(dir, 'files/2026/01/x'));
  });

  it('creates temporary folders on demand', async () => {
    const tmp = await storage.tempDir('imports');
    await expect(fsp.stat(tmp)).resolves.toMatchObject({});
    expect(tmp).toBe(path.join(dir, 'tmp', 'imports'));
  });
});

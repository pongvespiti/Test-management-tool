import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Injectable } from '@nestjs/common';
import { AppConfig } from '../../config/app-config.js';
import { AppException, badRequest } from '../../common/errors/app.exception.js';

export interface StoredFile {
  storageKey: string;
  sizeBytes: number;
  sha256: string;
}

/**
 * File storage on the local disk under `DATA_DIR/files/YYYY/MM/<uuid>` (uploads, evidence,
 * signed reports, templates). Keys are opaque and never derived from client file names.
 */
@Injectable()
export class StorageService {
  private readonly root: string;

  constructor(private readonly config: AppConfig) {
    this.root = path.resolve(config.dataDir);
  }

  /** Absolute path of a storage key, refusing anything that escapes the data directory. */
  resolve(storageKey: string): string {
    const full = path.resolve(this.root, storageKey);
    if (!full.startsWith(this.root + path.sep)) {
      throw badRequest('BAD_STORAGE_KEY', 'Invalid file reference');
    }
    return full;
  }

  async saveBuffer(buf: Buffer): Promise<StoredFile> {
    if (buf.length > this.config.maxUploadBytes) {
      throw new AppException(
        413,
        'FILE_TOO_LARGE',
        `File is larger than ${Math.round(this.config.maxUploadBytes / 1024 / 1024)} MB`,
      );
    }
    const storageKey = this.newKey();
    const full = this.resolve(storageKey);
    await fsp.mkdir(path.dirname(full), { recursive: true });
    await fsp.writeFile(full, buf, { flag: 'wx' });
    return {
      storageKey,
      sizeBytes: buf.length,
      sha256: createHash('sha256').update(buf).digest('hex'),
    };
  }

  openReadStream(storageKey: string): fs.ReadStream {
    return fs.createReadStream(this.resolve(storageKey));
  }

  readBuffer(storageKey: string): Promise<Buffer> {
    return fsp.readFile(this.resolve(storageKey));
  }

  async exists(storageKey: string): Promise<boolean> {
    try {
      await fsp.access(this.resolve(storageKey));
      return true;
    } catch {
      return false;
    }
  }

  async remove(storageKey: string): Promise<void> {
    await fsp.rm(this.resolve(storageKey), { force: true });
  }

  /** Best-effort removal of files whose rows are gone (never throws). */
  async removeMany(keys: Iterable<string | null | undefined>): Promise<void> {
    await Promise.all(
      [...keys]
        .filter((k): k is string => typeof k === 'string' && k !== '')
        .map((k) => this.remove(k).catch(() => undefined)),
    );
  }

  /** Directory for temporary files of one feature (e.g. pending imports), created on demand. */
  async tempDir(name: string): Promise<string> {
    const dir = this.resolve(path.join('tmp', name));
    await fsp.mkdir(dir, { recursive: true });
    return dir;
  }

  private newKey(): string {
    const now = new Date();
    const yyyy = String(now.getFullYear());
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    return path.posix.join('files', yyyy, mm, randomUUID());
  }
}

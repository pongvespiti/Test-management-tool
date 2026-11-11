/**
 * Pending import uploads (ADR-005: upload token, 2 h) under `DATA_DIR/tmp/imports/`, so the wizard
 * can re-analyse another sheet / header row / mapping without uploading again. An upload is bound
 * to the project and the user who uploaded it; expired uploads are removed lazily.
 */
import { randomUUID } from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Injectable } from '@nestjs/common';
import type { SourceWorkbook } from '@tmt/excel';
import { AppException } from '../../common/errors/app.exception.js';
import { StorageService } from '../storage/storage.service.js';

export const UPLOAD_TTL_MS = 2 * 60 * 60 * 1000;
/** Parsed workbooks kept in memory (the wizard analyses, previews and commits the same upload). */
const CACHE_SIZE = 3;
const CACHE_TTL_MS = 10 * 60 * 1000;
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface UploadOwner {
  projectId: number;
  userId: number;
}

export interface UploadMeta extends UploadOwner {
  id: string;
  fileName: string;
  sizeBytes: number;
  createdAt: string;
}

function uploadNotFound(): AppException {
  return new AppException(
    404,
    'UPLOAD_NOT_FOUND',
    'The uploaded file is no longer available (uploads expire after 2 hours) — upload it again',
  );
}

/** Temporary storage of import uploads plus a small cache of their parsed workbooks. */
@Injectable()
export class ImportUploadStore {
  private readonly workbooks = new Map<string, { wb: SourceWorkbook; at: number }>();

  constructor(private readonly storage: StorageService) {}

  /** Directory of pending uploads (created on demand). */
  dir(): Promise<string> {
    return this.storage.tempDir('imports');
  }

  /** Stores the file and its owner metadata; returns the metadata with the new upload id. */
  async save(owner: UploadOwner & { fileName: string }, buffer: Buffer): Promise<UploadMeta> {
    const dir = await this.dir();
    const meta: UploadMeta = {
      id: randomUUID(),
      ...owner,
      sizeBytes: buffer.length,
      createdAt: new Date().toISOString(),
    };
    await fsp.writeFile(path.join(dir, `${meta.id}.upload`), buffer, { flag: 'wx' });
    await fsp.writeFile(path.join(dir, `${meta.id}.json`), JSON.stringify(meta), { flag: 'wx' });
    return meta;
  }

  /** Metadata of a live upload of this project and user; 404 UPLOAD_NOT_FOUND otherwise. */
  async get(id: string, owner: UploadOwner, now = Date.now()): Promise<UploadMeta> {
    if (!ID_RE.test(id)) throw uploadNotFound();
    let meta: UploadMeta;
    try {
      const raw = await fsp.readFile(path.join(await this.dir(), `${id}.json`), 'utf8');
      meta = JSON.parse(raw) as UploadMeta;
    } catch {
      throw uploadNotFound();
    }
    if (meta.projectId !== owner.projectId || meta.userId !== owner.userId) throw uploadNotFound();
    if (now - Date.parse(meta.createdAt) > UPLOAD_TTL_MS) {
      await this.remove(id);
      throw uploadNotFound();
    }
    return meta;
  }

  /** The uploaded bytes (404 UPLOAD_NOT_FOUND when the file vanished). */
  async read(meta: UploadMeta): Promise<Buffer> {
    try {
      return await fsp.readFile(path.join(await this.dir(), `${meta.id}.upload`));
    } catch {
      throw uploadNotFound();
    }
  }

  /** Removes expired uploads (and orphan files older than the TTL). Returns how many were removed. */
  async cleanup(now = Date.now()): Promise<number> {
    const dir = await this.dir();
    const names = await fsp.readdir(dir);
    let removed = 0;
    for (const id of new Set(names.map((n) => n.replace(/\.(upload|json)$/, '')))) {
      if (!ID_RE.test(id)) continue;
      const createdAt = await this.createdAt(dir, id);
      if (createdAt === null) continue;
      if (!(now - createdAt <= UPLOAD_TTL_MS)) {
        await this.remove(id);
        removed++;
      }
    }
    return removed;
  }

  /** The parsed workbook of an upload, if still cached. */
  cachedWorkbook(id: string, now = Date.now()): SourceWorkbook | null {
    const hit = this.workbooks.get(id);
    if (!hit) return null;
    this.workbooks.delete(id);
    if (now - hit.at > CACHE_TTL_MS) return null;
    // Re-inserted as the most recently used entry.
    this.workbooks.set(id, { wb: hit.wb, at: now });
    return hit.wb;
  }

  cacheWorkbook(id: string, wb: SourceWorkbook, now = Date.now()): void {
    this.workbooks.delete(id);
    this.workbooks.set(id, { wb, at: now });
    while (this.workbooks.size > CACHE_SIZE) {
      this.workbooks.delete(this.workbooks.keys().next().value as string);
    }
  }

  /** Creation time from the metadata, or the data file's mtime for orphans; null when gone. */
  private async createdAt(dir: string, id: string): Promise<number | null> {
    try {
      const meta = JSON.parse(
        await fsp.readFile(path.join(dir, `${id}.json`), 'utf8'),
      ) as UploadMeta;
      return Date.parse(meta.createdAt);
    } catch {
      try {
        return (await fsp.stat(path.join(dir, `${id}.upload`))).mtimeMs;
      } catch {
        return null;
      }
    }
  }

  private async remove(id: string): Promise<void> {
    const dir = await this.dir();
    await Promise.all([
      fsp.rm(path.join(dir, `${id}.upload`), { force: true }),
      fsp.rm(path.join(dir, `${id}.json`), { force: true }),
    ]);
    this.workbooks.delete(id);
  }
}

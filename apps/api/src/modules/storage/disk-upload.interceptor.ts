import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import {
  applyDecorators,
  Injectable,
  PayloadTooLargeException,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, type MulterModuleOptions } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes } from '@nestjs/swagger';
import { catchError, from, mergeMap, throwError, type Observable } from 'rxjs';
import { AppConfig } from '../../config/app-config.js';
import { AppException } from '../../common/errors/app.exception.js';
import { StorageService } from './storage.service.js';
import { UPLOAD_FIELD } from './upload.decorator.js';

/** Sub-directory of `DATA_DIR/tmp` that receives streamed uploads before they are adopted. */
export const UPLOAD_TEMP_DIR = 'uploads';

/** What the disk storage engine adds to multer's file object. */
export interface DiskFileFields {
  path: string;
  size: number;
  sha256: string;
}

interface MulterFileIn {
  stream: Readable;
}
type Done = (error: unknown, info?: Partial<DiskFileFields>) => void;

/**
 * multer storage engine that streams the part to `dir/<uuid>` and hashes it on the way, so a
 * 500 MB video never sits in memory. multer enforces `limits.fileSize` and calls `_removeFile`
 * when the request fails, so partial files do not stay behind.
 */
export function hashingDiskStorage(dir: () => Promise<string>) {
  return {
    _handleFile(_req: unknown, file: MulterFileIn, cb: Done): void {
      void (async () => {
        const target = path.join(await dir(), randomUUID());
        const hash = createHash('sha256');
        let size = 0;
        file.stream.on('data', (chunk: Buffer) => {
          hash.update(chunk);
          size += chunk.length;
        });
        try {
          await pipeline(file.stream, fs.createWriteStream(target, { flags: 'wx' }));
          cb(null, { path: target, size, sha256: hash.digest('hex') });
        } catch (e) {
          await fsp.rm(target, { force: true });
          cb(e);
        }
      })().catch(cb);
    },
    _removeFile(_req: unknown, file: { path?: string }, cb: (error: Error | null) => void): void {
      if (!file.path) return cb(null);
      fsp.rm(file.path, { force: true }).then(
        () => cb(null),
        (e: Error) => cb(e),
      );
    },
  };
}

/**
 * `@UseInterceptors` target for large uploads: the `file` field streamed to disk with the
 * MAX_ATTACHMENT_MB limit. Built per instance because the limit and directory come from config.
 */
@Injectable()
export class DiskFileInterceptor implements NestInterceptor {
  private readonly inner: NestInterceptor;

  constructor(
    private readonly config: AppConfig,
    private readonly storage: StorageService,
  ) {
    const Mixin = FileInterceptor(UPLOAD_FIELD);
    const options = {
      storage: hashingDiskStorage(() => this.storage.tempDir(UPLOAD_TEMP_DIR)),
      limits: { fileSize: config.maxAttachmentBytes, files: 1, fields: 50 },
      defParamCharset: 'utf8',
    } as MulterModuleOptions;
    this.inner = new Mixin(options) as NestInterceptor;
  }

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const req = context.switchToHttp().getRequest<{ file?: { path?: string } }>();
    let handled: Observable<unknown>;
    try {
      handled = (await this.inner.intercept(context, next)) as Observable<unknown>;
    } catch (e) {
      if (e instanceof PayloadTooLargeException) {
        const max = this.config.maxAttachmentBytes;
        const limit =
          max >= 1024 * 1024
            ? `${Math.round(max / 1024 / 1024)} MB`
            : `${Math.ceil(max / 1024)} KB`;
        throw new AppException(413, 'FILE_TOO_LARGE', `File is larger than ${limit}`);
      }
      throw e;
    }
    // A refused upload (validation, type, failed database write) must not leave its temporary
    // file behind. Removed before the error response goes out. After success the file has been
    // moved into storage, so nothing is left to remove.
    return handled.pipe(
      catchError((err: unknown) => {
        const tmp = req.file?.path;
        if (!tmp) return throwError(() => err);
        return from(fsp.rm(tmp, { force: true }).catch(() => undefined)).pipe(
          mergeMap(() => throwError(() => err)),
        );
      }),
    );
  }
}

/**
 * Like `@FileUpload()` but streamed to disk with the MAX_ATTACHMENT_MB limit (evidence:
 * screenshots, screen recordings). Store the file with `UploadService.store(file)` as usual.
 */
export function LargeFileUpload(
  fields: Record<string, { type: 'string'; description?: string }> = {},
) {
  return applyDecorators(
    UseInterceptors(DiskFileInterceptor),
    ApiConsumes('multipart/form-data'),
    ApiBody({
      schema: {
        type: 'object',
        required: [UPLOAD_FIELD],
        properties: { [UPLOAD_FIELD]: { type: 'string', format: 'binary' }, ...fields },
      },
    }),
  );
}

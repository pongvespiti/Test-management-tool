import { Injectable } from '@nestjs/common';
import { AppException, badRequest } from '../../common/errors/app.exception.js';
import { cleanFileName, extensionOf, mimeForUpload } from './mime.js';
import { StorageService, type StoredFile } from './storage.service.js';

/** A validated upload, stored under DATA_DIR. */
export interface UploadedFileInfo {
  /** Client file name without any path. */
  fileName: string;
  /** MIME type derived from the extension (the client-sent type is never trusted). */
  mimeType: string;
  stored: StoredFile;
}

export interface UploadOptions {
  /** Lower-case extensions accepted (without the dot). Omitted = any type that is not blocked. */
  allowExtensions?: ReadonlySet<string>;
  /** Message of the 415 error when the type is not accepted. */
  typeError?: string;
}

/** The multipart file part handed over by `@FileUpload()` (multer memory storage). */
export interface MultipartFile {
  originalname: string;
  size: number;
  buffer: Buffer;
}

/** The file part handed over by `@LargeFileUpload()`: already streamed to a temporary file. */
export interface DiskMultipartFile {
  originalname: string;
  size: number;
  path: string;
  sha256: string;
}

/**
 * Validates and stores files received with `@FileUpload()`:
 * 400 FILE_REQUIRED / EMPTY_FILE, 415 UNSUPPORTED_FILE_TYPE, 413 FILE_TOO_LARGE (size limit from
 * MAX_UPLOAD_MB or MAX_ATTACHMENT_MB, enforced while receiving). The caller owns the stored file afterwards — remove it
 * with `StorageService.remove()` if the database write that references it fails.
 */
@Injectable()
export class UploadService {
  constructor(private readonly storage: StorageService) {}

  async store(
    file: MultipartFile | DiskMultipartFile | undefined,
    opts: UploadOptions = {},
  ): Promise<UploadedFileInfo> {
    if (!file) throw badRequest('FILE_REQUIRED', 'Choose a file to upload');
    if (file.size === 0) throw badRequest('EMPTY_FILE', 'The file is empty');
    const fileName = cleanFileName(file.originalname);
    const ext = extensionOf(fileName);
    const mimeType = mimeForUpload(fileName);
    if (!mimeType || (opts.allowExtensions && !opts.allowExtensions.has(ext))) {
      throw new AppException(
        415,
        'UNSUPPORTED_FILE_TYPE',
        opts.typeError ?? `Files of type .${ext || '(none)'} cannot be uploaded`,
      );
    }
    const stored =
      'path' in file
        ? await this.storage.adoptFile(file.path, file.size, file.sha256)
        : await this.storage.saveBuffer(file.buffer);
    return { fileName, mimeType, stored };
  }
}

import type { Readable } from 'node:stream';
import { StreamableFile } from '@nestjs/common';
import type { Request, Response } from 'express';
import { badRequest } from '../../common/errors/app.exception.js';
import { contentDisposition } from '../storage/mime.js';

/** Content type of Excel workbooks (report downloads, templates). */
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Upload routes accept only `multipart/form-data` (400 MULTIPART_REQUIRED, as in API v1): without
 * this check a JSON body would surface as the less helpful FILE_REQUIRED.
 */
export function assertMultipart(
  req: Pick<Request, 'is'>,
  message = 'Send the file as multipart/form-data',
): void {
  if (!req.is('multipart/form-data')) throw badRequest('MULTIPART_REQUIRED', message);
}

/** Sets the download headers of an Excel workbook (`attachment`, UTF-8 file name) and wraps it. */
export function xlsxDownload(
  res: Pick<Response, 'setHeader'>,
  fileName: string,
  body: Buffer | Readable,
): StreamableFile {
  res.setHeader('Content-Type', XLSX_MIME);
  res.setHeader('Content-Disposition', contentDisposition('attachment', fileName));
  return Buffer.isBuffer(body) ? new StreamableFile(body) : new StreamableFile(body);
}

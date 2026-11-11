import { applyDecorators, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes } from '@nestjs/swagger';

/** Name of the multipart field that carries the file. */
export const UPLOAD_FIELD = 'file';

/**
 * Multipart upload of one file in the `file` field plus optional text fields (read them with
 * `@Body()`), received into memory with the MAX_UPLOAD_MB limit (StorageModule). Use with
 * `@UploadedFile() file` and `UploadService.store(file)`.
 */
export function FileUpload(fields: Record<string, { type: 'string'; description?: string }> = {}) {
  return applyDecorators(
    UseInterceptors(FileInterceptor(UPLOAD_FIELD)),
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

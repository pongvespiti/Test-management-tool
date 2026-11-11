import { Module } from '@nestjs/common';
import { ImportUploadStore } from './import-uploads.service.js';
import { ImportsController } from './imports.controller.js';
import { ImportsService } from './imports.service.js';

/**
 * Excel/CSV import of test cases (upload, analyze, mapping preview, commit, history). Pending
 * uploads live under `DATA_DIR/tmp/imports` for 2 hours (ImportUploadStore).
 */
@Module({
  controllers: [ImportsController],
  providers: [ImportsService, ImportUploadStore],
  exports: [ImportUploadStore],
})
export class ImportsModule {}

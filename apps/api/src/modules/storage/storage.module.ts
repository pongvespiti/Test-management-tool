import { Global, Module } from '@nestjs/common';
import { MulterModule, type MulterModuleOptions } from '@nestjs/platform-express';
import { AppConfig } from '../../config/app-config.js';
import { StorageService } from './storage.service.js';
import { UploadService } from './upload.service.js';

/**
 * File storage under DATA_DIR and multipart uploads. Global: every module can inject
 * `StorageService` / `UploadService` and use `@FileUpload()`.
 */
@Global()
@Module({
  imports: [
    MulterModule.registerAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig): MulterModuleOptions =>
        ({
          // No storage → memory; the file is written by UploadService after validation.
          limits: { fileSize: config.maxUploadBytes, files: 1, fields: 50 },
          // UTF-8 file names (Thai, …) instead of multer's latin1 default.
          defParamCharset: 'utf8',
        }) as MulterModuleOptions,
    }),
  ],
  providers: [StorageService, UploadService],
  exports: [MulterModule, StorageService, UploadService],
})
export class StorageModule {}

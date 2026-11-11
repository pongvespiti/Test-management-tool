import { Body, Controller, Get, HttpCode, Post, Req, UploadedFile } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  importRunSchema,
  type ImportAnalysisDTO,
  type ImportPreviewDTO,
  type ImportRecordDTO,
  type ImportResultDTO,
  type ImportRunInput,
} from '@tmt/shared';
import type { Request } from 'express';
import { ApiErrorCodes, ProjectPermission } from '../../common/decorators/auth.decorators.js';
import { CurrentProject, CurrentUser } from '../../common/decorators/request.decorators.js';
import { badRequest } from '../../common/errors/app.exception.js';
import type { AuthUser, ProjectContext } from '../../common/types/auth.js';
import { FileUpload } from '../storage/upload.decorator.js';
import type { MultipartFile } from '../storage/upload.service.js';
import {
  analyzeImportSchema,
  ImportsService,
  type AnalyzeImportInput,
  type UploadResult,
} from './imports.service.js';

const RUN_ERRORS = [
  'UPLOAD_NOT_FOUND',
  'SHEET_NOT_FOUND',
  'BAD_SUITE',
  'BAD_SECTION',
  'UNKNOWN_FIELD',
  'INVALID_OPTION',
  'TOO_MANY_FIELDS',
  'SUITE_PREFIX_TAKEN',
];

/** Excel/CSV import of test cases. All wizard steps answer 200. */
@ApiTags('Import')
@Controller('projects/:projectId/imports')
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Post('upload')
  @HttpCode(200)
  @ProjectPermission('import')
  @FileUpload()
  @ApiErrorCodes(
    'MULTIPART_REQUIRED',
    'FILE_REQUIRED',
    'EMPTY_FILE',
    'FILE_TOO_LARGE',
    'UNSUPPORTED_FILE_TYPE',
    'CORRUPT_FILE',
  )
  upload(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Req() req: Request,
    @UploadedFile() file: MultipartFile | undefined,
  ): Promise<UploadResult> {
    if (!req.is('multipart/form-data')) {
      throw badRequest('MULTIPART_REQUIRED', 'Send the file as multipart/form-data');
    }
    return this.imports.upload(ctx, me, file);
  }

  @Post('analyze')
  @HttpCode(200)
  @ProjectPermission('import')
  @ApiErrorCodes('UPLOAD_NOT_FOUND', 'SHEET_NOT_FOUND', 'BAD_SUITE')
  analyze(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Body({ schema: analyzeImportSchema }) body: AnalyzeImportInput,
  ): Promise<ImportAnalysisDTO> {
    return this.imports.analyze(ctx, me, body);
  }

  @Post('preview')
  @HttpCode(200)
  @ProjectPermission('import')
  @ApiErrorCodes(...RUN_ERRORS)
  preview(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Body({ schema: importRunSchema }) body: ImportRunInput,
  ): Promise<ImportPreviewDTO> {
    return this.imports.preview(ctx, me, body);
  }

  @Post('commit')
  @HttpCode(200)
  @ProjectPermission('import')
  @ApiErrorCodes(...RUN_ERRORS)
  commit(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Body({ schema: importRunSchema }) body: ImportRunInput,
  ): Promise<ImportResultDTO> {
    return this.imports.commit(ctx, me, body);
  }

  @Get()
  @ProjectPermission('read')
  list(@CurrentProject() ctx: ProjectContext): Promise<ImportRecordDTO[]> {
    return this.imports.list(ctx.id);
  }
}

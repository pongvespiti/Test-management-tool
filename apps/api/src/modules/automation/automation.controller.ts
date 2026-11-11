import { Controller, HttpCode, Param, Post, Query, Req, UploadedFile } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  junitImportQuerySchema,
  type JunitImportQuery,
  type JunitImportResultDTO,
} from '@tmt/shared';
import type { Request } from 'express';
import { ApiErrorCodes, ProjectPermission } from '../../common/decorators/auth.decorators.js';
import { CurrentProject, CurrentUser } from '../../common/decorators/request.decorators.js';
import { ID } from '../../common/http/params.js';
import type { AuthUser, ProjectContext } from '../../common/types/auth.js';
import { FileUpload } from '../storage/upload.decorator.js';
import type { MultipartFile } from '../storage/upload.service.js';
import { JunitImportService } from './junit-import.service.js';

@ApiTags('Automation')
@Controller('projects/:projectId/runs/:runId/junit')
export class AutomationController {
  constructor(private readonly junit: JunitImportService) {}

  /**
   * Imports JUnit XML results into a run. Matching `auto`: tmt_id/tmt_case/case_id/test_id
   * property → code → display id → title. `dryRun=true` previews without writing;
   * `createMissing=true` adds library cases.
   */
  @Post()
  @HttpCode(200)
  @ProjectPermission('importAutomation')
  @FileUpload()
  @ApiErrorCodes(
    'RUN_NOT_FOUND',
    'BAD_XML',
    'PLAN_LOCKED',
    'MULTIPART_REQUIRED',
    'FILE_REQUIRED',
    'FILE_TOO_LARGE',
    'UNSUPPORTED_FILE_TYPE',
  )
  importJunit(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Param('runId', ID) runId: number,
    @Query({ schema: junitImportQuerySchema }) options: JunitImportQuery,
    @Req() req: Request,
    @UploadedFile() file: MultipartFile | undefined,
  ): Promise<JunitImportResultDTO> {
    return this.junit.importUpload(ctx, me, runId, options, req, file);
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  type StreamableFile,
} from '@nestjs/common';
import { ApiProduces, ApiTags } from '@nestjs/swagger';
import type { PlaceholderReference } from '@tmt/excel';
import {
  exportQuerySchema,
  templateFieldsSchema,
  updateTemplateSchema,
  type TemplateCheckDTO,
  type TemplateDTO,
  type TemplateFieldsInput,
  type UpdateTemplateInput,
} from '@tmt/shared';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { ApiErrorCodes, ProjectPermission } from '../../common/decorators/auth.decorators.js';
import { CurrentProject, CurrentUser } from '../../common/decorators/request.decorators.js';
import { ID } from '../../common/http/params.js';
import type { AuthUser, ProjectContext } from '../../common/types/auth.js';
import { XLSX_MIME, xlsxDownload } from '../execution/http-files.js';
import { FileUpload } from '../storage/upload.decorator.js';
import type { MultipartFile } from '../storage/upload.service.js';
import { PlanExportService } from './plan-export.service.js';
import { TemplatesService } from './templates.service.js';

/** `:templateId` of download/check: 0 is the built-in template. */
const TEMPLATE_ID = { schema: z.coerce.number().int().min(0).max(2_147_483_647) } as const;
const UPLOAD_ERRORS = [
  'MULTIPART_REQUIRED',
  'FILE_REQUIRED',
  'FILE_TOO_LARGE',
  'UNSUPPORTED_FILE_TYPE',
];

@ApiTags('Report templates')
@Controller('projects/:projectId/templates')
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Get()
  @ProjectPermission('read')
  list(@CurrentProject() ctx: ProjectContext): Promise<TemplateDTO[]> {
    return this.templates.list(ctx.id);
  }

  @Post()
  @ProjectPermission('manageTemplates')
  @FileUpload({
    name: { type: 'string' },
    description: { type: 'string' },
    suiteId: { type: 'string' },
    runSheet: { type: 'string' },
    isDefault: { type: 'string' },
  })
  @ApiErrorCodes('BAD_SUITE', 'BAD_TEMPLATE_FILE', ...UPLOAD_ERRORS)
  upload(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Req() req: Request,
    @UploadedFile() file: MultipartFile | undefined,
    @Body({ schema: templateFieldsSchema }) fields: TemplateFieldsInput,
  ): Promise<TemplateDTO> {
    return this.templates.upload(ctx, me, req, file, fields);
  }

  @Get('placeholders')
  @ProjectPermission('read')
  placeholders(@CurrentProject() ctx: ProjectContext): Promise<PlaceholderReference> {
    return this.templates.placeholders(ctx.id);
  }

  @Patch(':templateId')
  @ProjectPermission('manageTemplates')
  @ApiErrorCodes('TEMPLATE_NOT_FOUND', 'BAD_SUITE')
  update(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Param('templateId', ID) templateId: number,
    @Body({ schema: updateTemplateSchema }) body: UpdateTemplateInput,
  ): Promise<TemplateDTO> {
    return this.templates.update(ctx, me, templateId, body);
  }

  @Delete(':templateId')
  @HttpCode(204)
  @ProjectPermission('manageTemplates')
  @ApiErrorCodes('TEMPLATE_NOT_FOUND')
  remove(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Param('templateId', ID) templateId: number,
  ): Promise<void> {
    return this.templates.remove(ctx, me, templateId);
  }

  @Get(':templateId/check')
  @ProjectPermission('read')
  @ApiErrorCodes('TEMPLATE_NOT_FOUND')
  check(
    @CurrentProject() ctx: ProjectContext,
    @Param('templateId', TEMPLATE_ID) templateId: number,
  ): Promise<TemplateCheckDTO> {
    return this.templates.check(ctx.id, templateId);
  }

  @Get(':templateId/download')
  @ProjectPermission('read')
  @ApiErrorCodes('TEMPLATE_NOT_FOUND', 'TEMPLATE_FILE_MISSING', 'FILE_MISSING')
  @ApiProduces(XLSX_MIME)
  async download(
    @CurrentProject() ctx: ProjectContext,
    @Param('templateId', TEMPLATE_ID) templateId: number,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { fileName, stream } = await this.templates.download(ctx.id, templateId);
    return xlsxDownload(res, fileName, stream);
  }
}

@ApiTags('Plans')
@Controller('projects/:projectId/plans')
export class PlanExportController {
  constructor(private readonly exports: PlanExportService) {}

  /** Test report from the Excel template (ADR-002). */
  @Get(':planId/export.xlsx')
  @ProjectPermission('export')
  @ApiErrorCodes('PLAN_NOT_FOUND', 'TEMPLATE_NOT_FOUND', 'TEMPLATE_INVALID')
  @ApiProduces(XLSX_MIME)
  async export(
    @CurrentProject() ctx: ProjectContext,
    @Param('planId', ID) planId: number,
    @Query({ schema: exportQuerySchema }) q: z.infer<typeof exportQuerySchema>,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { fileName, buffer } = await this.exports.export(ctx, planId, q.templateId);
    return xlsxDownload(res, fileName, buffer);
  }
}

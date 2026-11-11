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
  StreamableFile,
} from '@nestjs/common';
import { ApiProduces, ApiTags } from '@nestjs/swagger';
import {
  createSectionSchema,
  createSuiteSchema,
  deleteSectionSchema,
  queryBool,
  updateSectionSchema,
  updateSuiteSchema,
  type CreateSectionInput,
  type CreateSuiteInput,
  type SectionNode,
  type SectionTreeDTO,
  type SuiteDTO,
  type UpdateSectionInput,
  type UpdateSuiteInput,
} from '@tmt/shared';
import { z } from 'zod';
import { ApiErrorCodes, ProjectPermission } from '../../common/decorators/auth.decorators.js';
import { CurrentProject, CurrentUser } from '../../common/decorators/request.decorators.js';
import { ID } from '../../common/http/params.js';
import type { AuthUser, ProjectContext } from '../../common/types/auth.js';
import { contentDisposition } from '../storage/mime.js';
import { LibraryExportService, XLSX_MIME } from './library-export.service.js';
import { SectionsService } from './sections.service.js';
import { SuitesService } from './suites.service.js';

const listSuitesQuerySchema = z.object({ includeArchived: queryBool.default(false) });

/** Suites, their section trees and the library Excel export. */
@ApiTags('Library')
@Controller('projects/:projectId')
export class SuitesController {
  constructor(
    private readonly suites: SuitesService,
    private readonly sections: SectionsService,
    private readonly exports: LibraryExportService,
  ) {}

  @Get('suites')
  @ProjectPermission('read')
  list(
    @CurrentProject() ctx: ProjectContext,
    @Query({ schema: listSuitesQuerySchema }) q: z.infer<typeof listSuitesQuerySchema>,
  ): Promise<SuiteDTO[]> {
    return this.suites.list(ctx.id, q.includeArchived);
  }

  @Post('suites')
  @ProjectPermission('manageSuites')
  @ApiErrorCodes('SUITE_PREFIX_TAKEN')
  create(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Body({ schema: createSuiteSchema }) body: CreateSuiteInput,
  ): Promise<SuiteDTO> {
    return this.suites.create(ctx, me, body);
  }

  @Get('suites/:suiteId')
  @ProjectPermission('read')
  @ApiErrorCodes('SUITE_NOT_FOUND')
  get(
    @CurrentProject() ctx: ProjectContext,
    @Param('suiteId', ID) suiteId: number,
  ): Promise<SuiteDTO> {
    return this.suites.get(ctx.id, suiteId);
  }

  @Patch('suites/:suiteId')
  @ProjectPermission('manageSuites')
  @ApiErrorCodes('SUITE_NOT_FOUND', 'SUITE_PREFIX_TAKEN')
  update(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Param('suiteId', ID) suiteId: number,
    @Body({ schema: updateSuiteSchema }) body: UpdateSuiteInput,
  ): Promise<SuiteDTO> {
    return this.suites.update(ctx, me, suiteId, body);
  }

  @Delete('suites/:suiteId')
  @HttpCode(204)
  @ProjectPermission('manageSuites')
  @ApiErrorCodes('SUITE_NOT_FOUND', 'SUITE_IN_USE')
  remove(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Param('suiteId', ID) suiteId: number,
  ): Promise<void> {
    return this.suites.remove(ctx, me, suiteId);
  }

  @Get('suites/:suiteId/export.xlsx')
  @ProjectPermission('export')
  @ApiProduces(XLSX_MIME)
  @ApiErrorCodes('SUITE_NOT_FOUND')
  async export(
    @CurrentProject() ctx: ProjectContext,
    @Param('suiteId', ID) suiteId: number,
  ): Promise<StreamableFile> {
    const { fileName, buffer } = await this.exports.suiteWorkbook(ctx.id, suiteId);
    return new StreamableFile(buffer, {
      type: XLSX_MIME,
      disposition: contentDisposition('attachment', fileName),
      length: buffer.length,
    });
  }

  // -------------------------------------------------------------------------- sections

  @Get('suites/:suiteId/sections')
  @ProjectPermission('read')
  @ApiErrorCodes('SUITE_NOT_FOUND')
  tree(
    @CurrentProject() ctx: ProjectContext,
    @Param('suiteId', ID) suiteId: number,
  ): Promise<SectionTreeDTO> {
    return this.sections.tree(ctx.id, suiteId);
  }

  @Post('suites/:suiteId/sections')
  @ProjectPermission('writeLibrary')
  @ApiErrorCodes('SUITE_NOT_FOUND', 'SECTION_NOT_FOUND', 'BAD_PARENT')
  createSection(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Param('suiteId', ID) suiteId: number,
    @Body({ schema: createSectionSchema }) body: CreateSectionInput,
  ): Promise<SectionNode> {
    return this.sections.create(ctx, me, suiteId, body);
  }

  @Patch('sections/:sectionId')
  @ProjectPermission('writeLibrary')
  @ApiErrorCodes('SECTION_NOT_FOUND', 'BAD_PARENT', 'SECTION_CYCLE')
  updateSection(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Param('sectionId', ID) sectionId: number,
    @Body({ schema: updateSectionSchema }) body: UpdateSectionInput,
  ): Promise<SectionNode> {
    return this.sections.update(ctx, me, sectionId, body);
  }

  @Delete('sections/:sectionId')
  @HttpCode(204)
  @ProjectPermission('deleteLibrary')
  @ApiErrorCodes('SECTION_NOT_FOUND', 'SECTION_NOT_EMPTY')
  removeSection(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Param('sectionId', ID) sectionId: number,
    @Query({ schema: deleteSectionSchema }) q: z.infer<typeof deleteSectionSchema>,
  ): Promise<void> {
    return this.sections.remove(ctx, me, sectionId, q.moveContentToParent);
  }
}

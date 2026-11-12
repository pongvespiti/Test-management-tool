import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  createRequirementSchema,
  importAnalyzeSchema,
  jiraRequirementImportSchema,
  listRequirementsQuerySchema,
  requirementImportSchema,
  setRequirementCasesSchema,
  updateRequirementSchema,
  type CreateRequirementInput,
  type ImportAnalyzeInput,
  type JiraRequirementImportInput,
  type ListRequirementsQuery,
  type RequirementDTO,
  type RequirementImportAnalysisDTO,
  type RequirementImportInput,
  type RequirementImportPreviewDTO,
  type RequirementImportResultDTO,
  type RequirementJiraResultDTO,
  type RequirementListItemDTO,
  type SetRequirementCasesInput,
  type UpdateRequirementInput,
} from '@tmt/shared';
import { ApiErrorCodes, ProjectPermission } from '../../common/decorators/auth.decorators.js';
import { CurrentProject, CurrentUser } from '../../common/decorators/request.decorators.js';
import { ID } from '../../common/http/params.js';
import type { AuthUser, ProjectContext } from '../../common/types/auth.js';
import { RequirementsService } from './requirements.service.js';

const IMPORT_ERRORS = ['UPLOAD_NOT_FOUND', 'SHEET_NOT_FOUND'];

/** Requirements table: typed in, imported from Excel, or read from Jira (never written to Jira). */
@ApiTags('Requirements')
@Controller('projects/:projectId/requirements')
export class RequirementsController {
  constructor(private readonly requirements: RequirementsService) {}

  @Get()
  @ProjectPermission('read')
  list(
    @CurrentProject() ctx: ProjectContext,
    @Query({ schema: listRequirementsQuerySchema }) q: ListRequirementsQuery,
  ): Promise<RequirementListItemDTO[]> {
    return this.requirements.list(ctx.id, q);
  }

  @Post()
  @ProjectPermission('writeRequirements')
  @ApiErrorCodes('REQUIREMENT_KEY_TAKEN')
  create(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Body({ schema: createRequirementSchema }) body: CreateRequirementInput,
  ): Promise<RequirementDTO> {
    return this.requirements.create(ctx, me, body);
  }

  @Post('import/analyze')
  @HttpCode(200)
  @ProjectPermission('import')
  @ApiErrorCodes(...IMPORT_ERRORS)
  analyze(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Body({ schema: importAnalyzeSchema }) body: ImportAnalyzeInput,
  ): Promise<RequirementImportAnalysisDTO> {
    return this.requirements.analyzeImport(ctx, me, body);
  }

  @Post('import/preview')
  @HttpCode(200)
  @ProjectPermission('import')
  @ApiErrorCodes(...IMPORT_ERRORS)
  preview(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Body({ schema: requirementImportSchema }) body: RequirementImportInput,
  ): Promise<RequirementImportPreviewDTO> {
    return this.requirements.previewImport(ctx, me, body);
  }

  @Post('import/commit')
  @HttpCode(200)
  @ProjectPermission('import')
  @ApiErrorCodes(...IMPORT_ERRORS, 'REQUIREMENT_KEY_TAKEN')
  commit(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Body({ schema: requirementImportSchema }) body: RequirementImportInput,
  ): Promise<RequirementImportResultDTO> {
    return this.requirements.commitImport(ctx, me, body);
  }

  @Post('jira/import')
  @HttpCode(200)
  @ProjectPermission('useIntegrations')
  @ApiErrorCodes('JIRA_NOT_CONFIGURED', 'JIRA_ERROR')
  importFromJira(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Body({ schema: jiraRequirementImportSchema }) body: JiraRequirementImportInput,
  ): Promise<RequirementJiraResultDTO> {
    return this.requirements.importFromJira(ctx, me, body);
  }

  @Post('jira/sync')
  @HttpCode(200)
  @ProjectPermission('useIntegrations')
  @ApiErrorCodes('JIRA_NOT_CONFIGURED', 'JIRA_ERROR')
  syncJira(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
  ): Promise<RequirementJiraResultDTO> {
    return this.requirements.syncJira(ctx, me);
  }

  @Get(':requirementId')
  @ProjectPermission('read')
  @ApiErrorCodes('REQUIREMENT_NOT_FOUND')
  get(
    @CurrentProject() ctx: ProjectContext,
    @Param('requirementId', ID) requirementId: number,
  ): Promise<RequirementDTO> {
    return this.requirements.get(ctx.id, requirementId);
  }

  @Patch(':requirementId')
  @ProjectPermission('writeRequirements')
  @ApiErrorCodes('REQUIREMENT_NOT_FOUND', 'REQUIREMENT_KEY_TAKEN', 'JIRA_MANAGED')
  update(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Param('requirementId', ID) requirementId: number,
    @Body({ schema: updateRequirementSchema }) body: UpdateRequirementInput,
  ): Promise<RequirementDTO> {
    return this.requirements.update(ctx, me, requirementId, body);
  }

  @Delete(':requirementId')
  @HttpCode(204)
  @ProjectPermission('writeRequirements')
  @ApiErrorCodes('REQUIREMENT_NOT_FOUND')
  remove(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Param('requirementId', ID) requirementId: number,
  ): Promise<void> {
    return this.requirements.remove(ctx, me, requirementId);
  }

  /** Confirms the cases still fit after the requirement text changed. */
  @Post(':requirementId/review')
  @HttpCode(200)
  @ProjectPermission('writeRequirements')
  @ApiErrorCodes('REQUIREMENT_NOT_FOUND')
  review(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Param('requirementId', ID) requirementId: number,
  ): Promise<RequirementDTO> {
    return this.requirements.markReviewed(ctx, me, requirementId);
  }

  /** Replaces the cases linked to the requirement. */
  @Put(':requirementId/cases')
  @ProjectPermission('writeRequirements')
  @ApiErrorCodes('REQUIREMENT_NOT_FOUND', 'BAD_CASE')
  setCases(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Param('requirementId', ID) requirementId: number,
    @Body({ schema: setRequirementCasesSchema }) body: SetRequirementCasesInput,
  ): Promise<RequirementDTO> {
    return this.requirements.setCases(ctx, me, requirementId, body.caseIds);
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Res,
  type StreamableFile,
} from '@nestjs/common';
import { ApiProduces, ApiTags } from '@nestjs/swagger';
import {
  addRunCasesSchema,
  assignRunCasesSchema,
  createRunSchema,
  duplicateRunSchema,
  removeRunCasesSchema,
  rerunSchema,
  updateRunSchema,
  type AddRunCasesInput,
  type AssignRunCasesInput,
  type CreateRunInput,
  type DuplicateRunInput,
  type RemoveRunCasesInput,
  type RerunInput,
  type RunCaseDTO,
  type RunDTO,
  type RunReportDTO,
  type UpdateRunInput,
} from '@tmt/shared';
import type { Response } from 'express';
import { ApiErrorCodes, ProjectPermission } from '../../common/decorators/auth.decorators.js';
import { CurrentProject, CurrentUser } from '../../common/decorators/request.decorators.js';
import { ID } from '../../common/http/params.js';
import type { AuthUser, ProjectContext } from '../../common/types/auth.js';
import { XLSX_MIME, xlsxDownload } from './http-files.js';
import { ResultsService } from './results.service.js';
import { RunChangesService } from './run-changes.service.js';
import { RunReportService } from './run-report.service.js';
import { RunsService } from './runs.service.js';

const RUN_WRITE_ERRORS = ['RUN_NOT_FOUND', 'PLAN_LOCKED', 'RUN_CODE_TAKEN', 'UNKNOWN_USER'];

@ApiTags('Runs')
@Controller('projects/:projectId')
export class RunsController {
  constructor(
    private readonly runs: RunsService,
    private readonly changes: RunChangesService,
    private readonly results: ResultsService,
    private readonly reports: RunReportService,
  ) {}

  @Get('plans/:planId/runs')
  @ProjectPermission('read')
  @ApiErrorCodes('PLAN_NOT_FOUND')
  listForPlan(
    @CurrentProject() ctx: ProjectContext,
    @Param('planId', ID) planId: number,
  ): Promise<RunDTO[]> {
    return this.runs.listForPlan(ctx.id, planId);
  }

  @Post('plans/:planId/runs')
  @ProjectPermission('writePlans')
  @ApiErrorCodes(
    'PLAN_NOT_FOUND',
    'PLAN_LOCKED',
    'RUN_CODE_TAKEN',
    'BAD_SUITE',
    'BAD_SECTION',
    'BAD_CASE',
    'NO_CASES',
    'UNKNOWN_USER',
  )
  create(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Param('planId', ID) planId: number,
    @Body({ schema: createRunSchema }) body: CreateRunInput,
  ): Promise<RunDTO> {
    return this.runs.create(ctx, me, planId, body);
  }

  @Get('runs/:runId')
  @ProjectPermission('read')
  @ApiErrorCodes('RUN_NOT_FOUND')
  get(@CurrentProject() ctx: ProjectContext, @Param('runId', ID) runId: number): Promise<RunDTO> {
    return this.runs.get(ctx.id, runId);
  }

  @Patch('runs/:runId')
  @ProjectPermission('writePlans')
  @ApiErrorCodes(...RUN_WRITE_ERRORS)
  update(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Param('runId', ID) runId: number,
    @Body({ schema: updateRunSchema }) body: UpdateRunInput,
  ): Promise<RunDTO> {
    return this.runs.update(ctx, me, runId, body);
  }

  @Delete('runs/:runId')
  @HttpCode(204)
  @ProjectPermission('deletePlans')
  @ApiErrorCodes('RUN_NOT_FOUND', 'PLAN_LOCKED')
  remove(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Param('runId', ID) runId: number,
  ): Promise<void> {
    return this.runs.remove(ctx, me, runId);
  }

  @Post('runs/:runId/duplicate')
  @ProjectPermission('writePlans')
  @ApiErrorCodes(...RUN_WRITE_ERRORS)
  duplicate(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Param('runId', ID) runId: number,
    @Body({ schema: duplicateRunSchema }) body: DuplicateRunInput,
  ): Promise<RunDTO> {
    return this.runs.duplicate(ctx, me, runId, body);
  }

  @Get('runs/:runId/cases')
  @ProjectPermission('read')
  @ApiErrorCodes('RUN_NOT_FOUND')
  listCases(
    @CurrentProject() ctx: ProjectContext,
    @Param('runId', ID) runId: number,
  ): Promise<RunCaseDTO[]> {
    return this.results.listRunCases(ctx.id, runId);
  }

  @Post('runs/:runId/cases')
  @HttpCode(200)
  @ProjectPermission('writePlans')
  @ApiErrorCodes('RUN_NOT_FOUND', 'PLAN_LOCKED', 'BAD_SECTION', 'BAD_CASE')
  addCases(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Param('runId', ID) runId: number,
    @Body({ schema: addRunCasesSchema }) body: AddRunCasesInput,
  ): Promise<{ added: number }> {
    return this.changes.addCases(ctx, me, runId, body);
  }

  @Post('runs/:runId/cases/remove')
  @HttpCode(200)
  @ProjectPermission('writePlans')
  @ApiErrorCodes('RUN_NOT_FOUND', 'PLAN_LOCKED', 'EXECUTED_RUN_CASES', 'BAD_RUN_CASE')
  removeCases(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Param('runId', ID) runId: number,
    @Body({ schema: removeRunCasesSchema }) body: RemoveRunCasesInput,
  ): Promise<{ removed: number }> {
    return this.changes.removeCases(ctx, me, runId, body);
  }

  @Post('runs/:runId/rerun')
  @ProjectPermission('writePlans')
  @ApiErrorCodes('RUN_NOT_FOUND', 'PLAN_LOCKED', 'RUN_CODE_TAKEN', 'NO_CASES', 'UNKNOWN_USER')
  rerun(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Param('runId', ID) runId: number,
    @Body({ schema: rerunSchema }) body: RerunInput,
  ): Promise<RunDTO> {
    return this.changes.rerun(ctx, me, runId, body);
  }

  @Post('runs/:runId/assign')
  @HttpCode(200)
  @ProjectPermission('writePlans')
  @ApiErrorCodes('RUN_NOT_FOUND', 'PLAN_LOCKED', 'UNKNOWN_USER', 'BAD_RUN_CASE')
  assign(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Param('runId', ID) runId: number,
    @Body({ schema: assignRunCasesSchema }) body: AssignRunCasesInput,
  ): Promise<{ affected: number }> {
    return this.changes.assign(ctx, me, runId, body);
  }

  @Get('runs/:runId/report')
  @ProjectPermission('read')
  @ApiErrorCodes('RUN_NOT_FOUND')
  report(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Param('runId', ID) runId: number,
  ): Promise<RunReportDTO> {
    return this.reports.report(ctx, me, runId);
  }

  @Get('runs/:runId/report.xlsx')
  @ProjectPermission('read')
  @ApiErrorCodes('RUN_NOT_FOUND')
  @ApiProduces(XLSX_MIME)
  async reportWorkbook(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Param('runId', ID) runId: number,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { fileName, buffer } = await this.reports.workbook(ctx, me, runId);
    return xlsxDownload(res, fileName, buffer);
  }
}

import { Body, Controller, Get, HttpCode, Param, Post, Put, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  bulkResultSchema,
  setResultSchema,
  type BulkResultInput,
  type RunCaseDetailDTO,
  type RunCaseDTO,
  type SetResultInput,
} from '@tmt/shared';
import type { Request } from 'express';
import { ApiErrorCodes, ProjectPermission } from '../../common/decorators/auth.decorators.js';
import { CurrentProject, CurrentUser } from '../../common/decorators/request.decorators.js';
import { ID } from '../../common/http/params.js';
import type { AuthUser, ProjectContext } from '../../common/types/auth.js';
import { ResultsService } from './results.service.js';

@ApiTags('Results')
@Controller('projects/:projectId')
export class ResultsController {
  constructor(private readonly results: ResultsService) {}

  @Post('runs/:runId/results/bulk')
  @HttpCode(200)
  @ProjectPermission('execute')
  @ApiErrorCodes('RUN_NOT_FOUND', 'PLAN_LOCKED')
  bulk(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Param('runId', ID) runId: number,
    @Body({ schema: bulkResultSchema }) body: BulkResultInput,
  ): Promise<{ affected: number }> {
    return this.results.bulk(ctx, me, runId, body);
  }

  @Get('run-cases/:runCaseId')
  @ProjectPermission('read')
  @ApiErrorCodes('RUN_CASE_NOT_FOUND')
  detail(
    @CurrentProject() ctx: ProjectContext,
    @Param('runCaseId', ID) runCaseId: number,
  ): Promise<RunCaseDetailDTO> {
    return this.results.detail(ctx.id, runCaseId);
  }

  /** Records a result; requests with an API token are stored with source `api`. */
  @Put('run-cases/:runCaseId/result')
  @ProjectPermission('execute')
  @ApiErrorCodes('RUN_CASE_NOT_FOUND', 'PLAN_LOCKED', 'STEP_COUNT_MISMATCH')
  setResult(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Param('runCaseId', ID) runCaseId: number,
    @Body({ schema: setResultSchema }) body: SetResultInput,
    @Req() req: Request,
  ): Promise<RunCaseDTO> {
    return this.results.setResult(
      ctx,
      me,
      runCaseId,
      body,
      req.authMethod === 'token' ? 'api' : 'ui',
    );
  }
}

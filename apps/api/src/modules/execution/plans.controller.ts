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
  Req,
  UploadedFile,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  createPlanSchema,
  listPlansQuerySchema,
  matrixQuerySchema,
  updatePlanSchema,
  type AttachmentDTO,
  type CreatePlanInput,
  type MatrixDTO,
  type PlanDTO,
  type UpdatePlanInput,
} from '@tmt/shared';
import type { Request } from 'express';
import type { z } from 'zod';
import { ApiErrorCodes, ProjectPermission } from '../../common/decorators/auth.decorators.js';
import { CurrentProject, CurrentUser } from '../../common/decorators/request.decorators.js';
import { ID } from '../../common/http/params.js';
import type { AuthUser, ProjectContext } from '../../common/types/auth.js';
import { FileUpload } from '../storage/upload.decorator.js';
import type { MultipartFile } from '../storage/upload.service.js';
import { PlansService } from './plans.service.js';

const UPLOAD_ERRORS = [
  'MULTIPART_REQUIRED',
  'FILE_REQUIRED',
  'FILE_TOO_LARGE',
  'UNSUPPORTED_FILE_TYPE',
];

@ApiTags('Plans')
@Controller('projects/:projectId/plans')
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  @Get()
  @ProjectPermission('read')
  list(
    @CurrentProject() ctx: ProjectContext,
    @Query({ schema: listPlansQuerySchema }) q: z.infer<typeof listPlansQuerySchema>,
  ): Promise<PlanDTO[]> {
    return this.plans.list(ctx.id, q.releaseId);
  }

  @Post()
  @ProjectPermission('writePlans')
  @ApiErrorCodes('DOC_NO_TAKEN', 'BAD_RELEASE', 'BAD_TEMPLATE')
  create(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Body({ schema: createPlanSchema }) body: CreatePlanInput,
  ): Promise<PlanDTO> {
    return this.plans.create(ctx, me, body);
  }

  // Declared before `:planId` so the literal path wins.
  @Get('doc-no-suggestion')
  @ProjectPermission('read')
  suggestDocNo(@CurrentProject() ctx: ProjectContext): Promise<{ docNo: string }> {
    return this.plans.suggestDocNo(ctx.id);
  }

  @Get(':planId')
  @ProjectPermission('read')
  @ApiErrorCodes('PLAN_NOT_FOUND')
  get(
    @CurrentProject() ctx: ProjectContext,
    @Param('planId', ID) planId: number,
  ): Promise<PlanDTO> {
    return this.plans.get(ctx.id, planId);
  }

  @Patch(':planId')
  @ProjectPermission('writePlans')
  @ApiErrorCodes('PLAN_NOT_FOUND', 'PLAN_LOCKED', 'DOC_NO_TAKEN', 'BAD_RELEASE', 'BAD_TEMPLATE')
  update(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Param('planId', ID) planId: number,
    @Body({ schema: updatePlanSchema }) body: UpdatePlanInput,
  ): Promise<PlanDTO> {
    return this.plans.update(ctx, me, planId, body);
  }

  @Delete(':planId')
  @HttpCode(204)
  @ProjectPermission('deletePlans')
  @ApiErrorCodes('PLAN_NOT_FOUND', 'PLAN_LOCKED')
  remove(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Param('planId', ID) planId: number,
  ): Promise<void> {
    return this.plans.remove(ctx, me, planId);
  }

  @Post(':planId/complete')
  @HttpCode(200)
  @ProjectPermission('completePlan')
  @ApiErrorCodes('PLAN_NOT_FOUND', 'PLAN_LOCKED')
  complete(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Param('planId', ID) planId: number,
  ): Promise<PlanDTO> {
    return this.plans.complete(ctx, me, planId);
  }

  @Post(':planId/reopen')
  @HttpCode(200)
  @ProjectPermission('reopenPlan')
  @ApiErrorCodes('PLAN_NOT_FOUND', 'PLAN_NOT_COMPLETED')
  reopen(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Param('planId', ID) planId: number,
  ): Promise<PlanDTO> {
    return this.plans.reopen(ctx, me, planId);
  }

  @Get(':planId/matrix')
  @ProjectPermission('read')
  @ApiErrorCodes('PLAN_NOT_FOUND')
  matrix(
    @CurrentProject() ctx: ProjectContext,
    @Param('planId', ID) planId: number,
    @Query({ schema: matrixQuerySchema }) q: z.infer<typeof matrixQuerySchema>,
  ): Promise<MatrixDTO> {
    return this.plans.matrix(ctx.id, planId, q.groupBy);
  }

  @Put(':planId/signed-copy')
  @ProjectPermission('writePlans')
  @FileUpload()
  @ApiErrorCodes('PLAN_NOT_FOUND', 'PLAN_NOT_COMPLETED', ...UPLOAD_ERRORS)
  uploadSignedCopy(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Param('planId', ID) planId: number,
    @Req() req: Request,
    @UploadedFile() file: MultipartFile | undefined,
  ): Promise<AttachmentDTO> {
    return this.plans.uploadSignedCopy(ctx, me, planId, req, file);
  }

  @Delete(':planId/signed-copy')
  @HttpCode(204)
  @ProjectPermission('writePlans')
  @ApiErrorCodes('PLAN_NOT_FOUND')
  deleteSignedCopy(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Param('planId', ID) planId: number,
  ): Promise<void> {
    return this.plans.deleteSignedCopy(ctx, me, planId);
  }
}

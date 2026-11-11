import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  createDefectSchema,
  linkDefectSchema,
  listDefectsQuerySchema,
  transitionDefectSchema,
  updateDefectSchema,
  type CreateDefectInput,
  type DefectDTO,
  type DefectListItem,
  type ListDefectsQuery,
  type Paged,
  type TransitionDefectInput,
  type UpdateDefectInput,
} from '@tmt/shared';
import type { z } from 'zod';
import { ApiErrorCodes, ProjectPermission } from '../../common/decorators/auth.decorators.js';
import { CurrentProject, CurrentUser } from '../../common/decorators/request.decorators.js';
import { ID } from '../../common/http/params.js';
import type { AuthUser, ProjectContext } from '../../common/types/auth.js';
import { DefectsService } from './defects.service.js';

@ApiTags('Defects')
@Controller('projects/:projectId/defects')
export class DefectsController {
  constructor(private readonly defects: DefectsService) {}

  /** Newest first, paged; filters by status, severity, release, plan, run, assignee and text. */
  @Get()
  @ProjectPermission('read')
  list(
    @CurrentProject() ctx: ProjectContext,
    @Query({ schema: listDefectsQuerySchema }) q: ListDefectsQuery,
  ): Promise<Paged<DefectListItem>> {
    return this.defects.list(ctx.id, q);
  }

  /** Reports a defect (optionally from an NG run case: prefilled and linked). */
  @Post()
  @ProjectPermission('writeDefects')
  @ApiErrorCodes('UNKNOWN_USER', 'BAD_RELEASE', 'RUN_CASE_NOT_FOUND')
  create(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Body({ schema: createDefectSchema }) body: CreateDefectInput,
  ): Promise<DefectDTO> {
    return this.defects.create(ctx, me, body);
  }

  @Get(':defectId')
  @ProjectPermission('read')
  @ApiErrorCodes('DEFECT_NOT_FOUND')
  get(
    @CurrentProject() ctx: ProjectContext,
    @Param('defectId', ID) defectId: number,
  ): Promise<DefectDTO> {
    return this.defects.get(ctx.id, defectId);
  }

  @Patch(':defectId')
  @ProjectPermission('writeDefects')
  @ApiErrorCodes('DEFECT_NOT_FOUND', 'UNKNOWN_USER', 'BAD_RELEASE')
  update(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Param('defectId', ID) defectId: number,
    @Body({ schema: updateDefectSchema }) body: UpdateDefectInput,
  ): Promise<DefectDTO> {
    return this.defects.update(ctx, me, defectId, body);
  }

  /** Moves the defect through its workflow (optional comment). */
  @Post(':defectId/transition')
  @HttpCode(200)
  @ProjectPermission('writeDefects')
  @ApiErrorCodes('DEFECT_NOT_FOUND', 'INVALID_TRANSITION', 'DEFECT_CHANGED')
  transition(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Param('defectId', ID) defectId: number,
    @Body({ schema: transitionDefectSchema }) body: TransitionDefectInput,
  ): Promise<DefectDTO> {
    return this.defects.transition(ctx, me, defectId, body);
  }

  /** Links the defect to a run case (idempotent). */
  @Post(':defectId/links')
  @HttpCode(200)
  @ProjectPermission('writeDefects')
  @ApiErrorCodes('DEFECT_NOT_FOUND', 'RUN_CASE_NOT_FOUND')
  link(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Param('defectId', ID) defectId: number,
    @Body({ schema: linkDefectSchema }) body: z.infer<typeof linkDefectSchema>,
  ): Promise<DefectDTO> {
    return this.defects.link(ctx, me, defectId, body.runCaseId);
  }

  @Delete(':defectId/links/:linkId')
  @HttpCode(204)
  @ProjectPermission('writeDefects')
  @ApiErrorCodes('DEFECT_NOT_FOUND', 'LINK_NOT_FOUND')
  unlink(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Param('defectId', ID) defectId: number,
    @Param('linkId', ID) linkId: number,
  ): Promise<void> {
    return this.defects.unlink(ctx, me, defectId, linkId);
  }

  /** Deletes the defect with its comments and attachments. */
  @Delete(':defectId')
  @HttpCode(204)
  @ProjectPermission('deleteDefects')
  @ApiErrorCodes('DEFECT_NOT_FOUND')
  remove(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Param('defectId', ID) defectId: number,
  ): Promise<void> {
    return this.defects.remove(ctx, me, defectId);
  }
}

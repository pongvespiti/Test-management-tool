import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { savedViewInputSchema, type SavedViewDTO, type SavedViewInput } from '@tmt/shared';
import { ApiErrorCodes, ProjectPermission } from '../../common/decorators/auth.decorators.js';
import { CurrentProject, CurrentUser } from '../../common/decorators/request.decorators.js';
import { ID } from '../../common/http/params.js';
import type { AuthUser, ProjectContext } from '../../common/types/auth.js';
import { SavedViewsService } from './saved-views.service.js';

/** Saved views of the summary report. */
@ApiTags('Reports')
@Controller('projects/:projectId/reports/views')
export class SavedViewsController {
  constructor(private readonly views: SavedViewsService) {}

  /** Your own views and the shared ones. */
  @Get()
  @ProjectPermission('viewReports')
  list(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
  ): Promise<SavedViewDTO[]> {
    return this.views.list(ctx, me);
  }

  @Post()
  @ProjectPermission('viewReports')
  @ApiErrorCodes('VIEW_NAME_TAKEN')
  create(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Body({ schema: savedViewInputSchema }) body: SavedViewInput,
  ): Promise<SavedViewDTO> {
    return this.views.create(ctx, me, body);
  }

  /** Deletes a view: its owner or a lead. */
  @Delete(':viewId')
  @HttpCode(204)
  @ProjectPermission('viewReports')
  @ApiErrorCodes('VIEW_NOT_FOUND')
  remove(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Param('viewId', ID) viewId: number,
  ): Promise<void> {
    return this.views.remove(ctx, me, viewId);
  }
}

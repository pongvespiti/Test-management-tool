import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  createSharedStepSchema,
  queryBool,
  updateSharedStepSchema,
  type CreateSharedStepInput,
  type SharedStepDetailDTO,
  type SharedStepDTO,
  type UpdateSharedStepInput,
} from '@tmt/shared';
import { z } from 'zod';
import { ApiErrorCodes, ProjectPermission } from '../../common/decorators/auth.decorators.js';
import { CurrentProject, CurrentUser } from '../../common/decorators/request.decorators.js';
import { ID } from '../../common/http/params.js';
import type { AuthUser, ProjectContext } from '../../common/types/auth.js';
import { SharedStepsService } from './shared-steps.service.js';

const deleteSharedStepQuerySchema = z.object({ inline: queryBool.default(false) });

/** Reusable step sets referenced from case steps. */
@ApiTags('Shared steps')
@Controller('projects/:projectId/shared-steps')
export class SharedStepsController {
  constructor(private readonly sharedSteps: SharedStepsService) {}

  @Get()
  @ProjectPermission('read')
  list(@CurrentProject() ctx: ProjectContext): Promise<SharedStepDTO[]> {
    return this.sharedSteps.list(ctx.id);
  }

  @Post()
  @ProjectPermission('writeSharedSteps')
  @ApiErrorCodes('SHARED_STEP_NAME_TAKEN')
  create(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Body({ schema: createSharedStepSchema }) body: CreateSharedStepInput,
  ): Promise<SharedStepDTO> {
    return this.sharedSteps.create(ctx, me, body);
  }

  @Get(':sharedStepId')
  @ProjectPermission('read')
  @ApiErrorCodes('SHARED_STEP_NOT_FOUND')
  get(
    @CurrentProject() ctx: ProjectContext,
    @Param('sharedStepId', ID) id: number,
  ): Promise<SharedStepDetailDTO> {
    return this.sharedSteps.get(ctx.id, id);
  }

  @Patch(':sharedStepId')
  @ProjectPermission('writeSharedSteps')
  @ApiErrorCodes('SHARED_STEP_NOT_FOUND', 'VERSION_CONFLICT', 'SHARED_STEP_NAME_TAKEN')
  update(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Param('sharedStepId', ID) id: number,
    @Body({ schema: updateSharedStepSchema }) body: UpdateSharedStepInput,
  ): Promise<SharedStepDTO> {
    return this.sharedSteps.update(ctx, me, id, body);
  }

  @Delete(':sharedStepId')
  @HttpCode(204)
  @ProjectPermission('deleteLibrary')
  @ApiErrorCodes('SHARED_STEP_NOT_FOUND', 'SHARED_STEP_IN_USE')
  remove(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() me: AuthUser,
    @Param('sharedStepId', ID) id: number,
    @Query({ schema: deleteSharedStepQuerySchema }) q: z.infer<typeof deleteSharedStepQuerySchema>,
  ): Promise<void> {
    return this.sharedSteps.remove(ctx, me, id, q.inline);
  }
}

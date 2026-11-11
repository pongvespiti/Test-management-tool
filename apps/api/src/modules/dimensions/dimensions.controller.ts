import { Body, Controller, Get, HttpCode, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  envDimensionsSchema,
  type EnvDimensionsDTO,
  type EnvDimensionsInput,
  type NormalizeRunsResultDTO,
} from '@tmt/shared';
import { ProjectPermission } from '../../common/decorators/auth.decorators.js';
import { CurrentProject, CurrentUser } from '../../common/decorators/request.decorators.js';
import type { AuthUser, ProjectContext } from '../../common/types/auth.js';
import { DimensionsService } from './dimensions.service.js';

@ApiTags('Runs')
@Controller('projects/:projectId/env-dimensions')
export class DimensionsController {
  constructor(private readonly dimensions: DimensionsService) {}

  /** The lists of values behind the run environment labels. */
  @Get()
  @ProjectPermission('read')
  get(@CurrentProject() ctx: ProjectContext): Promise<EnvDimensionsDTO> {
    return this.dimensions.get(ctx.id);
  }

  /** Replaces the lists (a list may depend on another one, e.g. OS version on Platform). */
  @Put()
  @ProjectPermission('manageDimensions')
  replace(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() user: AuthUser,
    @Body({ schema: envDimensionsSchema }) body: EnvDimensionsInput,
  ): Promise<EnvDimensionsDTO> {
    return this.dimensions.replace(ctx, user, body);
  }

  /** Respells the environment of every run to the lists and adds the values found in runs. */
  @Post('normalize-runs')
  @HttpCode(200)
  @ProjectPermission('manageDimensions')
  normalizeRuns(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() user: AuthUser,
  ): Promise<NormalizeRunsResultDTO> {
    return this.dimensions.normalizeRuns(ctx, user);
  }
}

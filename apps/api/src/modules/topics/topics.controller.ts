import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  assignSuitesSchema,
  topicsQuerySchema,
  type AssignSuitesInput,
  type AssignSuitesResultDTO,
  type TopicsDTO,
  type TopicsQuery,
} from '@tmt/shared';
import { ProjectPermission } from '../../common/decorators/auth.decorators.js';
import { CurrentProject, CurrentUser } from '../../common/decorators/request.decorators.js';
import type { AuthUser, ProjectContext } from '../../common/types/auth.js';
import { TopicsService } from './topics.service.js';

@ApiTags('Runs')
@Controller('projects/:projectId/topics')
export class TopicsController {
  constructor(private readonly topics: TopicsService) {}

  /** Progress by topic and suite in a release: the whole team (managers, leads) or one person. */
  @Get()
  @ProjectPermission('read')
  get(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() user: AuthUser,
    @Query({ schema: topicsQuerySchema }) q: TopicsQuery,
  ): Promise<TopicsDTO> {
    return this.topics.get(ctx, user, q);
  }

  /** Gives the runs of some suites in a release to a person, with an optional due date. */
  @Post('assign')
  @HttpCode(200)
  @ProjectPermission('assignTopics')
  assign(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() user: AuthUser,
    @Body({ schema: assignSuitesSchema }) body: AssignSuitesInput,
  ): Promise<AssignSuitesResultDTO> {
    return this.topics.assign(ctx, user, body);
  }
}

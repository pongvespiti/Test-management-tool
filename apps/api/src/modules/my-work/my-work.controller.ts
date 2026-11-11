import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { myWorkQuerySchema, type MyWorkDTO, type MyWorkQuery } from '@tmt/shared';
import { ProjectPermission } from '../../common/decorators/auth.decorators.js';
import { CurrentProject, CurrentUser } from '../../common/decorators/request.decorators.js';
import type { AuthUser, ProjectContext } from '../../common/types/auth.js';
import { MyWorkService } from './my-work.service.js';

@ApiTags('Reports')
@Controller('projects/:projectId/my-work')
export class MyWorkController {
  constructor(private readonly myWork: MyWorkService) {}

  /** Run cases waiting for me and what I did in a day / week (days in REPORT_TIMEZONE). */
  @Get()
  @ProjectPermission('read')
  get(
    @CurrentProject() ctx: ProjectContext,
    @CurrentUser() user: AuthUser,
    @Query({ schema: myWorkQuerySchema }) q: MyWorkQuery,
  ): Promise<MyWorkDTO> {
    return this.myWork.get(ctx.id, user, q);
  }
}

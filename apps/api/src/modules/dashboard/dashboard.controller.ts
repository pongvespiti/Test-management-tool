import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { dashboardQuerySchema, type DashboardDTO } from '@tmt/shared';
import type { z } from 'zod';
import { ApiErrorCodes, ProjectPermission } from '../../common/decorators/auth.decorators.js';
import { CurrentProject } from '../../common/decorators/request.decorators.js';
import type { ProjectContext } from '../../common/types/auth.js';
import { DashboardService } from './dashboard.service.js';

@ApiTags('Reports')
@Controller('projects/:projectId/dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  /** Dashboard of a release (default: newest active, else newest). */
  @Get()
  @ProjectPermission('read')
  @ApiErrorCodes('BAD_RELEASE')
  get(
    @CurrentProject() ctx: ProjectContext,
    @Query({ schema: dashboardQuerySchema }) q: z.infer<typeof dashboardQuerySchema>,
  ): Promise<DashboardDTO> {
    return this.dashboard.get(ctx.id, q.releaseId);
  }
}

import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { activityQuerySchema, type ActivityDTO } from '@tmt/shared';
import type { z } from 'zod';
import { ProjectPermission } from '../../common/decorators/auth.decorators.js';
import { CurrentProject } from '../../common/decorators/request.decorators.js';
import type { ProjectContext } from '../../common/types/auth.js';
import { loadUserRefs, refOf } from '../../common/users/user-refs.js';
import { PrismaService } from '../../prisma/prisma.service.js';

@ApiTags('Activity')
@Controller('projects/:projectId/activity')
export class ActivityController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ProjectPermission('read')
  async list(
    @CurrentProject() project: ProjectContext,
    @Query({ schema: activityQuerySchema }) q: z.infer<typeof activityQuerySchema>,
  ): Promise<ActivityDTO[]> {
    const rows = await this.prisma.db.activityLog.findMany({
      where: {
        projectId: project.id,
        ...(q.entityType && { entityType: q.entityType }),
        ...(q.entityId !== undefined && { entityId: q.entityId }),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit,
    });
    const users = await loadUserRefs(
      this.prisma.db,
      rows.map((r) => r.userId),
    );
    return rows.map((r) => ({
      id: r.id,
      entityType: r.entityType,
      entityId: r.entityId,
      action: r.action,
      summary: r.summary,
      user: refOf(users, r.userId),
      createdAt: r.createdAt.toISOString(),
    }));
  }
}

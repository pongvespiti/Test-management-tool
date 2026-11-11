import { Injectable } from '@nestjs/common';
import type { ReleaseDTO, ReleaseInput, UpdateReleaseInput } from '@tmt/shared';
import { conflict, notFound } from '../../common/errors/app.exception.js';
import type { AuthUser, ProjectContext } from '../../common/types/auth.js';
import { parseDateOnly } from '../../common/users/user-refs.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ActivityService } from '../activity/activity.service.js';
import { toReleaseDTO } from './projects.mapper.js';

@Injectable()
export class ReleasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  /** Newest first: by start date (unset last), then id. */
  async list(projectId: number): Promise<ReleaseDTO[]> {
    const rows = await this.prisma.db.release.findMany({
      where: { projectId },
      orderBy: [{ startDate: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
    });
    return rows.map(toReleaseDTO);
  }

  async create(ctx: ProjectContext, me: AuthUser, input: ReleaseInput): Promise<ReleaseDTO> {
    return this.prisma.db.$transaction(async (tx) => {
      const r = await tx.release.create({
        data: {
          projectId: ctx.id,
          name: input.name,
          description: input.description ?? null,
          startDate: parseDateOnly(input.startDate) ?? null,
          endDate: parseDateOnly(input.endDate) ?? null,
          status: input.status,
        },
      });
      await this.activity.log(tx, {
        projectId: ctx.id,
        userId: me.id,
        entityType: 'release',
        entityId: r.id,
        action: 'created',
        summary: `Created release ${r.name}`,
      });
      return toReleaseDTO(r);
    });
  }

  async update(
    ctx: ProjectContext,
    me: AuthUser,
    releaseId: number,
    input: UpdateReleaseInput,
  ): Promise<ReleaseDTO> {
    await this.assertInProject(ctx.id, releaseId);
    return this.prisma.db.$transaction(async (tx) => {
      const r = await tx.release.update({
        where: { id: releaseId },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.description !== undefined && { description: input.description }),
          ...(input.startDate !== undefined && { startDate: parseDateOnly(input.startDate) }),
          ...(input.endDate !== undefined && { endDate: parseDateOnly(input.endDate) }),
          ...(input.status !== undefined && { status: input.status }),
        },
      });
      await this.activity.log(tx, {
        projectId: ctx.id,
        userId: me.id,
        entityType: 'release',
        entityId: releaseId,
        action: 'updated',
        summary: `Updated release ${r.name}`,
        data: input,
      });
      return toReleaseDTO(r);
    });
  }

  /** Releases used by test plans cannot be deleted (409 RELEASE_IN_USE). */
  async remove(ctx: ProjectContext, me: AuthUser, releaseId: number): Promise<void> {
    const release = await this.assertInProject(ctx.id, releaseId);
    const used = await this.prisma.db.testPlan.count({ where: { releaseId } });
    if (used) {
      throw conflict('RELEASE_IN_USE', `Release ${release.name} is used by ${used} test plan(s)`);
    }
    await this.prisma.db.$transaction(async (tx) => {
      await tx.release.delete({ where: { id: releaseId } });
      await this.activity.log(tx, {
        projectId: ctx.id,
        userId: me.id,
        entityType: 'release',
        entityId: releaseId,
        action: 'deleted',
        summary: `Deleted release ${release.name}`,
      });
    });
  }

  private async assertInProject(projectId: number, releaseId: number) {
    const r = await this.prisma.db.release.findFirst({ where: { id: releaseId, projectId } });
    if (!r) throw notFound('Release', 'RELEASE_NOT_FOUND');
    return r;
  }
}

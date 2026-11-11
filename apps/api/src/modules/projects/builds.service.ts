import { Injectable } from '@nestjs/common';
import type { BuildDTO, BuildInput, UpdateBuildInput } from '@tmt/shared';
import { conflict, notFound } from '../../common/errors/app.exception.js';
import { isUniqueViolation } from '../../common/errors/prisma-errors.js';
import type { AuthUser, ProjectContext } from '../../common/types/auth.js';
import { parseDateOnly } from '../../common/users/user-refs.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ActivityService } from '../activity/activity.service.js';
import { toBuildDTO } from './projects.mapper.js';

/** Unique index of `(release_id, name)`. */
export const BUILD_NAME_KEY = 'builds_release_id_name_key';

const WITH_COUNTS = {
  _count: { select: { runs: true, foundDefects: true, fixedDefects: true } },
} as const;

function nameTaken(name: string) {
  return conflict('BUILD_NAME_TAKEN', `Build ${name} already exists in this release`);
}

/** Builds of a release (e.g. `1.1.7(2.0.0)`), the application version a run was executed on. */
@Injectable()
export class BuildsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  /** Newest first: by build date (unset last), then id. All releases of the project, or one. */
  async list(projectId: number, releaseId?: number): Promise<BuildDTO[]> {
    if (releaseId !== undefined) await this.assertReleaseInProject(projectId, releaseId);
    const rows = await this.prisma.db.build.findMany({
      where: { release: { projectId }, ...(releaseId !== undefined && { releaseId }) },
      orderBy: [{ builtDate: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
      include: WITH_COUNTS,
    });
    return rows.map(toBuildDTO);
  }

  async create(
    ctx: ProjectContext,
    me: AuthUser,
    releaseId: number,
    input: BuildInput,
  ): Promise<BuildDTO> {
    await this.assertReleaseInProject(ctx.id, releaseId);
    try {
      return await this.prisma.db.$transaction(async (tx) => {
        const b = await tx.build.create({
          data: {
            releaseId,
            name: input.name,
            notes: input.notes ?? null,
            builtDate: parseDateOnly(input.builtDate) ?? null,
          },
          include: WITH_COUNTS,
        });
        await this.activity.log(tx, {
          projectId: ctx.id,
          userId: me.id,
          entityType: 'build',
          entityId: b.id,
          action: 'created',
          summary: `Created build ${b.name}`,
        });
        return toBuildDTO(b);
      });
    } catch (e) {
      if (isUniqueViolation(e, BUILD_NAME_KEY)) throw nameTaken(input.name);
      throw e;
    }
  }

  async update(
    ctx: ProjectContext,
    me: AuthUser,
    buildId: number,
    input: UpdateBuildInput,
  ): Promise<BuildDTO> {
    const build = await this.getInProject(ctx.id, buildId);
    try {
      return await this.prisma.db.$transaction(async (tx) => {
        const b = await tx.build.update({
          where: { id: buildId },
          data: {
            ...(input.name !== undefined && { name: input.name }),
            ...(input.notes !== undefined && { notes: input.notes }),
            ...(input.builtDate !== undefined && { builtDate: parseDateOnly(input.builtDate) }),
          },
          include: WITH_COUNTS,
        });
        await this.activity.log(tx, {
          projectId: ctx.id,
          userId: me.id,
          entityType: 'build',
          entityId: buildId,
          action: 'updated',
          summary: `Updated build ${b.name}`,
          data: input,
        });
        return toBuildDTO(b);
      });
    } catch (e) {
      if (isUniqueViolation(e, BUILD_NAME_KEY)) throw nameTaken(input.name ?? build.name);
      throw e;
    }
  }

  /** Builds used by runs or defects cannot be deleted (409 BUILD_IN_USE). */
  async remove(ctx: ProjectContext, me: AuthUser, buildId: number): Promise<void> {
    const build = await this.getInProject(ctx.id, buildId);
    const { runs, foundDefects, fixedDefects } = build._count;
    if (runs + foundDefects + fixedDefects > 0) {
      throw conflict(
        'BUILD_IN_USE',
        `Build ${build.name} is used by ${runs} run(s) and ${foundDefects + fixedDefects} defect(s)`,
      );
    }
    await this.prisma.db.$transaction(async (tx) => {
      await tx.build.delete({ where: { id: buildId } });
      await this.activity.log(tx, {
        projectId: ctx.id,
        userId: me.id,
        entityType: 'build',
        entityId: buildId,
        action: 'deleted',
        summary: `Deleted build ${build.name}`,
      });
    });
  }

  private async getInProject(projectId: number, buildId: number) {
    const b = await this.prisma.db.build.findFirst({
      where: { id: buildId, release: { projectId } },
      include: WITH_COUNTS,
    });
    if (!b) throw notFound('Build', 'BUILD_NOT_FOUND');
    return b;
  }

  private async assertReleaseInProject(projectId: number, releaseId: number): Promise<void> {
    const found = await this.prisma.db.release.count({ where: { id: releaseId, projectId } });
    if (!found) throw notFound('Release', 'RELEASE_NOT_FOUND');
  }
}

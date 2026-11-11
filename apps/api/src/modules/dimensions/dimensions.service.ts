import { Injectable } from '@nestjs/common';
import type { Prisma } from '@tmt/database';
import {
  canonicalizeEnvironment,
  type EnvDimension,
  type EnvDimensionsDTO,
  type EnvDimensionsInput,
  type EnvEntryDTO,
  type NormalizeRunsResultDTO,
} from '@tmt/shared';
import type { AuthUser, ProjectContext } from '../../common/types/auth.js';
import { PrismaService, type Db, type Tx } from '../../prisma/prisma.service.js';
import { ActivityService } from '../activity/activity.service.js';
import { envInput, envOf } from '../execution/execution.mapper.js';

/** Value sets stored on the project are written by this service only, so the shape is trusted. */
export function dimensionsOf(raw: unknown): EnvDimension[] {
  return Array.isArray(raw) ? (raw as EnvDimension[]) : [];
}

/**
 * Lists of values behind the run environment labels (Platform, OS ver, Unit model …). Saving a run
 * gives its values the spelling of the lists and adds the ones that are new, so the summary can
 * group and filter by them.
 */
@Injectable()
export class DimensionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  async get(projectId: number): Promise<EnvDimensionsDTO> {
    const row = await this.prisma.db.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { envDimensions: true },
    });
    return { dimensions: dimensionsOf(row.envDimensions) };
  }

  async replace(
    ctx: ProjectContext,
    me: AuthUser,
    input: EnvDimensionsInput,
  ): Promise<EnvDimensionsDTO> {
    await this.prisma.db.$transaction(async (tx) => {
      await tx.project.update({
        where: { id: ctx.id },
        data: { envDimensions: input.dimensions as unknown as Prisma.InputJsonValue },
      });
      await this.activity.log(tx, {
        projectId: ctx.id,
        userId: me.id,
        entityType: 'project',
        entityId: ctx.id,
        action: 'updated',
        summary: `Changed the environment lists (${input.dimensions.length} lists)`,
      });
    });
    return { dimensions: input.dimensions };
  }

  /**
   * Environment of a run to be saved, respelled to the lists; new values are added to the lists.
   * Call inside the transaction that saves the run (the project row is locked meanwhile).
   */
  async canonicalize(tx: Tx, projectId: number, entries: readonly EnvEntryDTO[]) {
    const dims = await this.lock(tx, projectId);
    if (dims.length === 0 || entries.length === 0) return entries.map((e) => ({ ...e }));
    const out = canonicalizeEnvironment(entries, dims);
    if (out.added > 0) await this.save(tx, projectId, out.dimensions);
    return out.entries;
  }

  /** Respells the environment of every run of the project and fills the lists from them. */
  async normalizeRuns(ctx: ProjectContext, me: AuthUser): Promise<NormalizeRunsResultDTO> {
    return this.prisma.db.$transaction(
      async (tx) => {
        let dims = await this.lock(tx, ctx.id);
        const runs = await tx.testRun.findMany({
          where: { plan: { projectId: ctx.id } },
          orderBy: { id: 'asc' },
          select: { id: true, environment: true },
        });
        let updatedRuns = 0;
        let addedValues = 0;
        for (const run of runs) {
          const before = envOf(run);
          const out = canonicalizeEnvironment(before, dims);
          dims = out.dimensions;
          addedValues += out.added;
          if (out.changed > 0) {
            await tx.testRun.update({
              where: { id: run.id },
              data: { environment: envInput(out.entries) },
            });
            updatedRuns += 1;
          }
        }
        if (addedValues > 0) await this.save(tx, ctx.id, dims);
        await this.activity.log(tx, {
          projectId: ctx.id,
          userId: me.id,
          entityType: 'project',
          entityId: ctx.id,
          action: 'updated',
          summary: `Tidied run environments: ${updatedRuns} runs changed, ${addedValues} values added to the lists`,
        });
        return { updatedRuns, addedValues };
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
  }

  private async lock(tx: Db, projectId: number): Promise<EnvDimension[]> {
    const rows = await tx.$queryRaw<{ env: unknown }[]>`
      SELECT env_dimensions AS env FROM projects WHERE id = ${projectId} FOR UPDATE`;
    return dimensionsOf(rows[0]?.env);
  }

  private async save(tx: Db, projectId: number, dims: EnvDimension[]): Promise<void> {
    await tx.project.update({
      where: { id: projectId },
      data: { envDimensions: dims as unknown as Prisma.InputJsonValue },
    });
  }
}

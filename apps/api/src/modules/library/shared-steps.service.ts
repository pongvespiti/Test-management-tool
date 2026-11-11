import { Injectable } from '@nestjs/common';
import { Prisma, type SharedStep, type TestCase } from '@tmt/database';
import {
  displayId,
  type CaseRefDTO,
  type CreateSharedStepInput,
  type SharedStepDetailDTO,
  type SharedStepDTO,
  type UpdateSharedStepInput,
} from '@tmt/shared';
import { conflict, notFound } from '../../common/errors/app.exception.js';
import { isRecordNotFound, isUniqueViolation } from '../../common/errors/prisma-errors.js';
import type { AuthUser, ProjectContext } from '../../common/types/auth.js';
import { loadUserRefs } from '../../common/users/user-refs.js';
import { PrismaService, type Db } from '../../prisma/prisma.service.js';
import { ActivityService } from '../activity/activity.service.js';
import { LONG_TX } from './library.errors.js';
import { rawCaseSteps } from './library.mapper.js';
import { insertVersions, logActivities } from './review-transitions.js';
import {
  inlineSharedStep,
  normalizePlainSteps,
  plainStepsOf,
  toSharedStepDTO,
} from './shared-steps.mapper.js';

/** Most cases listed in `usedBy`. */
const USED_BY_LIMIT = 200;
/** Unique index of shared step names per project. */
const NAME_UNIQUE = 'shared_steps_project_id_name_key';

function nameTaken(name: string) {
  return conflict('SHARED_STEP_NAME_TAKEN', `A shared step named “${name}” already exists`);
}

const staleSharedStep = (details?: unknown) =>
  conflict('VERSION_CONFLICT', 'Someone else changed this shared step — reload it', details);

/** Live cases of the project whose steps reference shared step `id` (`steps @> …`, GIN index). */
export function usesSharedStep(projectId: number, id: number): Prisma.TestCaseWhereInput {
  return {
    isDeleted: false,
    suite: { projectId },
    steps: { array_contains: [{ kind: 'shared', sharedStepId: id }] },
  };
}

/** A shared step of the project (404 SHARED_STEP_NOT_FOUND otherwise). */
export async function getSharedStepInProject(
  db: Db,
  projectId: number,
  id: number,
): Promise<SharedStep> {
  const row = await db.sharedStep.findFirst({ where: { id, projectId } });
  if (!row) throw notFound('Shared step', 'SHARED_STEP_NOT_FOUND');
  return row;
}

/** Reusable step sets: CRUD, usage by live cases, versioning and inline-on-delete. */
@Injectable()
export class SharedStepsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  /** Shared steps by name (case-insensitive), with usage counts. */
  async list(projectId: number): Promise<SharedStepDTO[]> {
    const db = this.prisma.db;
    const order = await db.$queryRaw<{ id: number }[]>`
      SELECT id FROM shared_steps WHERE project_id = ${projectId} ORDER BY lower(name), id`;
    const rows = await db.sharedStep.findMany({ where: { projectId } });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const sorted = order.flatMap(({ id }) => byId.get(id) ?? []);
    const counts = await db.$queryRaw<{ id: number; n: number }[]>`
      SELECT (s.value ->> 'sharedStepId')::int AS id, count(DISTINCT tc.id)::int AS n
      FROM test_cases tc
      JOIN suites su ON su.id = tc.suite_id
      CROSS JOIN LATERAL jsonb_array_elements(tc.steps) AS s(value)
      WHERE su.project_id = ${projectId}
        AND NOT tc.is_deleted
        AND tc.steps @> '[{"kind":"shared"}]'::jsonb
        AND s.value ->> 'kind' = 'shared'
      GROUP BY 1`;
    const usage = new Map(counts.map((c) => [c.id, c.n]));
    const users = await loadUserRefs(
      db,
      sorted.flatMap((r) => [r.createdById, r.updatedById]),
    );
    return sorted.map((r) => toSharedStepDTO(r, usage.get(r.id) ?? 0, users));
  }

  async create(
    ctx: ProjectContext,
    me: AuthUser,
    input: CreateSharedStepInput,
  ): Promise<SharedStepDTO> {
    await this.assertNameFree(ctx.id, input.name);
    try {
      const created = await this.prisma.db.$transaction(async (tx) => {
        const row = await tx.sharedStep.create({
          data: {
            projectId: ctx.id,
            name: input.name,
            description: input.description ?? null,
            steps: normalizePlainSteps(input.steps) as unknown as Prisma.InputJsonValue,
            createdById: me.id,
            updatedById: me.id,
          },
        });
        await this.activity.log(tx, {
          projectId: ctx.id,
          userId: me.id,
          entityType: 'shared_step',
          entityId: row.id,
          action: 'created',
          summary: `Created shared step ${row.name}`,
        });
        return row;
      });
      return await this.toDTO(ctx.id, created);
    } catch (e) {
      if (isUniqueViolation(e, NAME_UNIQUE)) throw nameTaken(input.name);
      throw e;
    }
  }

  /** The shared step with the live cases using it (max 200, library order). */
  async get(projectId: number, id: number): Promise<SharedStepDetailDTO> {
    const db = this.prisma.db;
    const row = await getSharedStepInProject(db, projectId, id);
    const usedBy = await db.testCase.findMany({
      where: usesSharedStep(projectId, row.id),
      select: {
        id: true,
        suiteId: true,
        seq: true,
        code: true,
        title: true,
        suite: { select: { prefix: true } },
      },
      orderBy: [{ suite: { sortOrder: 'asc' } }, { suiteId: 'asc' }, { seq: 'asc' }],
      take: USED_BY_LIMIT,
    });
    return {
      ...(await this.toDTO(projectId, row)),
      usedBy: usedBy.map((u): CaseRefDTO => ({
        id: u.id,
        suiteId: u.suiteId,
        displayId: displayId(u.suite.prefix, u.seq),
        code: u.code,
        title: u.title,
      })),
    };
  }

  /** Updates name/description/steps (version +1); `version` in the body must match. */
  async update(
    ctx: ProjectContext,
    me: AuthUser,
    id: number,
    input: UpdateSharedStepInput,
  ): Promise<SharedStepDTO> {
    const row = await getSharedStepInProject(this.prisma.db, ctx.id, id);
    if (input.version !== undefined && input.version !== row.version) {
      throw staleSharedStep({ currentVersion: row.version });
    }
    if (input.name !== undefined) await this.assertNameFree(ctx.id, input.name, row.id);
    try {
      const updated = await this.prisma.db.$transaction(async (tx) => {
        const u = await tx.sharedStep
          .update({
            where: { id: row.id, version: row.version },
            data: {
              ...(input.name !== undefined && { name: input.name }),
              ...(input.description !== undefined && { description: input.description }),
              ...(input.steps !== undefined && {
                steps: normalizePlainSteps(input.steps) as unknown as Prisma.InputJsonValue,
              }),
              version: { increment: 1 },
              updatedById: me.id,
            },
          })
          .catch((e: unknown) => {
            throw isRecordNotFound(e) ? staleSharedStep() : e;
          });
        await this.activity.log(tx, {
          projectId: ctx.id,
          userId: me.id,
          entityType: 'shared_step',
          entityId: u.id,
          action: 'updated',
          summary: `Updated shared step ${u.name} (v${u.version})`,
        });
        return u;
      });
      return await this.toDTO(ctx.id, updated);
    } catch (e) {
      if (isUniqueViolation(e, NAME_UNIQUE)) throw nameTaken(input.name ?? row.name);
      throw e;
    }
  }

  /**
   * Deletes a shared step. Used by live cases → 409 SHARED_STEP_IN_USE unless `inline`, which
   * first copies its steps into every using case (version +1 each).
   */
  async remove(ctx: ProjectContext, me: AuthUser, id: number, inline: boolean): Promise<void> {
    const row = await getSharedStepInProject(this.prisma.db, ctx.id, id);
    await this.prisma.db.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<{ id: number }[]>`
        SELECT id FROM shared_steps WHERE id = ${row.id} FOR UPDATE`;
      if (!locked) throw notFound('Shared step', 'SHARED_STEP_NOT_FOUND');
      const current = await tx.sharedStep.findUniqueOrThrow({ where: { id: row.id } });
      const reference = JSON.stringify([{ kind: 'shared', sharedStepId: row.id }]);
      const usingIds = await tx.$queryRaw<{ id: number }[]>`
        SELECT tc.id FROM test_cases tc JOIN suites su ON su.id = tc.suite_id
        WHERE su.project_id = ${ctx.id} AND NOT tc.is_deleted AND tc.steps @> ${reference}::jsonb
        ORDER BY tc.id FOR UPDATE OF tc`;
      if (usingIds.length > 0 && !inline) {
        throw conflict(
          'SHARED_STEP_IN_USE',
          `${usingIds.length} test case(s) use this shared step — inline it into them or remove it from them first`,
          { usageCount: usingIds.length },
        );
      }
      const using = await tx.testCase.findMany({
        where: { id: { in: usingIds.map((u) => u.id) } },
        include: { suite: { select: { prefix: true } } },
        orderBy: { id: 'asc' },
      });
      const plain = plainStepsOf(current.steps);
      const changed: TestCase[] = [];
      for (const c of using) {
        const steps = inlineSharedStep(rawCaseSteps(c.steps), row.id, plain);
        changed.push(
          await tx.testCase.update({
            where: { id: c.id },
            data: {
              steps: steps as unknown as Prisma.InputJsonValue,
              version: { increment: 1 },
              updatedById: me.id,
            },
          }),
        );
      }
      await insertVersions(tx, changed, me.id);
      await logActivities(
        tx,
        ctx.id,
        me.id,
        using.map((c) => ({
          entityType: 'test_case',
          entityId: c.id,
          action: 'updated',
          summary: `Inlined shared step ${current.name} into ${displayId(c.suite.prefix, c.seq)} ${c.title}`,
          data: { sharedStepId: row.id },
        })),
      );
      await tx.sharedStep.delete({ where: { id: row.id } });
      await this.activity.log(tx, {
        projectId: ctx.id,
        userId: me.id,
        entityType: 'shared_step',
        entityId: row.id,
        action: 'deleted',
        summary: `Deleted shared step ${current.name}${using.length ? ` (inlined into ${using.length} case(s))` : ''}`,
      });
    }, LONG_TX);
  }

  private async toDTO(projectId: number, row: SharedStep): Promise<SharedStepDTO> {
    const db = this.prisma.db;
    const users = await loadUserRefs(db, [row.createdById, row.updatedById]);
    const usage = await db.testCase.count({ where: usesSharedStep(projectId, row.id) });
    return toSharedStepDTO(row, usage, users);
  }

  /** Names are unique per project, case-insensitively (409 SHARED_STEP_NAME_TAKEN). */
  private async assertNameFree(projectId: number, name: string, exceptId = 0): Promise<void> {
    const [taken] = await this.prisma.db.$queryRaw<{ id: number }[]>`
      SELECT id FROM shared_steps
      WHERE project_id = ${projectId} AND lower(name) = lower(${name}) AND id <> ${exceptId}
      LIMIT 1`;
    if (taken) throw nameTaken(name);
  }
}

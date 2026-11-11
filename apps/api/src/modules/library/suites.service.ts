import { Injectable } from '@nestjs/common';
import type { Prisma } from '@tmt/database';
import type { CreateSuiteInput, SuiteDTO, UpdateSuiteInput } from '@tmt/shared';
import { conflict } from '../../common/errors/app.exception.js';
import { isUniqueViolation } from '../../common/errors/prisma-errors.js';
import type { AuthUser, ProjectContext } from '../../common/types/auth.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ActivityService } from '../activity/activity.service.js';
import { purgeCollab } from '../collab/attachments.queries.js';
import { StorageService } from '../storage/storage.service.js';
import { fieldDefsOf, toSuiteDTO } from './library.mapper.js';
import { SUITE_PREFIX_UNIQUE, suitePrefixTaken } from './library.errors.js';
import { getSuite } from './library.queries.js';

/** Suites of a project: custom fields, environment template, archive and delete rules. */
@Injectable()
export class SuitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly storage: StorageService,
  ) {}

  /** Suites by sort order, then name, with their live case counts. */
  async list(projectId: number, includeArchived: boolean): Promise<SuiteDTO[]> {
    const db = this.prisma.db;
    const rows = await db.suite.findMany({
      where: { projectId, ...(!includeArchived && { isArchived: false }) },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    const counts = await db.testCase.groupBy({
      by: ['suiteId'],
      where: { isDeleted: false, suite: { projectId } },
      _count: { _all: true },
    });
    const bySuite = new Map(counts.map((c) => [c.suiteId, c._count._all]));
    return rows.map((s) => toSuiteDTO(s, bySuite.get(s.id) ?? 0));
  }

  async get(projectId: number, suiteId: number): Promise<SuiteDTO> {
    const suite = await getSuite(this.prisma.db, projectId, suiteId);
    return toSuiteDTO(suite, await this.caseCount(suite.id));
  }

  /** Creates a suite at the end of the project's suite list. */
  async create(ctx: ProjectContext, me: AuthUser, input: CreateSuiteInput): Promise<SuiteDTO> {
    await this.assertPrefixFree(ctx.id, input.prefix);
    try {
      const suite = await this.prisma.db.$transaction(async (tx) => {
        const agg = await tx.suite.aggregate({
          where: { projectId: ctx.id },
          _max: { sortOrder: true },
        });
        const s = await tx.suite.create({
          data: {
            projectId: ctx.id,
            name: input.name,
            prefix: input.prefix,
            description: input.description ?? null,
            fieldDefs: input.fieldDefs as Prisma.InputJsonValue,
            envTemplate: input.envTemplate,
            sortOrder: (agg._max.sortOrder ?? 0) + 1,
          },
        });
        await this.activity.log(tx, {
          projectId: ctx.id,
          userId: me.id,
          entityType: 'suite',
          entityId: s.id,
          action: 'created',
          summary: `Created suite ${s.name}`,
        });
        return s;
      });
      return toSuiteDTO(suite, 0);
    } catch (e) {
      if (isUniqueViolation(e, SUITE_PREFIX_UNIQUE)) throw suitePrefixTaken(input.prefix);
      throw e;
    }
  }

  /** Updates a suite; custom fields removed from `fieldDefs` are stripped from its cases. */
  async update(
    ctx: ProjectContext,
    me: AuthUser,
    suiteId: number,
    input: UpdateSuiteInput,
  ): Promise<SuiteDTO> {
    const suite = await getSuite(this.prisma.db, ctx.id, suiteId);
    if (input.prefix && input.prefix !== suite.prefix) {
      await this.assertPrefixFree(ctx.id, input.prefix);
    }
    try {
      const updated = await this.prisma.db.$transaction(async (tx) => {
        if (input.fieldDefs) {
          const kept = new Set(input.fieldDefs.map((d) => d.key));
          for (const d of fieldDefsOf(suite).filter((f) => !kept.has(f.key))) {
            await tx.$executeRaw`UPDATE test_cases SET custom = custom - ${d.key}::text
              WHERE suite_id = ${suite.id} AND custom ? ${d.key}::text`;
          }
        }
        const s = await tx.suite.update({
          where: { id: suite.id },
          data: {
            ...(input.name !== undefined && { name: input.name }),
            ...(input.prefix !== undefined && { prefix: input.prefix }),
            ...(input.description !== undefined && { description: input.description }),
            ...(input.fieldDefs !== undefined && {
              fieldDefs: input.fieldDefs as Prisma.InputJsonValue,
            }),
            ...(input.envTemplate !== undefined && { envTemplate: input.envTemplate }),
            ...(input.isArchived !== undefined && { isArchived: input.isArchived }),
            ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
          },
        });
        await this.activity.log(tx, {
          projectId: ctx.id,
          userId: me.id,
          entityType: 'suite',
          entityId: suite.id,
          action: 'updated',
          summary: `Updated suite ${s.name}`,
          data: input,
        });
        return s;
      });
      return toSuiteDTO(updated, await this.caseCount(updated.id));
    } catch (e) {
      if (isUniqueViolation(e, SUITE_PREFIX_UNIQUE)) throw suitePrefixTaken(input.prefix ?? '');
      throw e;
    }
  }

  /** Deletes a suite without runs (409 SUITE_IN_USE otherwise) with its cases' comments/files. */
  async remove(ctx: ProjectContext, me: AuthUser, suiteId: number): Promise<void> {
    const db = this.prisma.db;
    const suite = await getSuite(db, ctx.id, suiteId);
    const used = await db.testRun.findFirst({ where: { suiteId: suite.id }, select: { id: true } });
    if (used) throw conflict('SUITE_IN_USE', 'Test runs use this suite — archive it instead');
    const keys = await db.$transaction(async (tx) => {
      // Case comments/attachments are polymorphic (no FK): remove them with the suite's cases.
      const cases = await tx.testCase.findMany({
        where: { suiteId: suite.id },
        select: { id: true },
      });
      const removed = await purgeCollab(
        tx,
        'test_case',
        cases.map((c) => c.id),
      );
      await tx.suite.delete({ where: { id: suite.id } });
      await this.activity.log(tx, {
        projectId: ctx.id,
        userId: me.id,
        entityType: 'suite',
        entityId: suite.id,
        action: 'deleted',
        summary: `Deleted suite ${suite.name}`,
      });
      return removed;
    });
    await this.storage.removeMany(keys);
  }

  private caseCount(suiteId: number): Promise<number> {
    return this.prisma.db.testCase.count({ where: { suiteId, isDeleted: false } });
  }

  private async assertPrefixFree(projectId: number, prefix: string): Promise<void> {
    const taken = await this.prisma.db.suite.findFirst({
      where: { projectId, prefix },
      select: { id: true },
    });
    if (taken) throw suitePrefixTaken(prefix);
  }
}

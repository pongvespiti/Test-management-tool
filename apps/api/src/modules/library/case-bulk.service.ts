import { Injectable } from '@nestjs/common';
import { Prisma, type Suite, type TestCase } from '@tmt/database';
import { can, requiredRole, type BulkCasesInput, type PermissionKey } from '@tmt/shared';
import { forbidden } from '../../common/errors/app.exception.js';
import type { AuthUser, ProjectContext } from '../../common/types/auth.js';
import { PrismaService, type Db } from '../../prisma/prisma.service.js';
import { ActivityService } from '../activity/activity.service.js';
import {
  assertReviewer,
  assertSectionInSuite,
  assertStatusChange,
  loadReviewPolicy,
} from './case-rules.js';
import { LONG_TX } from './library.errors.js';
import { getSuite } from './library.queries.js';
import { decideReview, insertVersions, submitForReview } from './review-transitions.js';
import { loadSectionTree } from './section-tree.js';

/** Most tags a case keeps (same limit as `tagsSchema`). */
const MAX_TAGS = 30;

/** Tags of `current` plus `add` (case-insensitive, existing spelling wins), capped at 30. */
export function withTags(current: readonly string[], add: readonly string[]): string[] {
  const seen = new Set(current.map((t) => t.toLowerCase()));
  const out = [...current];
  for (const t of add) {
    if (out.length >= MAX_TAGS) break;
    if (!seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase());
      out.push(t);
    }
  }
  return out;
}

/** Tags of `current` without `remove` (case-insensitive). */
export function withoutTags(current: readonly string[], remove: readonly string[]): string[] {
  const drop = new Set(remove.map((t) => t.toLowerCase()));
  return current.filter((t) => !drop.has(t.toLowerCase()));
}

function sameTags(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((t, i) => t === b[i]);
}

function assertCan(ctx: ProjectContext, permission: PermissionKey): void {
  if (!can(ctx.role, permission)) {
    throw forbidden(`This action needs the ${requiredRole(permission)} role`);
  }
}

/** Bulk actions on live cases of one suite; cases outside the suite or state are skipped. */
@Injectable()
export class CaseBulkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  /** Runs the action (`delete` and `approve` need the lead role) and reports the changed cases. */
  async run(
    ctx: ProjectContext,
    me: AuthUser,
    suiteId: number,
    body: BulkCasesInput,
  ): Promise<{ affected: number }> {
    const db = this.prisma.db;
    const suite = await getSuite(db, ctx.id, suiteId);
    if (body.action === 'delete') assertCan(ctx, 'deleteLibrary');
    if (body.action === 'approve') assertCan(ctx, 'reviewCases');
    if (body.action === 'move') {
      assertSectionInSuite(await loadSectionTree(db, suite.id), body.sectionId);
    }
    if (body.action === 'setStatus') {
      assertStatusChange(null, body.status, await loadReviewPolicy(db, ctx.id, ctx.role));
    }
    if (body.action === 'submitReview') await assertReviewer(db, ctx.id, body.reviewerId);
    const affected = await db.$transaction(async (tx) => {
      const rows = await this.apply(tx, ctx, me, suite, [...new Set(body.ids)], body);
      await this.activity.log(tx, {
        projectId: ctx.id,
        userId: me.id,
        entityType: 'suite',
        entityId: suite.id,
        action: `bulk_${body.action}`,
        summary: `Bulk ${body.action} on ${rows.length} cases in ${suite.name}`,
        data: { ids: rows.map((r) => r.id) },
      });
      return rows.length;
    }, LONG_TX);
    return { affected };
  }

  private async apply(
    tx: Db,
    ctx: ProjectContext,
    me: AuthUser,
    suite: Suite,
    ids: number[],
    body: BulkCasesInput,
  ): Promise<TestCase[]> {
    const scope = { suiteId: suite.id, id: { in: ids }, isDeleted: false };
    const transition = { projectId: ctx.id, userId: me.id, prefixOf: () => suite.prefix };
    const change = { version: { increment: 1 }, updatedById: me.id };
    switch (body.action) {
      case 'submitReview': {
        const inSuite = await tx.testCase.findMany({ where: scope, select: { id: true } });
        return submitForReview(
          tx,
          transition,
          inSuite.map((r) => r.id),
          { reviewerId: body.reviewerId ?? null, note: null },
        );
      }
      case 'approve': {
        const inSuite = await tx.testCase.findMany({ where: scope, select: { id: true } });
        return decideReview(
          tx,
          transition,
          inSuite.map((r) => r.id),
          { decision: 'approve', note: null },
        );
      }
      case 'addTags':
      case 'removeTags': {
        const current = await tx.$queryRaw<{ id: number; tags: string[] }[]>`
          SELECT id, tags FROM test_cases
          WHERE suite_id = ${suite.id} AND id IN (${Prisma.join(ids)}) AND NOT is_deleted
          ORDER BY id FOR UPDATE`;
        const rows: TestCase[] = [];
        for (const r of current) {
          const after =
            body.action === 'addTags'
              ? withTags(r.tags, body.tags)
              : withoutTags(r.tags, body.tags);
          if (sameTags(r.tags, after)) continue;
          rows.push(
            await tx.testCase.update({ where: { id: r.id }, data: { tags: after, ...change } }),
          );
        }
        await insertVersions(tx, rows, me.id);
        return rows;
      }
      case 'setPriority': {
        const rows = await tx.testCase.updateManyAndReturn({
          where: { ...scope, priority: { not: body.priority } },
          data: { priority: body.priority, ...change },
        });
        await insertVersions(tx, rows, me.id);
        return rows;
      }
      case 'delete':
        return tx.testCase.updateManyAndReturn({
          where: scope,
          data: { isDeleted: true, updatedById: me.id },
        });
      default: {
        const set =
          body.action === 'move'
            ? { sectionId: body.sectionId }
            : body.action === 'setStatus'
              ? { status: body.status }
              : { caseType: body.caseType };
        const rows = await tx.testCase.updateManyAndReturn({
          where: scope,
          data: { ...set, ...change },
        });
        await insertVersions(tx, rows, me.id);
        return rows;
      }
    }
  }
}

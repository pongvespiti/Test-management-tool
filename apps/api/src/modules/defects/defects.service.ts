import { textMessage } from '@tmt/shared';
import { Injectable } from '@nestjs/common';
import {
  DEFECT_STATUS_LABELS,
  DEFECT_TRANSITIONS,
  defectKey,
  type CreateDefectInput,
  type DefectDTO,
  type DefectListItem,
  type ListDefectsQuery,
  type Paged,
  type TransitionDefectInput,
  type UpdateDefectInput,
} from '@tmt/shared';
import { conflict, notFound, unprocessable } from '../../common/errors/app.exception.js';
import { paged, pageWindow } from '../../common/http/pagination.js';
import type { AuthUser, ProjectContext } from '../../common/types/auth.js';
import { assertActiveUser } from '../../common/users/user-refs.js';
import { PrismaService, type Db } from '../../prisma/prisma.service.js';
import { ActivityService } from '../activity/activity.service.js';
import { purgeCollab } from '../collab/attachments.queries.js';
import { assertReleaseInProject, getRunCaseInProject } from '../execution/execution.queries.js';
import { StorageService } from '../storage/storage.service.js';
import { defectListWhere, newDefectData, transitionPatch } from './defect-rules.js';
import {
  assertBuildsInProject,
  buildDefectDTO,
  buildDefectListItems,
  getDefectInProject,
} from './defects.queries.js';
import { notifyUsers } from '../notifications/notify.js';

/**
 * Reserves the next defect number of the project (atomic increment of `next_defect_seq`).
 * Plain SQL keeps `projects.updated_at` untouched as in API v1 — Prisma's `@updatedAt` would
 * stamp the project on every reported defect.
 */
export async function allocateDefectSeq(tx: Db, projectId: number): Promise<number> {
  const [row] = await tx.$queryRaw<{ seq: number }[]>`
    UPDATE projects SET next_defect_seq = next_defect_seq + 1
    WHERE id = ${projectId}
    RETURNING next_defect_seq - 1 AS seq`;
  if (!row) throw notFound('Project', 'PROJECT_NOT_FOUND');
  return Number(row.seq);
}

/** Defects: list, report (optionally from a run case), edit, workflow, result links, delete. */
@Injectable()
export class DefectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly storage: StorageService,
  ) {}

  /** One page of the project's defects, newest first. */
  async list(projectId: number, q: ListDefectsQuery): Promise<Paged<DefectListItem>> {
    const db = this.prisma.db;
    const where = defectListWhere(projectId, q);
    const total = await db.defect.count({ where });
    const rows = await db.defect.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...pageWindow(q.page, q.pageSize),
    });
    return paged(await buildDefectListItems(db, rows), total, q.page, q.pageSize);
  }

  async get(projectId: number, defectId: number): Promise<DefectDTO> {
    const db = this.prisma.db;
    return buildDefectDTO(db, await getDefectInProject(db, projectId, defectId));
  }

  /** Reports a defect; with `runCaseId` it is prefilled from and linked to that result. */
  async create(ctx: ProjectContext, me: AuthUser, body: CreateDefectInput): Promise<DefectDTO> {
    const db = this.prisma.db;
    await assertActiveUser(db, body.assigneeId);
    await assertReleaseInProject(db, ctx.id, body.releaseId);
    await assertBuildsInProject(db, ctx.id, [body.foundInBuildId, body.fixedInBuildId]);
    const source = body.runCaseId ? await getRunCaseInProject(db, ctx.id, body.runCaseId) : null;
    const created = await db.$transaction(async (tx) => {
      const seq = await allocateDefectSeq(tx, ctx.id);
      const d = await tx.defect.create({ data: newDefectData(ctx.id, seq, me.id, body, source) });
      if (source) {
        await tx.defectLink.create({
          data: { defectId: d.id, runCaseId: source.rc.id, testCaseId: source.rc.testCaseId },
        });
      }
      const origin = source ? ` from ${source.rc.displayId} in run ${source.run.code}` : '';
      await this.activity.log(tx, {
        projectId: ctx.id,
        userId: me.id,
        entityType: 'defect',
        entityId: d.id,
        action: 'created',
        summary: `Reported ${defectKey(seq)} ${d.title}${origin}`,
      });
      return d;
    });
    return buildDefectDTO(db, created);
  }

  /** Changes the fields present in the body (PATCH semantics). */
  async update(
    ctx: ProjectContext,
    me: AuthUser,
    defectId: number,
    body: UpdateDefectInput,
  ): Promise<DefectDTO> {
    const db = this.prisma.db;
    const d = await getDefectInProject(db, ctx.id, defectId);
    await assertActiveUser(db, body.assigneeId);
    await assertReleaseInProject(db, ctx.id, body.releaseId);
    await assertBuildsInProject(db, ctx.id, [body.foundInBuildId, body.fixedInBuildId]);
    const updated = await db.$transaction(async (tx) => {
      const u = await tx.defect.update({
        where: { id: d.id },
        data: { ...body, updatedAt: new Date() },
      });
      await this.activity.log(tx, {
        projectId: ctx.id,
        userId: me.id,
        entityType: 'defect',
        entityId: d.id,
        action: 'updated',
        summary: `Updated ${defectKey(d.seq)} ${u.title}`,
        data: body,
      });
      return u;
    });
    return buildDefectDTO(db, updated);
  }

  /**
   * Moves the defect along DEFECT_TRANSITIONS (422 INVALID_TRANSITION otherwise). The status is
   * compared on write, so a concurrent move answers 409 DEFECT_CHANGED instead of overwriting.
   */
  async transition(
    ctx: ProjectContext,
    me: AuthUser,
    defectId: number,
    body: TransitionDefectInput,
  ): Promise<DefectDTO> {
    const db = this.prisma.db;
    const d = await getDefectInProject(db, ctx.id, defectId);
    const from = d.status;
    const allowed = DEFECT_TRANSITIONS[from];
    if (!allowed.includes(body.to)) {
      throw unprocessable(
        'INVALID_TRANSITION',
        `${defectKey(d.seq)} cannot move from ${DEFECT_STATUS_LABELS[from]} to ${DEFECT_STATUS_LABELS[body.to]}`,
        { from, to: body.to, allowed },
      );
    }
    const updated = await db.$transaction(async (tx) => {
      const now = new Date();
      const { count } = await tx.defect.updateMany({
        where: { id: d.id, status: from },
        data: { status: body.to, updatedAt: now, ...transitionPatch(body.to, now) },
      });
      if (count === 0) {
        throw conflict(
          'DEFECT_CHANGED',
          'The defect was changed by someone else — reload and try again',
        );
      }
      if (body.comment) {
        await tx.comment.create({
          data: {
            projectId: ctx.id,
            entityType: 'defect',
            entityId: d.id,
            body: body.comment,
            authorId: me.id,
          },
        });
      }
      await this.activity.log(tx, {
        projectId: ctx.id,
        userId: me.id,
        entityType: 'defect',
        entityId: d.id,
        action: 'transitioned',
        summary: `${defectKey(d.seq)}: ${DEFECT_STATUS_LABELS[from]} → ${DEFECT_STATUS_LABELS[body.to]}`,
        data: { from, to: body.to },
      });
      const after = await tx.defect.findUniqueOrThrow({ where: { id: d.id } });
      if (body.to === 'resolved') {
        // The reporter (and the assignee) can now retest the fix.
        await notifyUsers(
          tx,
          [after.reporterId, after.assigneeId].map((userId) => ({
            userId,
            projectId: ctx.id,
            kind: 'retest' as const,
            message: {
              title: { key: 'defect_retest' as const, vars: { key: defectKey(d.seq) } },
              body: textMessage(d.title),
            },
            link: `/projects/${ctx.id}/defects/${d.id}`,
            dedupeKey: `retest:${d.id}:${now.getTime()}`,
          })),
          me.id,
        );
      }
      return after;
    });
    return buildDefectDTO(db, updated);
  }

  /** Links the defect to a run case of the project; linking twice is a no-op. */
  async link(
    ctx: ProjectContext,
    me: AuthUser,
    defectId: number,
    runCaseId: number,
  ): Promise<DefectDTO> {
    const db = this.prisma.db;
    const d = await getDefectInProject(db, ctx.id, defectId);
    const { rc, run } = await getRunCaseInProject(db, ctx.id, runCaseId);
    await db.$transaction(async (tx) => {
      // ON CONFLICT DO NOTHING on the (defect, run case) unique index keeps the call idempotent.
      const { count } = await tx.defectLink.createMany({
        data: [{ defectId: d.id, runCaseId: rc.id, testCaseId: rc.testCaseId }],
        skipDuplicates: true,
      });
      if (count === 0) return;
      await tx.defect.update({ where: { id: d.id }, data: { updatedAt: new Date() } });
      await this.activity.log(tx, {
        projectId: ctx.id,
        userId: me.id,
        entityType: 'defect',
        entityId: d.id,
        action: 'linked',
        summary: `Linked ${defectKey(d.seq)} to ${rc.displayId} in run ${run.code}`,
      });
    });
    return this.get(ctx.id, d.id);
  }

  /** Removes one result link of the defect (404 LINK_NOT_FOUND). */
  async unlink(ctx: ProjectContext, me: AuthUser, defectId: number, linkId: number): Promise<void> {
    const db = this.prisma.db;
    const d = await getDefectInProject(db, ctx.id, defectId);
    await db.$transaction(async (tx) => {
      const { count } = await tx.defectLink.deleteMany({ where: { id: linkId, defectId: d.id } });
      if (count === 0) throw notFound('Defect link', 'LINK_NOT_FOUND');
      await tx.defect.update({ where: { id: d.id }, data: { updatedAt: new Date() } });
      await this.activity.log(tx, {
        projectId: ctx.id,
        userId: me.id,
        entityType: 'defect',
        entityId: d.id,
        action: 'unlinked',
        summary: `Removed a result link from ${defectKey(d.seq)}`,
      });
    });
  }

  /** Deletes the defect with its comments and files (files are removed after the commit). */
  async remove(ctx: ProjectContext, me: AuthUser, defectId: number): Promise<void> {
    const db = this.prisma.db;
    const d = await getDefectInProject(db, ctx.id, defectId);
    const keys = await db.$transaction(async (tx) => {
      const removed = await purgeCollab(tx, 'defect', [d.id]);
      await tx.defect.delete({ where: { id: d.id } });
      await this.activity.log(tx, {
        projectId: ctx.id,
        userId: me.id,
        entityType: 'defect',
        entityId: d.id,
        action: 'deleted',
        summary: `Deleted ${defectKey(d.seq)} ${d.title}`,
      });
      return removed;
    });
    await this.storage.removeMany(keys);
  }
}

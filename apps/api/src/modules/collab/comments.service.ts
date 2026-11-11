import { Injectable } from '@nestjs/common';
import type { CommentEntityType } from '@tmt/database';
import { roleAtLeast, type CommentDTO, type CreateCommentInput } from '@tmt/shared';
import { forbidden, notFound } from '../../common/errors/app.exception.js';
import type { AuthUser, ProjectContext } from '../../common/types/auth.js';
import { loadUserRefs } from '../../common/users/user-refs.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ActivityService } from '../activity/activity.service.js';
import { StorageService } from '../storage/storage.service.js';
import { purgeAttachments } from './attachments.queries.js';
import { toCommentDTO } from './comments.mapper.js';
import { resolveEntity } from './entities.queries.js';

/** Longest part of a comment quoted in its activity entry. */
const SUMMARY_QUOTE = 120;

/** Comments on defects, run cases, test cases and plans (also allowed on completed plans). */
@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly storage: StorageService,
  ) {}

  /** Comments of one entity, oldest first. */
  async list(
    projectId: number,
    entityType: CommentEntityType,
    entityId: number,
  ): Promise<CommentDTO[]> {
    const db = this.prisma.db;
    const rows = await db.comment.findMany({
      where: { projectId, entityType, entityId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const users = await loadUserRefs(
      db,
      rows.map((r) => r.authorId),
    );
    return rows.map((r) => toCommentDTO(r, users));
  }

  async create(ctx: ProjectContext, me: AuthUser, body: CreateCommentInput): Promise<CommentDTO> {
    const db = this.prisma.db;
    const target = await resolveEntity(db, ctx.id, body.entityType, body.entityId);
    const created = await db.$transaction(async (tx) => {
      const c = await tx.comment.create({
        data: {
          projectId: ctx.id,
          entityType: body.entityType,
          entityId: body.entityId,
          body: body.body,
          authorId: me.id,
        },
      });
      const quote = body.body.replace(/\s+/g, ' ').slice(0, SUMMARY_QUOTE);
      await this.activity.log(tx, {
        projectId: ctx.id,
        userId: me.id,
        entityType: body.entityType,
        entityId: body.entityId,
        action: 'commented',
        summary: `Commented on ${target.label}: ${quote}`,
      });
      return c;
    });
    return toCommentDTO(created, await loadUserRefs(db, [me.id]));
  }

  /** Deletes a comment and its files — the author or a lead only. */
  async remove(ctx: ProjectContext, me: AuthUser, commentId: number): Promise<void> {
    const db = this.prisma.db;
    const c = await db.comment.findFirst({ where: { id: commentId, projectId: ctx.id } });
    if (!c) throw notFound('Comment', 'COMMENT_NOT_FOUND');
    if (c.authorId !== me.id && !roleAtLeast(ctx.role, 'lead')) {
      throw forbidden('Only the author or a project lead can delete this comment');
    }
    const keys = await db.$transaction(async (tx) => {
      const removed = await purgeAttachments(tx, 'comment', [c.id]);
      await tx.comment.delete({ where: { id: c.id } });
      await this.activity.log(tx, {
        projectId: ctx.id,
        userId: me.id,
        entityType: c.entityType,
        entityId: c.entityId,
        action: 'comment_deleted',
        summary: 'Deleted a comment',
      });
      return removed;
    });
    await this.storage.removeMany(keys);
  }
}

import { Injectable } from '@nestjs/common';
import type { Prisma } from '@tmt/database';
import type { NotificationDTO, NotificationListDTO, ListNotificationsQuery } from '@tmt/shared';
import { notFound } from '../../common/errors/app.exception.js';
import type { AuthUser, ProjectContext } from '../../common/types/auth.js';
import { AppConfig } from '../../config/app-config.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { addDays, localDate } from '../reports/report-dates.js';
import { notifyUsers } from './notify.js';

/** Runs due within this many days (today included) give a "due soon" notification. */
export const DUE_SOON_DAYS = 2;

const dateKey = (d: Date) => d.toISOString().slice(0, 10);

/** Notifications visible in a project (its own and lab-wide), or lab-wide only outside projects. */
function scopeOf(ctx: ProjectContext | null): Prisma.NotificationWhereInput {
  return ctx ? { OR: [{ projectId: ctx.id }, { projectId: null }] } : { projectId: null };
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  async list(
    ctx: ProjectContext,
    me: AuthUser,
    q: ListNotificationsQuery,
  ): Promise<NotificationListDTO> {
    const db = this.prisma.db;
    await this.refreshDue(ctx, me);
    return this.listWhere({ userId: me.id, OR: [{ projectId: ctx.id }, { projectId: null }] }, q);
  }

  /** Lab-wide notifications only (test stand requests): the bell outside projects. */
  listLab(me: AuthUser, q: ListNotificationsQuery): Promise<NotificationListDTO> {
    return this.listWhere({ userId: me.id, projectId: null }, q);
  }

  private async listWhere(
    where: Prisma.NotificationWhereInput,
    q: ListNotificationsQuery,
  ): Promise<NotificationListDTO> {
    const db = this.prisma.db;
    const [rows, unread] = await Promise.all([
      db.notification.findMany({
        where: { ...where, ...(q.unread && { readAt: null }) },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: q.limit,
      }),
      db.notification.count({ where: { ...where, readAt: null } }),
    ]);
    const items: NotificationDTO[] = rows.map((n) => ({
      id: n.id,
      kind: n.kind,
      title: n.title,
      body: n.body,
      link: n.link,
      read: n.readAt !== null,
      createdAt: n.createdAt.toISOString(),
    }));
    return { items, unread };
  }

  /** In a project: its notifications and the lab-wide ones; outside (`ctx` null): lab-wide only. */
  async markRead(ctx: ProjectContext | null, me: AuthUser, id: number): Promise<void> {
    const where = { id, userId: me.id, ...scopeOf(ctx) };
    const { count } = await this.prisma.db.notification.updateMany({
      where: { ...where, readAt: null },
      data: { readAt: new Date() },
    });
    if (count === 0) {
      const exists = await this.prisma.db.notification.count({ where });
      if (exists === 0) throw notFound('Notification', 'NOTIFICATION_NOT_FOUND');
    }
  }

  async markAllRead(ctx: ProjectContext | null, me: AuthUser): Promise<void> {
    await this.prisma.db.notification.updateMany({
      where: { userId: me.id, readAt: null, ...scopeOf(ctx) },
      data: { readAt: new Date() },
    });
  }

  /**
   * Due dates have no event, so they are noticed when the user looks: runs of the user that still
   * have untested cases and are due within two days or overdue (once per run and due date).
   */
  private async refreshDue(ctx: ProjectContext, me: AuthUser): Promise<void> {
    const db = this.prisma.db;
    const today = localDate(new Date(), this.config.reportTimezone);
    const soon = addDays(today, DUE_SOON_DAYS);
    const runs = await db.testRun.findMany({
      where: {
        testerId: me.id,
        dueDate: { not: null, lte: new Date(`${soon}T00:00:00.000Z`) },
        plan: { projectId: ctx.id, status: { not: 'completed' } },
        runCases: { some: { status: 'untested' } },
      },
      select: {
        id: true,
        code: true,
        dueDate: true,
        suite: { select: { name: true } },
        plan: { select: { docNo: true } },
      },
      take: 200,
    });
    await notifyUsers(
      db,
      runs.map((r) => {
        const due = dateKey(r.dueDate!);
        const overdue = due < today;
        return {
          userId: me.id,
          projectId: ctx.id,
          kind: overdue ? ('overdue' as const) : ('due_soon' as const),
          title: `${r.code} · ${r.suite.name} ${overdue ? 'is overdue' : 'is due soon'}`,
          body: `${r.plan.docNo}, due ${due}`,
          link: `/projects/${ctx.id}/runs/${r.id}`,
          dedupeKey: `${overdue ? 'overdue' : 'due'}:run:${r.id}:${due}`,
        };
      }),
    );
  }
}

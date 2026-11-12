import { Injectable } from '@nestjs/common';
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
    const where = { userId: me.id, projectId: ctx.id };
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

  async markRead(ctx: ProjectContext, me: AuthUser, id: number): Promise<void> {
    const { count } = await this.prisma.db.notification.updateMany({
      where: { id, userId: me.id, projectId: ctx.id, readAt: null },
      data: { readAt: new Date() },
    });
    if (count === 0) {
      const exists = await this.prisma.db.notification.count({
        where: { id, userId: me.id, projectId: ctx.id },
      });
      if (exists === 0) throw notFound('Notification', 'NOTIFICATION_NOT_FOUND');
    }
  }

  async markAllRead(ctx: ProjectContext, me: AuthUser): Promise<void> {
    await this.prisma.db.notification.updateMany({
      where: { userId: me.id, projectId: ctx.id, readAt: null },
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

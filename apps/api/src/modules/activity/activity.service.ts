import { Injectable } from '@nestjs/common';
import type { Prisma } from '@tmt/database';
import type { Db } from '../../prisma/prisma.service.js';

export interface ActivityEntry {
  projectId: number | null;
  userId: number | null;
  entityType: string;
  entityId: number | null;
  action: string;
  summary: string;
  data?: Record<string, unknown> | null;
}

const MAX_SUMMARY = 1000;

/** Audit trail: call `log(tx, …)` inside the same transaction as the change it describes. */
@Injectable()
export class ActivityService {
  async log(db: Db, entry: ActivityEntry): Promise<void> {
    await db.activityLog.create({
      data: {
        projectId: entry.projectId,
        userId: entry.userId,
        entityType: entry.entityType,
        entityId: entry.entityId,
        action: entry.action,
        summary: entry.summary.slice(0, MAX_SUMMARY),
        data: (entry.data ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }
}

import type { NotificationKind } from '@tmt/shared';
import type { Db } from '../../prisma/prisma.service.js';

export interface NotificationInput {
  userId: number | null | undefined;
  /** Null for lab-wide notifications (test stands). */
  projectId: number | null;
  kind: NotificationKind;
  title: string;
  body?: string | null;
  /** Path inside the web app. */
  link: string;
  /** Same key = same event: the user gets it once. */
  dedupeKey?: string;
}

/**
 * Creates notifications. Never throws: a notification that cannot be written must not undo or
 * fail the change that caused it. People who caused the change themselves (`actorId`) are skipped.
 */
export async function notifyUsers(
  db: Db,
  items: readonly NotificationInput[],
  actorId?: number,
): Promise<void> {
  const data = items
    .filter(
      (i): i is NotificationInput & { userId: number } => i.userId != null && i.userId !== actorId,
    )
    .map((i) => ({
      userId: i.userId,
      projectId: i.projectId,
      kind: i.kind,
      title: i.title.slice(0, 300),
      body: i.body ?? null,
      link: i.link,
      dedupeKey: i.dedupeKey ?? null,
    }));
  if (data.length === 0) return;
  try {
    await db.notification.createMany({ data, skipDuplicates: true });
  } catch {
    // best effort
  }
}

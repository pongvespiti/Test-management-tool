import { renderMessage, type NotificationKind, type NotificationMessage } from '@tmt/shared';
import type { Prisma } from '@tmt/database';
import type { Db } from '../../prisma/prisma.service.js';

export interface NotificationInput {
  userId: number | null | undefined;
  /** Null for lab-wide notifications (test stands). */
  projectId: number | null;
  kind: NotificationKind;
  /**
   * Title and body as message keys: stored, so the web shows them in each reader's language;
   * the English text becomes `title` and `body`.
   */
  message: NotificationMessage;
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
      title: renderMessage(i.message.title).slice(0, 300),
      body: i.message.body ? renderMessage(i.message.body) : null,
      message: i.message as unknown as Prisma.InputJsonValue,
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

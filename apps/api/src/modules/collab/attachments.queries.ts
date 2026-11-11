import type { Attachment, AttachmentEntityType, CommentEntityType } from '@tmt/database';
import type { Db } from '../../prisma/prisma.service.js';

/** Attachment rows of the given entities (oldest first). */
export async function attachmentsOf(
  db: Db,
  projectId: number,
  entityType: AttachmentEntityType,
  entityIds: number[],
): Promise<Attachment[]> {
  if (entityIds.length === 0) return [];
  return db.attachment.findMany({
    where: { projectId, entityType, entityId: { in: entityIds } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
}

/** Loads attachments by id (any entity), keyed by id. */
export async function loadAttachments(db: Db, ids: string[]): Promise<Map<string, Attachment>> {
  if (ids.length === 0) return new Map();
  const rows = await db.attachment.findMany({ where: { id: { in: ids } } });
  return new Map(rows.map((r) => [r.id, r]));
}

/**
 * Deletes attachment rows of entities and returns their storage keys. Files are not touched —
 * remove them with `StorageService.removeMany()` after the transaction committed.
 */
export async function purgeAttachments(
  db: Db,
  entityType: AttachmentEntityType,
  entityIds: number[],
): Promise<string[]> {
  if (entityIds.length === 0) return [];
  const where = { entityType, entityId: { in: entityIds } };
  const rows = await db.attachment.findMany({ where, select: { storageKey: true } });
  if (rows.length) await db.attachment.deleteMany({ where });
  return rows.map((r) => r.storageKey);
}

/**
 * Deletes the comments and attachments of the given entities, including attachments of those
 * comments (used when entities themselves are deleted). Returns the storage keys of removed files.
 */
export async function purgeCollab(
  db: Db,
  entityType: CommentEntityType,
  entityIds: number[],
): Promise<string[]> {
  if (entityIds.length === 0) return [];
  const comments = await db.comment.findMany({
    where: { entityType, entityId: { in: entityIds } },
    select: { id: true },
  });
  const keys: string[] = [];
  if (comments.length) {
    const commentIds = comments.map((c) => c.id);
    keys.push(...(await purgeAttachments(db, 'comment', commentIds)));
    await db.comment.deleteMany({ where: { id: { in: commentIds } } });
  }
  keys.push(...(await purgeAttachments(db, entityType, entityIds)));
  return keys;
}

import type { User } from '@tmt/database';
import type { UserDTO, UserRef } from '@tmt/shared';
import type { Db } from '../../prisma/prisma.service.js';
import { unprocessable } from '../errors/app.exception.js';

export function toUserRef(u: Pick<User, 'id' | 'username' | 'displayName'>): UserRef {
  return { id: u.id, username: u.username, displayName: u.displayName };
}

export function toUserDTO(u: User): UserDTO {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    email: u.email,
    isAdmin: u.isAdmin,
    isTechnician: u.isTechnician,
    isActive: u.isActive,
    mustChangePassword: u.mustChangePassword,
    lastLoginAt: iso(u.lastLoginAt),
    createdAt: u.createdAt.toISOString(),
  };
}

/** Batch-loads user refs for the given ids (null/undefined ignored). */
export async function loadUserRefs(
  db: Db,
  ids: Iterable<number | null | undefined>,
): Promise<Map<number, UserRef>> {
  const unique = [...new Set([...ids].filter((v): v is number => typeof v === 'number'))];
  if (unique.length === 0) return new Map();
  const rows = await db.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, username: true, displayName: true },
  });
  return new Map(rows.map((r) => [r.id, toUserRef(r)]));
}

export function refOf(map: Map<number, UserRef>, id: number | null | undefined): UserRef | null {
  return id === null || id === undefined ? null : (map.get(id) ?? null);
}

/** ISO-8601 timestamp or null. */
export function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

/** `YYYY-MM-DD` of a `@db.Date` column (UTC midnight), or null. */
export function dateOnly(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

/** `YYYY-MM-DD` → Date for a `@db.Date` column. */
export function parseDateOnly(v: string | null | undefined): Date | null | undefined {
  if (v === undefined) return undefined;
  return v === null ? null : new Date(`${v}T00:00:00.000Z`);
}

/** Validates a user reference from a request body (tester, assignee): must exist and be active. */
export async function assertActiveUser(db: Db, id: number | null | undefined): Promise<void> {
  if (id === null || id === undefined) return;
  const found = await db.user.count({ where: { id, isActive: true } });
  if (!found)
    throw unprocessable('UNKNOWN_USER', 'The selected user does not exist or is inactive');
}

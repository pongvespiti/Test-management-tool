import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AppConfig } from '../../config/app-config.js';
import type { AuthUser } from '../../common/types/auth.js';
import { PrismaService, type Db } from '../../prisma/prisma.service.js';

/** How often `last_seen_at` is refreshed at most (avoids a write per request). */
const TOUCH_INTERVAL_MS = 60_000;

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Server-side sessions (ADR-004): the cookie holds a random token, the DB only its SHA-256. */
@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  async create(
    userId: number,
    meta: { ip?: string; userAgent?: string },
  ): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.config.sessionMaxDays * 24 * 3600 * 1000);
    await this.prisma.db.session.create({
      data: {
        id: sha256Hex(token),
        userId,
        expiresAt,
        ip: meta.ip?.slice(0, 100) ?? null,
        userAgent: meta.userAgent?.slice(0, 300) ?? null,
      },
    });
    return { token, expiresAt };
  }

  /** Resolves a session token to its user, deleting expired/idle sessions. */
  async resolve(token: string): Promise<{ sessionId: string; user: AuthUser } | null> {
    const id = sha256Hex(token);
    const row = await this.prisma.db.session.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!row) return null;
    const now = Date.now();
    const idleLimit = row.lastSeenAt.getTime() + this.config.sessionIdleHours * 3600 * 1000;
    if (!row.user.isActive || row.expiresAt.getTime() <= now || idleLimit <= now) {
      await this.prisma.db.session.deleteMany({ where: { id } });
      return null;
    }
    if (now - row.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
      await this.prisma.db.session.update({ where: { id }, data: { lastSeenAt: new Date(now) } });
    }
    const u = row.user;
    return {
      sessionId: id,
      user: {
        id: u.id,
        username: u.username,
        displayName: u.displayName,
        isAdmin: u.isAdmin,
        mustChangePassword: u.mustChangePassword,
      },
    };
  }

  async destroyByToken(token: string): Promise<void> {
    await this.prisma.db.session.deleteMany({ where: { id: sha256Hex(token) } });
  }

  /** Revokes all sessions of a user, optionally keeping one (the caller's). */
  async revokeForUser(db: Db, userId: number, keepSessionId?: string): Promise<void> {
    await db.session.deleteMany({
      where: { userId, ...(keepSessionId && { id: { not: keepSessionId } }) },
    });
  }

  /** Housekeeping: removes expired and idle sessions. Returns the number removed. */
  async cleanup(): Promise<number> {
    const idleCutoff = new Date(Date.now() - this.config.sessionIdleHours * 3600 * 1000);
    const res = await this.prisma.db.session.deleteMany({
      where: { OR: [{ expiresAt: { lt: new Date() } }, { lastSeenAt: { lt: idleCutoff } }] },
    });
    return res.count;
  }
}

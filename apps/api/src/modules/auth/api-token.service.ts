import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { ApiToken } from '@tmt/database';
import { API_TOKEN_PREFIX, type ApiTokenDTO, type CreatedTokenDTO } from '@tmt/shared';
import { notFound, unprocessable } from '../../common/errors/app.exception.js';
import type { AuthUser } from '../../common/types/auth.js';
import { iso } from '../../common/users/user-refs.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { sha256Hex } from './session.service.js';

/** Active tokens a user may hold at the same time. */
export const MAX_ACTIVE_TOKENS = 20;
/** Characters of the token kept for display (`tmt_3fA9`). */
const DISPLAY_PREFIX_LENGTH = API_TOKEN_PREFIX.length + 4;
/** `last_used_at` is refreshed at most this often. */
const LAST_USED_INTERVAL_MS = 5 * 60_000;
const DAY_MS = 24 * 3600 * 1000;

function toDTO(t: ApiToken): ApiTokenDTO {
  return {
    id: t.id,
    name: t.name,
    prefix: t.prefix,
    createdAt: t.createdAt.toISOString(),
    lastUsedAt: iso(t.lastUsedAt),
    expiresAt: iso(t.expiresAt),
  };
}

/** Personal API tokens (ADR-007): only SHA-256 and a short prefix are stored. */
@Injectable()
export class ApiTokenService {
  constructor(private readonly prisma: PrismaService) {}

  /** The token's user when the token is valid, unexpired, not revoked and the user is active. */
  async resolve(token: string): Promise<AuthUser | null> {
    if (!token.startsWith(API_TOKEN_PREFIX)) return null;
    const row = await this.prisma.db.apiToken.findUnique({
      where: { tokenHash: sha256Hex(token) },
      include: { user: true },
    });
    const now = Date.now();
    if (
      !row ||
      row.revokedAt ||
      (row.expiresAt && row.expiresAt.getTime() <= now) ||
      !row.user.isActive
    ) {
      return null;
    }
    if (!row.lastUsedAt || now - row.lastUsedAt.getTime() > LAST_USED_INTERVAL_MS) {
      await this.prisma.db.apiToken.update({
        where: { id: row.id },
        data: { lastUsedAt: new Date(now) },
      });
    }
    const u = row.user;
    return {
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      isAdmin: u.isAdmin,
      isTechnician: u.isTechnician,
      mustChangePassword: u.mustChangePassword,
    };
  }

  async list(userId: number): Promise<ApiTokenDTO[]> {
    const rows = await this.prisma.db.apiToken.findMany({
      where: { userId, revokedAt: null },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map(toDTO);
  }

  async create(
    userId: number,
    input: { name: string; expiresInDays?: number | null },
  ): Promise<CreatedTokenDTO> {
    const active = await this.prisma.db.apiToken.count({
      where: {
        userId,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });
    if (active >= MAX_ACTIVE_TOKENS) {
      throw unprocessable(
        'TOO_MANY_TOKENS',
        `You already have ${MAX_ACTIVE_TOKENS} active tokens — revoke one first`,
      );
    }
    const token = `${API_TOKEN_PREFIX}${randomBytes(30).toString('base64url')}`;
    const row = await this.prisma.db.apiToken.create({
      data: {
        userId,
        name: input.name,
        tokenHash: sha256Hex(token),
        prefix: token.slice(0, DISPLAY_PREFIX_LENGTH),
        expiresAt: input.expiresInDays ? new Date(Date.now() + input.expiresInDays * DAY_MS) : null,
      },
    });
    return { ...toDTO(row), token };
  }

  async revoke(userId: number, tokenId: number): Promise<void> {
    const res = await this.prisma.db.apiToken.updateMany({
      where: { id: tokenId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (res.count === 0) throw notFound('Token', 'TOKEN_NOT_FOUND');
  }

  async revokeAllOfUser(userId: number): Promise<number> {
    const res = await this.prisma.db.apiToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return res.count;
  }
}

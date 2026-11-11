import { Injectable } from '@nestjs/common';
import type {
  CreateUserInput,
  ResetPasswordInput,
  UpdateUserInput,
  UserDTO,
  UserRef,
} from '@tmt/shared';
import { conflict, notFound, unprocessable } from '../../common/errors/app.exception.js';
import { isUniqueViolation } from '../../common/errors/prisma-errors.js';
import type { AuthUser } from '../../common/types/auth.js';
import { toUserDTO, toUserRef } from '../../common/users/user-refs.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ActivityService } from '../activity/activity.service.js';
import { ApiTokenService } from '../auth/api-token.service.js';
import { hashPassword } from '../auth/password.js';
import { SessionService } from '../auth/session.service.js';

/** Users of the lookup list at most (pickers search as you type). */
const LOOKUP_LIMIT = 50;

/** User administration (system administrators) and the user lookup for pickers. */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly sessions: SessionService,
    private readonly tokens: ApiTokenService,
  ) {}

  async list(): Promise<UserDTO[]> {
    const rows = await this.prisma.db.user.findMany({ orderBy: { username: 'asc' } });
    return rows.map(toUserDTO);
  }

  async lookup(q: string | undefined): Promise<UserRef[]> {
    const rows = await this.prisma.db.user.findMany({
      where: {
        isActive: true,
        ...(q && {
          OR: [
            { username: { contains: q, mode: 'insensitive' } },
            { displayName: { contains: q, mode: 'insensitive' } },
          ],
        }),
      },
      orderBy: { displayName: 'asc' },
      take: LOOKUP_LIMIT,
      select: { id: true, username: true, displayName: true },
    });
    return rows.map(toUserRef);
  }

  async create(me: AuthUser, input: CreateUserInput): Promise<UserDTO> {
    const username = input.username.toLowerCase();
    const passwordHash = await hashPassword(input.password);
    try {
      return await this.prisma.db.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            username,
            displayName: input.displayName,
            email: input.email ?? null,
            isAdmin: input.isAdmin,
            passwordHash,
            mustChangePassword: true,
          },
        });
        await this.activity.log(tx, {
          projectId: null,
          userId: me.id,
          entityType: 'user',
          entityId: user.id,
          action: 'created',
          summary: `Created user ${user.username}`,
        });
        return toUserDTO(user);
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw conflict('USERNAME_TAKEN', `Username ${username} is already used`);
      }
      throw e;
    }
  }

  async update(me: AuthUser, userId: number, input: UpdateUserInput): Promise<UserDTO> {
    if (userId === me.id && (input.isAdmin === false || input.isActive === false)) {
      throw unprocessable(
        'CANNOT_MODIFY_SELF',
        'You cannot remove your own admin rights or disable yourself',
      );
    }
    return this.prisma.db.$transaction(async (tx) => {
      const exists = await tx.user.count({ where: { id: userId } });
      if (!exists) throw notFound('User', 'USER_NOT_FOUND');
      const user = await tx.user.update({
        where: { id: userId },
        data: {
          ...(input.displayName !== undefined && { displayName: input.displayName }),
          ...(input.email !== undefined && { email: input.email }),
          ...(input.isAdmin !== undefined && { isAdmin: input.isAdmin }),
          ...(input.isActive !== undefined && { isActive: input.isActive }),
        },
      });
      if (input.isActive === false) await this.sessions.revokeForUser(tx, userId);
      await this.activity.log(tx, {
        projectId: null,
        userId: me.id,
        entityType: 'user',
        entityId: userId,
        action: 'updated',
        summary: `Updated user ${user.username}`,
        data: input,
      });
      return toUserDTO(user);
    });
  }

  async resetPassword(me: AuthUser, userId: number, input: ResetPasswordInput): Promise<void> {
    const passwordHash = await hashPassword(input.newPassword);
    await this.prisma.db.$transaction(async (tx) => {
      const exists = await tx.user.count({ where: { id: userId } });
      if (!exists) throw notFound('User', 'USER_NOT_FOUND');
      const user = await tx.user.update({
        where: { id: userId },
        data: { passwordHash, mustChangePassword: true, failedLogins: 0, lockedUntil: null },
      });
      await this.sessions.revokeForUser(tx, userId);
      await this.activity.log(tx, {
        projectId: null,
        userId: me.id,
        entityType: 'user',
        entityId: userId,
        action: 'password_reset',
        summary: `Reset password of ${user.username}`,
      });
    });
  }

  async revokeTokens(me: AuthUser, userId: number): Promise<void> {
    const user = await this.prisma.db.user.findUnique({ where: { id: userId } });
    if (!user) throw notFound('User', 'USER_NOT_FOUND');
    const count = await this.tokens.revokeAllOfUser(userId);
    await this.activity.log(this.prisma.db, {
      projectId: null,
      userId: me.id,
      entityType: 'user',
      entityId: userId,
      action: 'tokens_revoked',
      summary: `Revoked ${count} API token(s) of ${user.username}`,
    });
  }
}

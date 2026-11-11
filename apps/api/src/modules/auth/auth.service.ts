import { Injectable } from '@nestjs/common';
import type { ChangePasswordInput, LoginInput, MeDTO } from '@tmt/shared';
import { AppConfig } from '../../config/app-config.js';
import { AppException, unauthorized, unprocessable } from '../../common/errors/app.exception.js';
import type { AuthUser } from '../../common/types/auth.js';
import { toUserDTO } from '../../common/users/user-refs.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ActivityService } from '../activity/activity.service.js';
import { DUMMY_HASH, hashPassword, verifyPassword } from './password.js';
import { SessionService } from './session.service.js';

export interface LoginResult {
  me: MeDTO;
  session: { token: string; expiresAt: Date };
}

/** Sign-in, sign-out, profile and password change (ADR-004). */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly sessions: SessionService,
    private readonly activity: ActivityService,
  ) {}

  async login(input: LoginInput, meta: { ip?: string; userAgent?: string }): Promise<LoginResult> {
    const db = this.prisma.db;
    const user = await db.user.findUnique({ where: { username: input.username.toLowerCase() } });
    if (!user) {
      await verifyPassword(input.password, DUMMY_HASH); // similar timing for unknown users
      throw this.invalidCredentials();
    }
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) throw this.locked();

    if (!(await verifyPassword(input.password, user.passwordHash))) {
      const failed = user.failedLogins + 1;
      const lock = failed >= this.config.loginMaxFailed;
      await db.user.update({
        where: { id: user.id },
        data: {
          failedLogins: lock ? 0 : failed,
          lockedUntil: lock
            ? new Date(Date.now() + this.config.loginLockMinutes * 60_000)
            : user.lockedUntil,
        },
      });
      if (lock) {
        await this.activity.log(db, {
          projectId: null,
          userId: user.id,
          entityType: 'user',
          entityId: user.id,
          action: 'locked',
          summary: `Account ${user.username} locked after ${this.config.loginMaxFailed} failed sign-ins`,
        });
        throw this.locked();
      }
      throw this.invalidCredentials();
    }
    if (!user.isActive) throw new AppException(403, 'ACCOUNT_DISABLED', 'This account is disabled');

    await db.user.update({
      where: { id: user.id },
      data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    const session = await this.sessions.create(user.id, meta);
    return { me: await this.me(user.id), session };
  }

  async logout(token: string | undefined): Promise<void> {
    if (token) await this.sessions.destroyByToken(token);
  }

  async me(userId: number): Promise<MeDTO> {
    const user = await this.prisma.db.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          include: { project: { select: { id: true, key: true, name: true } } },
          orderBy: { project: { name: 'asc' } },
        },
      },
    });
    if (!user) throw unauthorized();
    return {
      user: toUserDTO(user),
      memberships: user.memberships.map((m) => ({
        projectId: m.project.id,
        projectKey: m.project.key,
        projectName: m.project.name,
        role: m.role,
      })),
    };
  }

  async changePassword(
    me: AuthUser,
    input: ChangePasswordInput,
    keepSessionId: string | undefined,
  ): Promise<void> {
    const user = await this.prisma.db.user.findUnique({ where: { id: me.id } });
    if (!user) throw unauthorized();
    if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
      throw unprocessable('WRONG_PASSWORD', 'The current password is not correct');
    }
    if (input.currentPassword === input.newPassword) {
      throw unprocessable('SAME_PASSWORD', 'Choose a password different from the current one');
    }
    const passwordHash = await hashPassword(input.newPassword);
    await this.prisma.db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: me.id },
        data: { passwordHash, mustChangePassword: false },
      });
      await this.sessions.revokeForUser(tx, me.id, keepSessionId);
      await this.activity.log(tx, {
        projectId: null,
        userId: me.id,
        entityType: 'user',
        entityId: me.id,
        action: 'password_changed',
        summary: `${me.username} changed the password`,
      });
    });
  }

  private invalidCredentials() {
    return new AppException(401, 'INVALID_CREDENTIALS', 'Wrong username or password');
  }

  private locked() {
    return new AppException(
      423,
      'ACCOUNT_LOCKED',
      `Too many failed attempts — try again in ${this.config.loginLockMinutes} minutes`,
    );
  }
}

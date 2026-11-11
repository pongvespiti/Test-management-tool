import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { AppConfig } from '../../config/app-config.js';
import { isUniqueViolation } from '../../common/errors/prisma-errors.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { hashPassword, randomPassword } from './password.js';

/**
 * First start on an empty database: creates the administrator (INITIAL_ADMIN_USERNAME) who must
 * change the password at first sign-in. Uses INITIAL_ADMIN_PASSWORD, else logs a one-time password.
 */
@Injectable()
export class InitialAdminService implements OnApplicationBootstrap {
  private readonly logger = new Logger('Bootstrap');

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this.config.nodeEnv === 'test') return;
    await this.ensureInitialAdmin();
  }

  /** Returns the generated password (null when nothing was created or the env password was used). */
  async ensureInitialAdmin(): Promise<string | null> {
    if ((await this.prisma.db.user.count()) > 0) return null;
    const generated = this.config.initialAdminPassword ? null : randomPassword();
    const password = this.config.initialAdminPassword ?? generated!;
    try {
      await this.prisma.db.user.create({
        data: {
          username: this.config.initialAdminUsername,
          displayName: 'Administrator',
          passwordHash: await hashPassword(password),
          isAdmin: true,
          mustChangePassword: true,
        },
      });
    } catch (e) {
      if (isUniqueViolation(e)) return null; // another instance created it first
      throw e;
    }
    this.logger.warn(
      generated
        ? `Created administrator "${this.config.initialAdminUsername}" with one-time password: ${generated} — sign in and change it now.`
        : `Created administrator "${this.config.initialAdminUsername}" with INITIAL_ADMIN_PASSWORD — change it at first sign-in.`,
    );
    return generated;
  }
}

import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AppConfig } from '../../config/app-config.js';
import { ApiTokenService } from '../../modules/auth/api-token.service.js';
import { SessionService } from '../../modules/auth/session.service.js';
import {
  ALLOW_PENDING_PASSWORD,
  IS_PUBLIC,
  SESSION_ONLY,
  TECHNICIAN_ALLOWED,
} from '../decorators/metadata-keys.js';
import { AppException, forbidden, unauthorized } from '../errors/app.exception.js';
import { bearerToken } from '../security/bearer-token.js';

/**
 * Global guard (ADR-004, ADR-007): a session cookie or an `Authorization: Bearer` API token.
 * A Bearer header wins over the cookie. Routes opt out with `@Public()`.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: AppConfig,
    private readonly sessions: SessionService,
    private readonly tokens: ApiTokenService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;
    const req = ctx.switchToHttp().getRequest<Request>();

    const bearer = bearerToken(req);
    if (bearer !== null) {
      if (this.reflector.getAllAndOverride<boolean>(SESSION_ONLY, targets)) {
        throw forbidden(
          'API tokens cannot be used for this action — sign in instead',
          'TOKEN_NOT_ALLOWED',
        );
      }
      const user = await this.tokens.resolve(bearer);
      if (!user)
        throw unauthorized('The API token is invalid, expired or revoked', 'INVALID_TOKEN');
      req.authUser = user;
      req.authMethod = 'token';
    } else {
      const cookie = req.cookies?.[this.config.sessionCookieName] as string | undefined;
      if (!cookie) throw unauthorized();
      const resolved = await this.sessions.resolve(cookie);
      if (!resolved) throw unauthorized('Your session has expired — please sign in again');
      req.authUser = resolved.user;
      req.sessionId = resolved.sessionId;
      req.authMethod = 'session';
    }

    const allowPending = this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_PASSWORD, targets);
    if (req.authUser.mustChangePassword && !allowPending) {
      throw new AppException(403, 'PASSWORD_CHANGE_REQUIRED', 'Please change your password first');
    }
    if (
      req.authUser.isTechnician &&
      !this.reflector.getAllAndOverride<boolean>(TECHNICIAN_ALLOWED, targets)
    ) {
      throw forbidden('Technician accounts can use the test stands only', 'TECHNICIAN_NOT_ALLOWED');
    }
    return true;
  }
}

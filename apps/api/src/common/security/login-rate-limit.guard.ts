import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppConfig } from '../../config/app-config.js';
import { AppException } from '../errors/app.exception.js';
import { FixedWindowRateLimiter } from './rate-limiter.js';

const WINDOW_MS = 60_000;
/** The ceiling of one client address over all usernames, as a multiple of the per-name limit. */
export const CLIENT_LIMIT_FACTOR = 10;

/**
 * Limits sign-in attempts: LOGIN_RATE_LIMIT_PER_MIN per minute for one username from one client,
 * and ten times that for one client over all usernames (429 RATE_LIMITED).
 *
 * Behind the web app's `/api` proxy every browser reaches the API from the same address, so a
 * per-address limit alone would be one limit for the whole team (a busy morning of sign-ins would
 * be refused). Wrong passwords are stopped per account by the lockout (LOGIN_MAX_FAILED); the
 * client ceiling still slows down guessing across many accounts.
 */
@Injectable()
export class LoginRateLimitGuard implements CanActivate {
  private readonly perName: FixedWindowRateLimiter;
  private readonly perClient: FixedWindowRateLimiter;

  constructor(config: AppConfig) {
    this.perName = new FixedWindowRateLimiter(config.loginRateLimitPerMin, WINDOW_MS);
    this.perClient = new FixedWindowRateLimiter(
      config.loginRateLimitPerMin * CLIENT_LIMIT_FACTOR,
      WINDOW_MS,
    );
  }

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const client = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
    const clientHit = this.perClient.hit(client);
    const nameHit = this.perName.hit(`${client}\u0000${usernameOf(req)}`);
    const refused = !clientHit.allowed ? clientHit : !nameHit.allowed ? nameHit : null;
    if (!refused) return true;
    http.getResponse<Response>().setHeader('Retry-After', String(refused.retryAfterSec));
    throw new AppException(
      429,
      'RATE_LIMITED',
      'Too many sign-in attempts. Wait a minute and try again.',
    );
  }
}

/** The username of a sign-in body, as the account lookup compares it (case-insensitive). */
function usernameOf(req: Request): string {
  const body = req.body as { username?: unknown } | undefined;
  return typeof body?.username === 'string' ? body.username.trim().toLowerCase().slice(0, 200) : '';
}

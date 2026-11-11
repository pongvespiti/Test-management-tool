import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppConfig } from '../../config/app-config.js';
import { AppException } from '../errors/app.exception.js';
import { FixedWindowRateLimiter } from './rate-limiter.js';

const WINDOW_MS = 60_000;

/** Limits sign-in attempts per client IP to LOGIN_RATE_LIMIT_PER_MIN per minute (429 RATE_LIMITED). */
@Injectable()
export class LoginRateLimitGuard implements CanActivate {
  private readonly limiter: FixedWindowRateLimiter;

  constructor(config: AppConfig) {
    this.limiter = new FixedWindowRateLimiter(config.loginRateLimitPerMin, WINDOW_MS);
  }

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const result = this.limiter.hit(req.ip ?? req.socket?.remoteAddress ?? 'unknown');
    if (result.allowed) return true;
    http.getResponse<Response>().setHeader('Retry-After', String(result.retryAfterSec));
    throw new AppException(
      429,
      'RATE_LIMITED',
      'Too many sign-in attempts. Wait a minute and try again.',
    );
  }
}

import { Injectable, type NestMiddleware } from '@nestjs/common';
import { CSRF_HEADER, CSRF_HEADER_VALUE } from '@tmt/shared';
import type { NextFunction, Request, Response } from 'express';
import { AppConfig } from '../../config/app-config.js';
import { forbidden } from '../errors/app.exception.js';
import { bearerToken } from './bearer-token.js';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * CSRF defence for cookie authentication (ADR-004): unsafe requests need the custom header and,
 * when the browser sends an Origin, an allowed origin (WEB_ORIGINS or the API's own host).
 * Requests with `Authorization: Bearer` carry no ambient credential and are not checked.
 */
@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  private readonly allowed: Set<string>;

  constructor(private readonly config: AppConfig) {
    this.allowed = new Set(config.webOrigins.map((o) => o.replace(/\/+$/, '').toLowerCase()));
  }

  use(req: Request, _res: Response, next: NextFunction): void {
    if (!UNSAFE_METHODS.has(req.method) || bearerToken(req) !== null) {
      return next();
    }
    if (req.headers[CSRF_HEADER] !== CSRF_HEADER_VALUE) {
      throw forbidden(`Missing ${CSRF_HEADER} header`, 'CSRF_REJECTED');
    }
    const origin = req.headers.origin;
    if (origin && origin !== 'null' && !this.isAllowedOrigin(origin, req)) {
      throw forbidden('Cross-site request rejected', 'CSRF_REJECTED');
    }
    next();
  }

  private isAllowedOrigin(origin: string, req: Request): boolean {
    if (this.allowed.has(origin.toLowerCase())) return true;
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      return false;
    }
    const forwarded = this.config.trustProxy ? req.headers['x-forwarded-host'] : undefined;
    const host = (typeof forwarded === 'string' && forwarded) || req.headers.host;
    return !!host && originHost === host;
  }
}

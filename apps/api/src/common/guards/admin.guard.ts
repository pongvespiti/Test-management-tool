import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { forbidden, unauthorized } from '../errors/app.exception.js';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (!req.authUser) throw unauthorized();
    if (!req.authUser.isAdmin) throw forbidden('Administrator access required');
    return true;
  }
}

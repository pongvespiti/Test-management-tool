import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { unauthorized } from '../errors/app.exception.js';
import type { AuthUser, ProjectContext } from '../types/auth.js';

/** The signed-in user (always present behind the global AuthGuard). */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<Request>();
  if (!req.authUser) throw unauthorized();
  return req.authUser;
});

/** The project resolved by `@ProjectPermission(…)`. */
export const CurrentProject = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): ProjectContext => {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (!req.project) throw new Error('CurrentProject used without @ProjectPermission');
    return req.project;
  },
);

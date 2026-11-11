import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { can, requiredRole, type PermissionKey, type ProjectRole } from '@tmt/shared';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PROJECT_PERMISSION } from '../decorators/metadata-keys.js';
import { forbidden, notFound, unauthorized } from '../errors/app.exception.js';
import { routeIdSchema } from '../http/params.js';
import type { ProjectContext } from '../types/auth.js';

/** Resolves `:projectId` and the caller's role; see `@ProjectPermission`. */
@Injectable()
export class ProjectAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const permission = this.reflector.getAllAndOverride<PermissionKey | undefined>(
      PROJECT_PERMISSION,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!permission) return true;
    const req = ctx.switchToHttp().getRequest<Request>();
    const user = req.authUser;
    if (!user) throw unauthorized();
    const parsed = routeIdSchema.safeParse(req.params['projectId']);
    if (!parsed.success) throw notFound('Project', 'PROJECT_NOT_FOUND');

    const project = await this.loadContext(parsed.data, user.id, user.isAdmin);
    if (!project) throw notFound('Project', 'PROJECT_NOT_FOUND');
    if (!can(project.role, permission)) {
      throw forbidden(
        `This action needs the ${requiredRole(permission)} role in project ${project.key}`,
      );
    }
    req.project = project;
    return true;
  }

  private async loadContext(
    projectId: number,
    userId: number,
    isAdmin: boolean,
  ): Promise<ProjectContext | null> {
    const project = await this.prisma.db.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        key: true,
        name: true,
        members: { where: { userId }, select: { role: true } },
      },
    });
    if (!project) return null;
    const role: ProjectRole | undefined = isAdmin ? 'lead' : project.members[0]?.role;
    if (!role) return null;
    return { id: project.id, key: project.key, name: project.name, role };
  }
}

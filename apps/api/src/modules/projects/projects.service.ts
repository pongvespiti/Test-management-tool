import { Injectable } from '@nestjs/common';
import type {
  CreateProjectInput,
  MemberDTO,
  ProjectDTO,
  ProjectRole,
  SetMembersInput,
  UpdateProjectInput,
} from '@tmt/shared';
import { AppConfig } from '../../config/app-config.js';
import { conflict, notFound, unprocessable } from '../../common/errors/app.exception.js';
import { isUniqueViolation } from '../../common/errors/prisma-errors.js';
import type { AuthUser, ProjectContext } from '../../common/types/auth.js';
import { toUserRef } from '../../common/users/user-refs.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ActivityService } from '../activity/activity.service.js';
import { ROLE_ORDER, toProjectDTO } from './projects.mapper.js';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly activity: ActivityService,
  ) {}

  /** Admins see every project (as lead); others see their memberships. */
  async listFor(me: AuthUser): Promise<ProjectDTO[]> {
    if (me.isAdmin) {
      const rows = await this.prisma.db.project.findMany({ orderBy: { name: 'asc' } });
      return rows.map((p) => toProjectDTO(p, 'lead'));
    }
    const rows = await this.prisma.db.projectMember.findMany({
      where: { userId: me.id },
      include: { project: true },
      orderBy: { project: { name: 'asc' } },
    });
    return rows.map((m) => toProjectDTO(m.project, m.role));
  }

  async create(me: AuthUser, input: CreateProjectInput): Promise<ProjectDTO> {
    try {
      const project = await this.prisma.db.$transaction(async (tx) => {
        const p = await tx.project.create({
          data: {
            key: input.key,
            name: input.name,
            description: input.description ?? null,
            docNoPattern: input.docNoPattern ?? this.config.defaultDocNoPattern,
            createdById: me.id,
            members: { create: { userId: me.id, role: 'lead' } },
          },
        });
        await this.activity.log(tx, {
          projectId: p.id,
          userId: me.id,
          entityType: 'project',
          entityId: p.id,
          action: 'created',
          summary: `Created project ${p.key} ${p.name}`,
        });
        return p;
      });
      return toProjectDTO(project, 'lead');
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw conflict('PROJECT_KEY_TAKEN', `Project key ${input.key} is already used`);
      }
      throw e;
    }
  }

  async get(ctx: ProjectContext): Promise<ProjectDTO> {
    const p = await this.prisma.db.project.findUnique({ where: { id: ctx.id } });
    if (!p) throw notFound('Project', 'PROJECT_NOT_FOUND');
    return toProjectDTO(p, ctx.role);
  }

  async update(ctx: ProjectContext, me: AuthUser, input: UpdateProjectInput): Promise<ProjectDTO> {
    return this.prisma.db.$transaction(async (tx) => {
      const p = await tx.project.update({
        where: { id: ctx.id },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.description !== undefined && { description: input.description }),
          ...(input.docNoPattern !== undefined && {
            docNoPattern: input.docNoPattern ?? this.config.defaultDocNoPattern,
          }),
          ...(input.isArchived !== undefined && { isArchived: input.isArchived }),
          ...(input.requireCaseReview !== undefined && {
            requireCaseReview: input.requireCaseReview,
          }),
        },
      });
      await this.activity.log(tx, {
        projectId: ctx.id,
        userId: me.id,
        entityType: 'project',
        entityId: ctx.id,
        action: 'updated',
        summary: 'Updated project settings',
        data: input,
      });
      return toProjectDTO(p, ctx.role);
    });
  }

  // ------------------------------------------------------------------------- members

  async members(projectId: number): Promise<MemberDTO[]> {
    const rows = await this.prisma.db.projectMember.findMany({
      where: { projectId },
      include: { user: { select: { id: true, username: true, displayName: true } } },
      orderBy: { user: { displayName: 'asc' } },
    });
    return rows
      .map((m) => ({ user: toUserRef(m.user), role: m.role }))
      .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role]);
  }

  /** Replaces the member list; a project always keeps at least one lead. */
  async setMembers(
    ctx: ProjectContext,
    me: AuthUser,
    input: SetMembersInput,
  ): Promise<MemberDTO[]> {
    const byUser = new Map<number, ProjectRole>();
    for (const m of input.members) byUser.set(m.userId, m.role);
    if (![...byUser.values()].includes('lead')) {
      throw unprocessable('LEAD_REQUIRED', 'A project needs at least one lead');
    }
    const ids = [...byUser.keys()];
    const found = await this.prisma.db.user.findMany({
      where: { id: { in: ids } },
      select: { isTechnician: true, displayName: true },
    });
    if (found.length !== ids.length) throw unprocessable('UNKNOWN_USER', 'Some users do not exist');
    const technician = found.find((u) => u.isTechnician);
    if (technician) {
      throw unprocessable(
        'TECHNICIAN_NOT_MEMBER',
        `${technician.displayName} is a technician and works only on test stands`,
      );
    }

    await this.prisma.db.$transaction(async (tx) => {
      await tx.projectMember.deleteMany({ where: { projectId: ctx.id } });
      await tx.projectMember.createMany({
        data: ids.map((userId) => ({ projectId: ctx.id, userId, role: byUser.get(userId)! })),
      });
      await this.activity.log(tx, {
        projectId: ctx.id,
        userId: me.id,
        entityType: 'project',
        entityId: ctx.id,
        action: 'members_updated',
        summary: `Updated members (${ids.length})`,
        data: { members: input.members },
      });
    });
    return this.members(ctx.id);
  }
}

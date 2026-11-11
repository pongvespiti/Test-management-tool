import type { Project, Release } from '@tmt/database';
import type { ProjectDTO, ProjectRole, ReleaseDTO } from '@tmt/shared';
import { dateOnly } from '../../common/users/user-refs.js';

export function toProjectDTO(p: Project, role: ProjectRole): ProjectDTO {
  return {
    id: p.id,
    key: p.key,
    name: p.name,
    description: p.description,
    docNoPattern: p.docNoPattern,
    isArchived: p.isArchived,
    requireCaseReview: p.requireCaseReview,
    myRole: role,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export function toReleaseDTO(r: Release): ReleaseDTO {
  return {
    id: r.id,
    projectId: r.projectId,
    name: r.name,
    description: r.description,
    startDate: dateOnly(r.startDate),
    endDate: dateOnly(r.endDate),
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** Members sort leads first, then testers, then viewers. */
export const ROLE_ORDER: Record<ProjectRole, number> = { lead: 0, tester: 1, viewer: 2 };

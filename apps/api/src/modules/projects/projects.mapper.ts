import type { Build, Project, Release } from '@tmt/database';
import type { BuildDTO, ProjectDTO, ProjectRole, ReleaseDTO } from '@tmt/shared';
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

export type BuildWithCounts = Build & {
  _count: { runs: number; foundDefects: number; fixedDefects: number };
};

export function toBuildDTO(b: BuildWithCounts): BuildDTO {
  return {
    id: b.id,
    releaseId: b.releaseId,
    name: b.name,
    notes: b.notes,
    builtDate: dateOnly(b.builtDate),
    runCount: b._count.runs,
    defectCount: b._count.foundDefects + b._count.fixedDefects,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  };
}

/** Members sort leads first, then testers, managers, viewers. */
export const ROLE_ORDER: Record<ProjectRole, number> = {
  lead: 0,
  tester: 1,
  manager: 2,
  viewer: 3,
};

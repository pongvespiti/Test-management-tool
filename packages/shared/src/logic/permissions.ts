import { ROLE_RANK, type ProjectRole } from '../enums';

/** True when `role` is at least `min` (viewer < tester < lead). */
export function roleAtLeast(role: ProjectRole | null | undefined, min: ProjectRole): boolean {
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

/** Minimum project role per action — the single source used by server guards and UI buttons. */
export const PERMISSIONS = {
  read: 'viewer',
  export: 'viewer',
  comment: 'tester',
  writeLibrary: 'tester',
  import: 'tester',
  deleteLibrary: 'lead',
  manageSuites: 'lead',
  writePlans: 'tester',
  completePlan: 'tester',
  reopenPlan: 'lead',
  deletePlans: 'lead',
  execute: 'tester',
  writeDefects: 'tester',
  deleteDefects: 'lead',
  manageReleases: 'lead',
  manageBuilds: 'tester',
  manageMembers: 'lead',
  manageTemplates: 'lead',
  reviewCases: 'lead',
  writeSharedSteps: 'tester',
  importAutomation: 'tester',
  manageIntegrations: 'lead',
  useIntegrations: 'tester',
  viewReports: 'viewer',
} as const satisfies Record<string, ProjectRole>;

export type PermissionKey = keyof typeof PERMISSIONS;

export function can(role: ProjectRole | null | undefined, action: PermissionKey): boolean {
  return roleAtLeast(role, PERMISSIONS[action]);
}

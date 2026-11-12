import { ROLE_RANK, type ProjectRole } from '../enums';

/**
 * True when `role` is at least `min`. Order: viewer < manager < tester < lead. A manager reads
 * everything but does not work on tests: actions of the testers are not open to managers.
 */
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
  manageDimensions: 'lead',
  reviewCases: 'lead',
  writeRequirements: 'tester',
  writeSharedSteps: 'tester',
  importAutomation: 'tester',
  manageIntegrations: 'lead',
  useIntegrations: 'tester',
  writeDevices: 'tester',
  deleteDevices: 'lead',
  viewReports: 'viewer',
} as const satisfies Record<string, ProjectRole>;

/** Actions open to a fixed set of roles (the team view: managers and leads, not testers). */
export const ROLE_SETS = {
  viewTeam: ['manager', 'lead'],
  assignTopics: ['manager', 'lead'],
} as const satisfies Record<string, readonly ProjectRole[]>;

export type PermissionKey = keyof typeof PERMISSIONS | keyof typeof ROLE_SETS;

function isSetAction(action: PermissionKey): action is keyof typeof ROLE_SETS {
  return action in ROLE_SETS;
}

export function can(role: ProjectRole | null | undefined, action: PermissionKey): boolean {
  if (isSetAction(action))
    return role != null && (ROLE_SETS[action] as readonly string[]).includes(role);
  return roleAtLeast(role, PERMISSIONS[action]);
}

/** The lowest role named in messages and in the API reference (`x-min-role`). */
export function requiredRole(action: PermissionKey): ProjectRole {
  return isSetAction(action) ? ROLE_SETS[action][0] : PERMISSIONS[action];
}

import { RoleBadge } from '@/components/common/badges';
import { StatusPill } from '@/components/common/status-pill';
import { GRAY } from '@/lib/status';

const TITLES: Record<string, string> = {
  public: 'No sign-in needed',
  user: 'Any signed-in user',
  admin: 'System administrators only',
  viewer: 'Minimum project role: viewer',
  manager: 'Project role: manager or lead',
  tester: 'Minimum project role: tester',
  lead: 'Minimum project role: lead (administrators act as lead)',
};

const HINTS: Record<string, string> = {
  public: 'no sign-in needed',
  user: 'any signed-in user, no project role needed',
  admin: 'system administrators only',
  viewer: 'any project member',
  manager: 'managers and leads of the project',
  tester: 'testers and leads of the project',
  lead: 'project leads (and administrators)',
};

/** Who may call an operation (`x-min-role`). */
export function MinRoleLabel({ role }: { role: string | null }) {
  if (!role) return null;
  const title = TITLES[role] ?? `Minimum role: ${role}`;
  let pill;
  if (
    role === 'viewer' ||
    role === 'manager' ||
    role === 'tester' ||
    role === 'lead' ||
    role === 'admin'
  )
    pill = <RoleBadge role={role} />;
  else if (role === 'public') pill = <StatusPill tone={GRAY}>Public</StatusPill>;
  else if (role === 'user') pill = <StatusPill tone={GRAY}>Any user</StatusPill>;
  else pill = <StatusPill tone={GRAY}>{role}</StatusPill>;
  return (
    <span title={title} className="inline-flex">
      {pill}
      <span className="sr-only">{title}</span>
    </span>
  );
}

/** Short plain-language note shown next to the role pill. */
export function minRoleHint(role: string | null): string {
  if (!role) return 'not documented';
  return HINTS[role] ?? `minimum role: ${role}`;
}

import {
  Bug,
  ChartColumn,
  ClipboardCheck,
  ClipboardList,
  Compass,
  FileSpreadsheet,
  Flag,
  Folders,
  Layers,
  ListTree,
  LayoutDashboard,
  ListChecks,
  ListTodo,
  ScrollText,
  PlugZap,
  Settings,
  ShieldUser,
  SlidersHorizontal,
  Upload,
  Users,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { isUnder, routes } from '@/lib/routes';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Exact match (dashboard) instead of prefix match. */
  exact?: boolean;
  /** Other path prefixes that belong to this item (e.g. runs under Test plans). */
  also?: string[];
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

/** Sidebar of a project (same groups and order as the approved mockup). */
export function projectNav(projectId: number, showTeam = false): NavSection[] {
  return [
    {
      title: 'Testing',
      items: [
        {
          label: 'Dashboard',
          href: routes.dashboard(projectId),
          icon: LayoutDashboard,
          exact: true,
        },
        { label: 'My work', href: routes.myWork(projectId), icon: ListTodo },
        ...(showTeam ? [{ label: 'Team', href: routes.team(projectId), icon: UsersRound }] : []),
        {
          label: 'Test plans',
          href: routes.plans(projectId),
          icon: ClipboardList,
          also: [routes.runs(projectId)],
        },
        { label: 'Exploratory', href: routes.sessions(projectId), icon: Compass },
        { label: 'Defects', href: routes.defects(projectId), icon: Bug },
        { label: 'Reports', href: routes.reports(projectId), icon: ChartColumn },
      ],
    },
    {
      title: 'Library',
      items: [
        { label: 'Test cases', href: routes.cases(projectId), icon: ListChecks },
        { label: 'Requirements', href: routes.requirements(projectId), icon: ScrollText },
        { label: 'Reviews', href: routes.reviews(projectId), icon: ClipboardCheck },
        { label: 'Shared steps', href: routes.sharedSteps(projectId), icon: Layers },
        { label: 'Import from Excel', href: routes.import(projectId), icon: Upload },
        {
          label: 'Suites & fields',
          href: routes.settingsSuites(projectId),
          icon: SlidersHorizontal,
        },
      ],
    },
    {
      title: 'Project',
      items: [
        { label: 'Releases', href: routes.releases(projectId), icon: Flag },
        { label: 'Members', href: routes.members(projectId), icon: Users },
        {
          label: 'Environment lists',
          href: routes.settingsEnvLists(projectId),
          icon: ListTree,
        },
        {
          label: 'Report templates',
          href: routes.settingsTemplates(projectId),
          icon: FileSpreadsheet,
        },
        { label: 'Integrations', href: routes.settingsIntegrations(projectId), icon: PlugZap },
        { label: 'Settings', href: routes.settingsGeneral(projectId), icon: Settings },
      ],
    },
  ];
}

export const WORKSPACE_NAV: NavSection = {
  title: 'Workspace',
  items: [{ label: 'Projects', href: routes.projects, icon: Folders, exact: true }],
};

export const ADMIN_NAV: NavSection = {
  title: 'Admin',
  items: [{ label: 'Users', href: routes.adminUsers, icon: ShieldUser }],
};

/** Sections shown for the current context. */
export function navSections(
  projectId: number | null,
  isAdmin: boolean,
  showTeam = false,
): NavSection[] {
  const sections = projectId ? projectNav(projectId, showTeam) : [WORKSPACE_NAV];
  return isAdmin ? [...sections, ADMIN_NAV] : sections;
}

/** Whether a nav item is the current page (or one of its sub pages). */
export function isNavItemActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return isUnder(pathname, item.href) || (item.also ?? []).some((p) => isUnder(pathname, p));
}

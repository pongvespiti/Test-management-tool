'use client';

import { can as canDo, type PermissionKey, type ProjectDTO, type ProjectRole } from '@tmt/shared';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { routes } from '@/lib/routes';

export interface ProjectContextValue {
  project: ProjectDTO;
  projectId: number;
  /** Effective role (admins act as lead). */
  role: ProjectRole;
  can: (action: PermissionKey) => boolean;
  /** Base path for links inside the project, e.g. `/projects/3`. */
  base: string;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function buildProjectContext(project: ProjectDTO): ProjectContextValue {
  return {
    project,
    projectId: project.id,
    role: project.myRole,
    can: (action) => canDo(project.myRole, action),
    base: routes.project(project.id),
  };
}

/**
 * Provides the current project. `project` is null outside project routes (and while it loads) —
 * the provider is always rendered so children never remount when the project arrives.
 */
export function ProjectProvider({
  project,
  children,
}: {
  project: ProjectDTO | null;
  children: ReactNode;
}) {
  const value = useMemo(() => (project ? buildProjectContext(project) : null), [project]);
  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

/** Current project (only inside `/projects/[projectId]/…` pages). */
export function useProject(): ProjectContextValue {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error('useProject() used outside a project route');
  return ctx;
}

/** Current project or null (for the shared app shell). */
export function useOptionalProject(): ProjectContextValue | null {
  return useContext(ProjectContext);
}

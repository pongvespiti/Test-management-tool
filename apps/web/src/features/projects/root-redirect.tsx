'use client';

import type { ProjectDTO } from '@tmt/shared';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { FullPageSpinner } from '@/components/common/full-page';
import { useProjects } from '@/lib/api/projects';
import { routes } from '@/lib/routes';
import { getLastProjectId } from '@/lib/storage';

/** Start page target: last visited project (if still open to the user), the only project, or the list. */
export function startPath(projects: readonly ProjectDTO[], lastProjectId: number | null): string {
  const active = projects.filter((p) => !p.isArchived);
  const last = lastProjectId ? active.find((p) => p.id === lastProjectId) : undefined;
  const target = last ?? (active.length === 1 ? active[0] : undefined);
  return target ? routes.project(target.id) : routes.projects;
}

/** `/` → see {@link startPath}. */
export function RootRedirect() {
  const projects = useProjects();
  const router = useRouter();

  useEffect(() => {
    if (projects.isPending) return;
    router.replace(startPath(projects.data ?? [], getLastProjectId()));
  }, [projects.isPending, projects.data, router]);

  return <FullPageSpinner />;
}

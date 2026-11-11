'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { ErrorAlert, Spinner } from '@/components/common/error-alert';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api/client';
import { useProjectById } from '@/lib/api/projects';
import { routes } from '@/lib/routes';
import { setLastProjectId } from '@/lib/storage';
import { ProjectProvider } from '@/providers/project-provider';

/** `projectId` route param → positive integer, `null` when absent, `NaN` when malformed. */
export function parseProjectId(raw: string | string[] | undefined): number | null {
  if (raw === undefined) return null;
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isInteger(n) && n > 0 ? n : Number.NaN;
}

function useRouteProjectId(): number | null {
  const params = useParams<{ projectId?: string }>();
  return parseProjectId(params?.projectId);
}

/**
 * Wraps the whole signed-in area: when the URL is inside `/projects/[projectId]`, the project is
 * loaded and provided to the app shell (sidebar, switcher) and the pages.
 */
export function ProjectScope({ children }: { children: ReactNode }) {
  const projectId = useRouteProjectId();
  const valid = projectId !== null && !Number.isNaN(projectId);
  const project = useProjectById(valid ? projectId : null);
  return (
    <ProjectProvider project={valid ? (project.data ?? null) : null}>{children}</ProjectProvider>
  );
}

/** Content of `/projects/[projectId]/…`: spinner while loading, an error when not accessible. */
export function ProjectGate({ children }: { children: ReactNode }) {
  const projectId = useRouteProjectId();
  const valid = projectId !== null && !Number.isNaN(projectId);
  const project = useProjectById(valid ? projectId : null);

  useEffect(() => {
    if (project.data) setLastProjectId(project.data.id);
  }, [project.data]);

  useEffect(() => {
    const status = project.error instanceof ApiError ? project.error.status : null;
    if (status === 403 || status === 404) setLastProjectId(null);
  }, [project.error]);

  if (!valid || project.isError) {
    return (
      <div className="flex max-w-[560px] flex-col gap-4">
        <ErrorAlert
          error={project.error ?? new ApiError(404, 'NOT_FOUND', 'This project does not exist.')}
          title="Project not available"
        />
        <Button asChild variant="outline" className="w-fit">
          <Link href={routes.projects}>Back to projects</Link>
        </Button>
      </div>
    );
  }

  if (!project.data) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }

  return <>{children}</>;
}

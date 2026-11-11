'use client';

import type { ProjectDTO } from '@tmt/shared';
import { FolderPlus, Plus } from 'lucide-react';
import Link from 'next/link';
import { RoleBadge } from '@/components/common/badges';
import { EmptyState } from '@/components/common/empty-state';
import { QueryState } from '@/components/common/error-alert';
import { PageHeader } from '@/components/common/page-header';
import { ProjectKey } from '@/components/common/project-key';
import { StatusPill } from '@/components/common/status-pill';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useDisclosure } from '@/hooks/use-disclosure';
import { useProjects } from '@/lib/api/projects';
import { routes } from '@/lib/routes';
import { GRAY } from '@/lib/status';
import { cn } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';
import { CreateProjectDialog } from './create-project-dialog';

/** Active projects first; the server already sorts by name (the sort is stable). */
export function sortProjects(projects: readonly ProjectDTO[]): ProjectDTO[] {
  return [...projects].sort((a, b) => Number(a.isArchived) - Number(b.isArchived));
}

function ProjectCard({ project }: { project: ProjectDTO }) {
  return (
    <Link
      href={routes.project(project.id)}
      aria-label={`Open project ${project.name}`}
      className="block rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <Card
        className={cn(
          'h-full gap-2 px-5 transition-shadow hover:shadow-md',
          project.isArchived && 'opacity-70',
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <ProjectKey className="px-2">{project.key}</ProjectKey>
          <div className="flex items-center gap-1.5">
            {project.isArchived && <StatusPill tone={GRAY}>Archived</StatusPill>}
            <RoleBadge role={project.myRole} />
          </div>
        </div>
        <div className="line-clamp-2 text-lg font-semibold">{project.name}</div>
        {project.description && (
          <p className="line-clamp-3 text-sm text-muted-foreground">{project.description}</p>
        )}
      </Card>
    </Link>
  );
}

export function ProjectsPage() {
  const { isAdmin } = useAuth();
  const projects = useProjects();
  const [createOpen, createDialog] = useDisclosure(false);
  const list = sortProjects(projects.data ?? []);

  const newProjectButton = isAdmin && (
    <Button onClick={createDialog.open}>
      <Plus />
      New project
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Projects"
        subtitle="Choose a project to open its dashboard, library and test plans."
        actions={newProjectButton}
      />
      <QueryState query={projects}>
        {list.length === 0 ? (
          <Card>
            <EmptyState
              icon={<FolderPlus className="size-6" strokeWidth={1.6} />}
              title={
                isAdmin ? 'Create your first project' : 'You are not a member of any project yet'
              }
              description={
                isAdmin
                  ? 'A project holds the test case library, releases, test plans and defects of one product line.'
                  : 'Ask a project lead or an administrator to add you as a member.'
              }
              action={newProjectButton}
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        )}
      </QueryState>
      {isAdmin && <CreateProjectDialog open={createOpen} onClose={createDialog.close} />}
    </>
  );
}

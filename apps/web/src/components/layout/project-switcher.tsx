'use client';

import { Check, ChevronDown, Folders } from 'lucide-react';
import Link from 'next/link';
import { ProjectKey } from '@/components/common/project-key';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useProjects } from '@/lib/api/projects';
import { routes } from '@/lib/routes';
import { useOptionalProject } from '@/providers/project-provider';

/** Header button showing the current project with a menu of all projects of the user. */
export function ProjectSwitcher() {
  const current = useOptionalProject();
  const projects = useProjects();
  const list = projects.data ?? [];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" aria-label="Switch project" className="max-w-[340px] gap-2">
          {current ? (
            <>
              <ProjectKey>{current.project.key}</ProjectKey>
              <span className="truncate font-semibold">{current.project.name}</span>
            </>
          ) : (
            <span className="font-semibold">Select project</span>
          )}
          <ChevronDown className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[300px]">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Projects</DropdownMenuLabel>
        {list.map((p) => (
          <DropdownMenuItem key={p.id} asChild>
            <Link href={routes.project(p.id)}>
              <span className="w-10 shrink-0 font-mono text-[11px] font-semibold text-accent-foreground">
                {p.key}
              </span>
              <span className="flex-1 truncate">{p.name}</span>
              {current?.projectId === p.id && <Check aria-label="Current project" />}
            </Link>
          </DropdownMenuItem>
        ))}
        {projects.isSuccess && list.length === 0 && (
          <DropdownMenuItem disabled>No projects yet</DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={routes.projects}>
            <Folders />
            All projects
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

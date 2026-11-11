import type { ReactNode } from 'react';
import { ProjectGate } from '@/features/projects/project-scope';

/** Pages of one project render once the project is loaded (see `ProjectScope` in the app layout). */
export default function ProjectLayout({ children }: { children: ReactNode }) {
  return <ProjectGate>{children}</ProjectGate>;
}

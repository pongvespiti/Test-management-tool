import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { RequireAuth } from '@/features/auth/require-auth';
import { ProjectScope } from '@/features/projects/project-scope';

/** Signed-in area: session check → current project (from the URL) → app shell. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <ProjectScope>
        <AppShell>{children}</AppShell>
      </ProjectScope>
    </RequireAuth>
  );
}

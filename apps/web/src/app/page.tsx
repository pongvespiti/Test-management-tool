import { RequireAuth } from '@/features/auth/require-auth';
import { RootRedirect } from '@/features/projects/root-redirect';

/** `/` → last visited project, the only project, or the project list. */
export default function HomePage() {
  return (
    <RequireAuth>
      <RootRedirect />
    </RequireAuth>
  );
}

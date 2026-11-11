'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { ErrorAlert } from '@/components/common/error-alert';
import { FullPage, FullPageSpinner } from '@/components/common/full-page';
import { routes } from '@/lib/routes';
import { useAuth } from '@/providers/auth-provider';

/**
 * Guards the signed-in area: waits for `/auth/me`, sends anonymous users to the login page (with a
 * `next` back-link) and forces a password change when the account requires it.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { me, loading, error } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const mustChangePassword = !!me?.user.mustChangePassword && pathname !== routes.changePassword;
  const anonymous = !loading && !me && !error;

  useEffect(() => {
    if (anonymous) {
      router.replace(routes.login(`${window.location.pathname}${window.location.search}`));
    } else if (mustChangePassword) {
      router.replace(routes.changePassword);
    }
  }, [anonymous, mustChangePassword, router]);

  if (loading) return <FullPageSpinner />;

  if (error && !me) {
    return (
      <FullPage>
        <div className="w-full max-w-[420px]">
          <ErrorAlert
            error={error}
            title="Cannot reach the server"
            onRetry={() => window.location.reload()}
          />
        </div>
      </FullPage>
    );
  }

  if (!me || mustChangePassword) return <FullPageSpinner />;
  return <>{children}</>;
}

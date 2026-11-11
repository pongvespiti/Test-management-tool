'use client';

import type { ReactNode } from 'react';
import { ErrorAlert } from '@/components/common/error-alert';
import { useAuth } from '@/providers/auth-provider';

/** Only administrators see `children`; others get a 403 message. */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) {
    return (
      <div className="max-w-[520px]">
        <ErrorAlert
          error={new Error('This page is only available to administrators.')}
          title="You do not have access"
        />
      </div>
    );
  }
  return <>{children}</>;
}

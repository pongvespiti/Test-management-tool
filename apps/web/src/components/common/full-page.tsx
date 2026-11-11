import type { ReactNode } from 'react';
import { Spinner } from './error-alert';

/** Centered content on the page background (loading, fatal errors). */
export function FullPage({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      {children}
    </div>
  );
}

export function FullPageSpinner() {
  return (
    <FullPage>
      <Spinner />
    </FullPage>
  );
}

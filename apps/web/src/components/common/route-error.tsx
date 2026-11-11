'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { routes } from '@/lib/routes';
import { ErrorAlert } from './error-alert';

/** Error boundary body for a crashed page (the app shell stays usable). */
export function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex max-w-[520px] flex-col gap-4">
      <ErrorAlert error={error} title="This page crashed" />
      <div className="flex gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button asChild variant="outline">
          <Link href={routes.home}>Go to start page</Link>
        </Button>
      </div>
    </div>
  );
}

'use client';

import { AlertTriangle, Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api/client';
import { errorMessage } from '@/lib/notify';

/** Inline error box for a failed query/mutation. */
export function ErrorAlert({
  error,
  title,
  onRetry,
}: {
  error: unknown;
  title?: string;
  onRetry?: () => void;
}) {
  if (!error) return null;
  const status = error instanceof ApiError ? error.status : null;
  const heading =
    title ??
    (status === 403
      ? 'You do not have access'
      : status === 404
        ? 'Not found'
        : 'Something went wrong');
  return (
    <Alert variant="destructive">
      <AlertTriangle />
      <AlertTitle>{heading}</AlertTitle>
      <AlertDescription>
        <span>{errorMessage(error)}</span>
        {onRetry && (
          <Button size="sm" variant="outline" className="mt-1" onClick={onRetry}>
            Try again
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <Loader2
      aria-label="Loading"
      className={className ?? 'size-5 animate-spin text-muted-foreground'}
    />
  );
}

/** Renders loading / error / content for a query. */
export function QueryState({
  query,
  children,
  loader,
}: {
  query: { isPending: boolean; isError: boolean; error: unknown; refetch: () => unknown };
  children: ReactNode;
  loader?: ReactNode;
}) {
  if (query.isPending)
    return (
      loader ?? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      )
    );
  if (query.isError) return <ErrorAlert error={query.error} onRetry={() => void query.refetch()} />;
  return <>{children}</>;
}

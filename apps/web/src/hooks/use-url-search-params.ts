'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';

/** Options of a URL state change. */
export interface UrlUpdateOptions {
  /** Adds a history entry (the back button undoes the change) instead of replacing the current one. */
  push?: boolean;
}

/**
 * URL search params as page state, like react-router's `useSearchParams`: `setParams` receives the
 * current params and returns the next ones. Changes go through the History API, which the App Router
 * syncs with `useSearchParams` without a server round trip (filters and the open item stay instant).
 */
export function useUrlSearchParams() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const setParams = useCallback(
    (
      update: (prev: URLSearchParams) => URLSearchParams,
      { push = false }: UrlUpdateOptions = {},
    ) => {
      // The address bar is current even between two updates of the same event.
      const prev = new URLSearchParams(window.location.search);
      const next = update(new URLSearchParams(prev)).toString();
      if (next === prev.toString()) return;
      const url = next ? `${pathname}?${next}` : pathname;
      if (push) window.history.pushState(null, '', url);
      else window.history.replaceState(null, '', url);
    },
    [pathname],
  );
  return [params, setParams] as const;
}

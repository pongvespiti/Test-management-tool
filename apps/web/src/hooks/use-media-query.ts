'use client';

import { useSyncExternalStore } from 'react';

/** Tailwind breakpoints (px) — use with `useMediaQuery(up('md'))`. */
export const BREAKPOINTS = { sm: 640, md: 768, lg: 1024, xl: 1280, '2xl': 1536 } as const;

export const up = (bp: keyof typeof BREAKPOINTS) => `(min-width: ${BREAKPOINTS[bp]}px)`;

/**
 * Whether a CSS media query matches; `false` during server rendering (pass `serverValue` to change).
 * Updates when the viewport changes.
 */
export function useMediaQuery(query: string, serverValue = false): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

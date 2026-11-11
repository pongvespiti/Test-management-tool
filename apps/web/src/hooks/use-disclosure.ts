'use client';

import { useCallback, useMemo, useState } from 'react';

/** Boolean open/close state with stable handlers (dialogs, sheets, collapsibles). */
export function useDisclosure(initial = false) {
  const [opened, setOpened] = useState(initial);
  const open = useCallback(() => setOpened(true), []);
  const close = useCallback(() => setOpened(false), []);
  const toggle = useCallback(() => setOpened((v) => !v), []);
  return useMemo(
    () => [opened, { open, close, toggle, set: setOpened }] as const,
    [opened, open, close, toggle],
  );
}

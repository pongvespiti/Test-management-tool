'use client';

import { useCallback, useState } from 'react';

/**
 * Open/close state for a dialog that edits one thing. The target stays set while the dialog plays
 * its close animation (no empty flash); `key` changes on every open so forms inside start fresh.
 */
export function useModalTarget<T>() {
  const [state, setState] = useState<{ opened: boolean; target: T | null; key: number }>({
    opened: false,
    target: null,
    key: 0,
  });
  const open = useCallback(
    (target: T) => setState((s) => ({ opened: true, target, key: s.key + 1 })),
    [],
  );
  const close = useCallback(() => setState((s) => ({ ...s, opened: false })), []);
  return { opened: state.opened, target: state.target, key: state.key, open, close };
}

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/** `value` after it stopped changing for `delayMs` (search boxes, filters). */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

export interface DebouncedCallback<A extends unknown[]> {
  /** Schedules `fn(...args)`; a later call within the delay replaces the pending one. */
  run: (...args: A) => void;
  /** Drops the pending call. */
  cancel: () => void;
  /** Runs the pending call now. */
  flush: () => void;
}

/**
 * Runs `fn` only after calls stopped for `delayMs` (autosave, typing). Pending calls are cancelled
 * on unmount. The returned object is stable while `delayMs` does not change.
 */
export function useDebouncedCallback<A extends unknown[]>(
  fn: (...args: A) => void,
  delayMs = 300,
): DebouncedCallback<A> {
  const fnRef = useRef(fn);
  const timer = useRef<number | null>(null);
  const pending = useRef<A | null>(null);

  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  const cancel = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    pending.current = null;
  }, []);

  const flush = useCallback(() => {
    const args = pending.current;
    cancel();
    if (args) fnRef.current(...args);
  }, [cancel]);

  const run = useCallback(
    (...args: A) => {
      pending.current = args;
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, delayMs);
    },
    [delayMs, flush],
  );

  useEffect(() => cancel, [cancel]);

  return useMemo(() => ({ run, cancel, flush }), [run, cancel, flush]);
}

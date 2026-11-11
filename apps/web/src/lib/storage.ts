/** localStorage helpers that never throw (private mode, blocked storage). Per-browser conveniences only. */
export function storageGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function storageSet(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

const LAST_PROJECT_KEY = 'tmt:lastProjectId';

export function getLastProjectId(): number | null {
  const v = Number(storageGet(LAST_PROJECT_KEY));
  return Number.isInteger(v) && v > 0 ? v : null;
}

export function setLastProjectId(projectId: number | null): void {
  storageSet(LAST_PROJECT_KEY, projectId === null ? null : String(projectId));
}

import { format, formatDistanceToNow, isValid, parseISO } from 'date-fns';

function toDate(value: string): Date {
  return parseISO(value);
}

/** `Oct 21, 2026` (accepts ISO date-time or `YYYY-MM-DD`). */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = toDate(value);
  return isValid(d) ? format(d, 'MMM d, yyyy') : '—';
}

/** `Oct 21, 2026 14:05`. */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const d = toDate(value);
  return isValid(d) ? format(d, 'MMM d, yyyy HH:mm') : '—';
}

/** `3 hours ago`. */
export function formatRelative(value: string | null | undefined): string {
  if (!value) return '—';
  const d = toDate(value);
  return isValid(d) ? formatDistanceToNow(d, { addSuffix: true }) : '—';
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count.toLocaleString('en-US')} ${count === 1 ? singular : plural}`;
}

/** Avatar initials: `Somchai Jaidee` → `SJ`, `admin` → `AD`. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '?';
  const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : (parts[0]?.[1] ?? '');
  return `${first}${second}`.toUpperCase();
}

export function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

/** Percent helper lives in the shared contract (same output in API exports and UI). */
export { formatPercent } from '@tmt/shared';

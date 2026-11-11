const pad = (n: number) => String(n).padStart(2, '0');

/** `754` → `12:34`, `3725` → `1:02:05` (timer display). */
export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** `420` → `7m`, `3725` → `1h 2m`, `45` → `45s`; null/0 → '—'. */
export function formatDuration(totalSec: number | null | undefined): string {
  if (!totalSec) return '—';
  const s = Math.round(totalSec);
  if (s < 60) return `${s}s`;
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

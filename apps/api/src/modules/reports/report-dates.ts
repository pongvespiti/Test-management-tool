/**
 * Calendar helpers for reports: dates are bucketed in `REPORT_TIMEZONE` (an IANA zone, ADR-009).
 * Calendar dates are `YYYY-MM-DD` strings; instants are `Date`s.
 */

const DAY_MS = 86_400_000;
/**
 * UTC offsets of all current zones are multiples of 15 minutes, so a local date never changes
 * inside an aligned quarter-hour — the cache key.
 */
const BUCKET_MS = 15 * 60_000;
const CACHE_LIMIT = 200_000;

interface ZoneHelpers {
  parts: Intl.DateTimeFormat;
  cache: Map<number, string>;
}

const zones = new Map<string, ZoneHelpers>();

function zone(tz: string): ZoneHelpers {
  let z = zones.get(tz);
  if (!z) {
    z = {
      parts: new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
      cache: new Map(),
    };
    zones.set(tz, z);
  }
  return z;
}

interface WallTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function wallTime(at: Date, tz: string): WallTime {
  const out: Record<string, number> = {};
  for (const p of zone(tz).parts.formatToParts(at)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return {
    year: out.year!,
    month: out.month!,
    day: out.day!,
    hour: out.hour! % 24,
    minute: out.minute!,
    second: out.second!,
  };
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

/** Calendar date (`YYYY-MM-DD`) of an instant in `tz`. */
export function localDate(at: Date, tz: string): string {
  const z = zone(tz);
  const key = Math.floor(at.getTime() / BUCKET_MS);
  const hit = z.cache.get(key);
  if (hit !== undefined) return hit;
  const w = wallTime(new Date(key * BUCKET_MS), tz);
  const value = `${pad(w.year, 4)}-${pad(w.month)}-${pad(w.day)}`;
  if (z.cache.size >= CACHE_LIMIT) z.cache.clear();
  z.cache.set(key, value);
  return value;
}

/** `day` shifted by `n` calendar days. */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d) + n * DAY_MS).toISOString().slice(0, 10);
}

/** The `count` calendar days ending with `last` (inclusive), oldest first. */
export function dayRange(last: string, count: number): string[] {
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) out.push(addDays(last, -i));
  return out;
}

/** Offset of `tz` from UTC (ms) at instant `at`: local wall time minus UTC. */
function offsetMs(at: Date, tz: string): number {
  const w = wallTime(at, tz);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** First instant of the calendar day `day` in `tz` (local 00:00, or later when DST skips it). */
export function startOfLocalDay(day: string, tz: string): Date {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const midnightUtc = Date.UTC(y, m - 1, d);
  let guess = midnightUtc;
  for (let i = 0; i < 4; i++) {
    const next = midnightUtc - offsetMs(new Date(guess), tz);
    if (next === guess) break;
    guess = next;
  }
  // DST gap at midnight: the computed instant may belong to the previous day — move forward.
  while (localDate(new Date(guess), tz) < day) guess += BUCKET_MS;
  return new Date(guess);
}

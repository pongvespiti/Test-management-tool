/**
 * Report times in the configured `REPORT_TIMEZONE` (IANA zone, default Asia/Bangkok) using only
 * `Intl` — no time-zone library needed. Invalid zones fall back to UTC.
 */

const formatters = new Map<string, Intl.DateTimeFormat>();

/** The zone when the runtime knows it, else `UTC`. */
export function safeTimeZone(tz: string | null | undefined): string {
  if (!tz) return 'UTC';
  try {
    // Throws a RangeError for zones the runtime does not know.
    return new Intl.DateTimeFormat('en-US', { timeZone: tz }).resolvedOptions().timeZone
      ? tz
      : 'UTC';
  } catch {
    return 'UTC';
  }
}

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(tz, f);
  }
  return f;
}

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
  /** Offset of the zone from UTC at that instant, in minutes (Bangkok: +420). */
  offsetMinutes: number;
}

/** Wall-clock fields of an instant in a time zone. */
export function zonedParts(d: Date, tz: string): ZonedParts {
  const parts = formatter(safeTimeZone(tz)).formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  const year = get('year');
  const month = get('month');
  const day = get('day');
  const hour = get('hour') % 24;
  const minute = get('minute');
  const second = get('second');
  const millisecond = d.getUTCMilliseconds();
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    millisecond,
    offsetMinutes: Math.round((asUtc - d.getTime()) / 60_000),
  };
}

const pad = (n: number, width = 2) => String(Math.abs(n)).padStart(width, '0');

function toDate(d: Date | string | null | undefined): Date | null {
  if (d === null || d === undefined) return null;
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** ISO-8601 with the zone's offset, e.g. `2026-10-27T14:05:09.000+07:00` (same instant). */
export function isoInZone(d: Date | string | null | undefined, tz: string): string | null {
  const date = toDate(d);
  if (!date) return null;
  const p = zonedParts(date, tz);
  const sign = p.offsetMinutes < 0 ? '-' : '+';
  const off = Math.abs(p.offsetMinutes);
  return (
    `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}` +
    `.${pad(p.millisecond, 3)}${sign}${pad(Math.floor(off / 60))}:${pad(off % 60)}`
  );
}

/** Calendar date (`YYYY-MM-DD`) of an instant in the zone. */
export function dateInZone(d: Date, tz: string): string {
  const p = zonedParts(d, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** `YYYY-MM-DD HH:mm` of an instant in the zone (for text output). */
export function dateTimeInZone(d: Date | string | null | undefined, tz: string): string {
  const date = toDate(d);
  if (!date) return '';
  const p = zonedParts(date, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}`;
}

/**
 * A Date whose UTC fields are the zone's wall-clock time. Excel cells have no time zone, and
 * ExcelJS writes a Date by its UTC value, so this shows the local time in the workbook.
 */
export function excelLocalDate(d: Date | string | null | undefined, tz: string): Date | null {
  const date = toDate(d);
  if (!date) return null;
  const p = zonedParts(date, tz);
  return new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second));
}

/** A `YYYY-MM-DD` calendar date as an Excel date (UTC midnight). */
export function excelCalendarDate(ymd: string | null | undefined): Date | null {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
}

/** Seconds as `h:mm:ss` (or `m:ss` under an hour). */
export function formatDuration(totalSec: number | null | undefined): string {
  if (totalSec === null || totalSec === undefined) return '';
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

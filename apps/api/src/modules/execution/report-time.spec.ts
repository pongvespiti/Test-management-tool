import { describe, expect, it } from '@jest/globals';
import {
  dateInZone,
  dateTimeInZone,
  excelCalendarDate,
  excelLocalDate,
  formatDuration,
  isoInZone,
  safeTimeZone,
  zonedParts,
} from './report-time.js';

const instant = new Date('2026-10-27T18:05:09.123Z');

describe('report time', () => {
  it('validates time zones (unknown → UTC)', () => {
    expect(safeTimeZone('Asia/Bangkok')).toBe('Asia/Bangkok');
    expect(safeTimeZone('Mars/Base')).toBe('UTC');
    expect(safeTimeZone('')).toBe('UTC');
    expect(safeTimeZone(null)).toBe('UTC');
  });

  it('renders instants with the zone offset', () => {
    expect(isoInZone(instant, 'Asia/Bangkok')).toBe('2026-10-28T01:05:09.123+07:00');
    expect(isoInZone('2026-07-01T12:00:00Z', 'America/New_York')).toBe(
      '2026-07-01T08:00:00.000-04:00',
    );
    expect(isoInZone(instant, 'Asia/Kolkata')).toBe('2026-10-27T23:35:09.123+05:30');
    expect(isoInZone(null, 'UTC')).toBeNull();
    expect(isoInZone('not a date', 'UTC')).toBeNull();
    expect(zonedParts(instant, 'Asia/Bangkok')).toMatchObject({
      day: 28,
      hour: 1,
      offsetMinutes: 420,
    });
  });

  it('gives local dates and times', () => {
    expect(dateInZone(instant, 'Asia/Bangkok')).toBe('2026-10-28');
    expect(dateInZone(instant, 'UTC')).toBe('2026-10-27');
    expect(dateTimeInZone(instant, 'Asia/Bangkok')).toBe('2026-10-28 01:05');
    expect(dateTimeInZone(undefined, 'UTC')).toBe('');
    expect(dateTimeInZone('garbage', 'UTC')).toBe('');
  });

  it('builds Excel dates from wall-clock times and calendar dates', () => {
    expect(excelLocalDate(instant, 'Asia/Bangkok')).toEqual(
      new Date(Date.UTC(2026, 9, 28, 1, 5, 9)),
    );
    expect(excelLocalDate(null, 'UTC')).toBeNull();
    expect(excelLocalDate('x', 'UTC')).toBeNull();
    expect(excelCalendarDate('2026-10-20')).toEqual(new Date(Date.UTC(2026, 9, 20)));
    expect(excelCalendarDate('20/10/2026')).toBeNull();
    expect(excelCalendarDate(null)).toBeNull();
  });

  it('formats durations', () => {
    expect(formatDuration(null)).toBe('');
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(90)).toBe('1:30');
    expect(formatDuration(3_725.4)).toBe('1:02:05');
    expect(formatDuration(-5)).toBe('0:00');
  });
});

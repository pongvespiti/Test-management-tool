/** Port of the v1 server's report date cases (w2-reports "report dates"). */
import { describe, expect, it } from '@jest/globals';
import { addDays, dayRange, localDate, startOfLocalDay } from './report-dates.js';

describe('report dates', () => {
  it('buckets instants into calendar days of the report time zone', () => {
    expect(localDate(new Date('2026-10-26T16:59:59.999Z'), 'Asia/Bangkok')).toBe('2026-10-26');
    expect(localDate(new Date('2026-10-26T17:00:00.000Z'), 'Asia/Bangkok')).toBe('2026-10-27');
    expect(localDate(new Date('2026-10-26T17:00:00.000Z'), 'UTC')).toBe('2026-10-26');
    expect(localDate(new Date('2026-01-01T04:59:00Z'), 'America/New_York')).toBe('2025-12-31');
    expect(localDate(new Date('2026-06-30T18:14:00Z'), 'Asia/Kathmandu')).toBe('2026-06-30');
    expect(localDate(new Date('2026-06-30T18:15:00Z'), 'Asia/Kathmandu')).toBe('2026-07-01');
    // Cached per quarter-hour bucket: repeated lookups agree.
    expect(localDate(new Date('2026-10-26T17:07:00.000Z'), 'Asia/Bangkok')).toBe('2026-10-27');
  });

  it('does calendar arithmetic across month and year ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
    expect(dayRange('2026-11-02', 4)).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ]);
    expect(dayRange('2026-11-02', 1)).toEqual(['2026-11-02']);
  });

  it('finds the first instant of a local day, also around DST changes', () => {
    expect(startOfLocalDay('2026-10-27', 'Asia/Bangkok').toISOString()).toBe(
      '2026-10-26T17:00:00.000Z',
    );
    expect(startOfLocalDay('2026-03-29', 'Europe/Berlin').toISOString()).toBe(
      '2026-03-28T23:00:00.000Z',
    );
    expect(startOfLocalDay('2026-03-30', 'Europe/Berlin').toISOString()).toBe(
      '2026-03-29T22:00:00.000Z',
    );
    // Property check in zones whose DST changes happen at midnight.
    for (const tz of ['America/Santiago', 'America/Havana', 'Asia/Beirut', 'Europe/London']) {
      for (const day of dayRange('2026-12-31', 365)) {
        const start = startOfLocalDay(day, tz);
        expect([tz, day, localDate(start, tz)]).toEqual([tz, day, day]);
        expect([tz, day, localDate(new Date(start.getTime() - 1), tz)]).toEqual([
          tz,
          day,
          addDays(day, -1),
        ]);
      }
    }
  });
});

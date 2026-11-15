import { describe, expect, it } from '@jest/globals';
import { createStandBookingSchema, MESSAGES, minutesOf, renderMessage, textMessage } from '../src';

describe('notification messages', () => {
  it('has English and Thai with the same placeholders for every key', () => {
    const names = (t: string) => [...t.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const [key, t] of Object.entries(MESSAGES)) {
      expect([key, names(t.th)]).toEqual([key, names(t.en)]);
      expect(t.th).not.toBe('');
    }
  });

  it('renders nested messages in the chosen language', () => {
    const m = {
      key: 'stand_done' as const,
      vars: {
        actor: 'Tina',
        what: { key: 'stand_what_install' as const, vars: { model: 'ACU-25', code: 'L1/A-1' } },
      },
    };
    expect(renderMessage(m)).toBe('Install ACU-25 at L1/A-1 done by Tina');
    expect(renderMessage(m, 'th')).toBe('Tina ทำงาน ติดตั้ง ACU-25 ที่ L1/A-1 เสร็จแล้ว');
    expect(renderMessage(textMessage('Note'), 'th')).toBe('Note');
  });
});

describe('hourly stand bookings', () => {
  const base = {
    standId: 1,
    projectId: 1,
    model: 'M',
    startDate: '2030-01-01',
    endDate: '2030-01-01',
  };
  it('takes both times or none, and the end after the start', () => {
    expect(createStandBookingSchema.safeParse(base).success).toBe(true);
    expect(
      createStandBookingSchema.safeParse({ ...base, startTime: '08:00', endTime: '24:00' }).success,
    ).toBe(true);
    expect(createStandBookingSchema.safeParse({ ...base, startTime: '08:00' }).success).toBe(false);
    expect(
      createStandBookingSchema.safeParse({ ...base, startTime: '10:00', endTime: '10:00' }).success,
    ).toBe(false);
    expect(
      createStandBookingSchema.safeParse({
        ...base,
        endDate: '2030-01-02',
        startTime: '22:00',
        endTime: '06:00',
      }).success,
    ).toBe(true);
    expect(minutesOf('13:45')).toBe(825);
  });
});

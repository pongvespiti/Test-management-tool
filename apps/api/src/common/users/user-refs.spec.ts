import { describe, expect, it } from '@jest/globals';
import { userRow } from '../../../test/unit/fixtures.js';
import { createPrismaMock } from '../../../test/unit/prisma-mock.js';
import {
  assertActiveUser,
  dateOnly,
  iso,
  loadUserRefs,
  parseDateOnly,
  refOf,
  toUserDTO,
  toUserRef,
} from './user-refs.js';

describe('user refs and date helpers', () => {
  it('maps users to refs and DTOs (no secrets)', () => {
    const u = userRow({ lastLoginAt: new Date('2026-02-01T10:00:00Z') });
    expect(toUserRef(u)).toEqual({ id: 1, username: 'alice', displayName: 'Alice' });
    const dto = toUserDTO(u);
    expect(dto.lastLoginAt).toBe('2026-02-01T10:00:00.000Z');
    expect(Object.keys(dto)).not.toContain('passwordHash');
  });

  it('batch-loads refs once per distinct id', async () => {
    const { db } = createPrismaMock();
    db.user.findMany.mockResolvedValue([
      userRow({ id: 2, username: 'bob', displayName: 'Bob' }),
    ] as never);
    const map = await loadUserRefs(db, [2, 2, null, undefined]);
    expect(db.user.findMany.mock.calls[0]![0]!.where).toEqual({ id: { in: [2] } });
    expect(refOf(map, 2)).toEqual({ id: 2, username: 'bob', displayName: 'Bob' });
    expect(refOf(map, 3)).toBeNull();
    expect(refOf(map, null)).toBeNull();
    await expect(loadUserRefs(db, [])).resolves.toEqual(new Map());
    expect(db.user.findMany).toHaveBeenCalledTimes(1);
  });

  it('formats and parses calendar dates without time-zone drift', () => {
    expect(iso(null)).toBeNull();
    expect(dateOnly(new Date('2026-03-04T00:00:00Z'))).toBe('2026-03-04');
    expect(parseDateOnly('2026-03-04')).toEqual(new Date('2026-03-04T00:00:00.000Z'));
    expect(parseDateOnly(null)).toBeNull();
    expect(parseDateOnly(undefined)).toBeUndefined();
  });

  it('accepts only existing active users as references', async () => {
    const { db } = createPrismaMock();
    db.user.count.mockResolvedValue(0);
    await expect(assertActiveUser(db, 9)).rejects.toMatchObject({ code: 'UNKNOWN_USER' });
    db.user.count.mockResolvedValue(1);
    await expect(assertActiveUser(db, 9)).resolves.toBeUndefined();
    await expect(assertActiveUser(db, null)).resolves.toBeUndefined();
  });
});

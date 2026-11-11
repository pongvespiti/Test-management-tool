import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Prisma } from '@tmt/database';
import { authUser, userRow } from '../../../test/unit/fixtures.js';
import { createPrismaMock, type PrismaMock } from '../../../test/unit/prisma-mock.js';
import type { ActivityService } from '../activity/activity.service.js';
import type { ApiTokenService } from '../auth/api-token.service.js';
import { verifyPassword } from '../auth/password.js';
import type { SessionService } from '../auth/session.service.js';
import { UsersService } from './users.service.js';

describe('UsersService', () => {
  const admin = authUser({ id: 1, username: 'admin', isAdmin: true });
  let mock: PrismaMock;
  let sessions: { revokeForUser: jest.Mock };
  let tokens: { revokeAllOfUser: jest.Mock<ApiTokenService['revokeAllOfUser']> };
  let activity: { log: jest.Mock<ActivityService['log']> };
  let service: UsersService;

  beforeEach(() => {
    mock = createPrismaMock();
    sessions = { revokeForUser: jest.fn() };
    tokens = {
      revokeAllOfUser: jest.fn<ApiTokenService['revokeAllOfUser']>().mockResolvedValue(2),
    };
    activity = { log: jest.fn<ActivityService['log']>().mockResolvedValue(undefined) };
    service = new UsersService(
      mock.prisma,
      activity as unknown as ActivityService,
      sessions as unknown as SessionService,
      tokens as unknown as ApiTokenService,
    );
  });

  it('lists users as DTOs without password hashes', async () => {
    mock.db.user.findMany.mockResolvedValue([userRow()]);
    const [dto] = await service.list();
    expect(dto).not.toHaveProperty('passwordHash');
    expect(dto).toMatchObject({ id: 1, username: 'alice', isActive: true });
  });

  it('searches active users by username or display name', async () => {
    mock.db.user.findMany.mockResolvedValue([userRow()] as never);
    await expect(service.lookup('ali')).resolves.toEqual([
      { id: 1, username: 'alice', displayName: 'Alice' },
    ]);
    const where = mock.db.user.findMany.mock.calls[0]![0]!.where;
    expect(where).toMatchObject({ isActive: true });
    expect(JSON.stringify(where)).toContain('"contains":"ali"');
  });

  it('creates users with a lower-case username who must change the password', async () => {
    mock.db.user.create.mockImplementation((async (args: { data: Record<string, unknown> }) =>
      userRow({ ...args.data, id: 5 })) as never);
    const dto = await service.create(admin, {
      username: 'Bob.Smith',
      displayName: 'Bob Smith',
      password: 'Initial123',
      isAdmin: false,
    });
    const data = mock.db.user.create.mock.calls[0]![0].data as {
      username: string;
      passwordHash: string;
      mustChangePassword: boolean;
    };
    expect(data.username).toBe('bob.smith');
    expect(data.mustChangePassword).toBe(true);
    await expect(verifyPassword('Initial123', data.passwordHash)).resolves.toBe(true);
    expect(dto.id).toBe(5);
    expect(activity.log.mock.calls[0]![1]).toMatchObject({ action: 'created', entityId: 5 });
  });

  it('answers USERNAME_TAKEN for duplicates', async () => {
    mock.db.user.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'test' }),
    );
    await expect(
      service.create(admin, {
        username: 'alice',
        displayName: 'A',
        password: 'Initial123',
        isAdmin: false,
      }),
    ).rejects.toMatchObject({ code: 'USERNAME_TAKEN' });
  });

  it('does not let admins disable themselves or drop their admin rights', async () => {
    await expect(service.update(admin, 1, { isActive: false })).rejects.toMatchObject({
      code: 'CANNOT_MODIFY_SELF',
    });
    await expect(service.update(admin, 1, { isAdmin: false })).rejects.toMatchObject({
      code: 'CANNOT_MODIFY_SELF',
    });
  });

  it('signs out a user who gets disabled', async () => {
    mock.db.user.count.mockResolvedValue(1);
    mock.db.user.update.mockResolvedValue(userRow({ id: 2, isActive: false }));
    const dto = await service.update(admin, 2, { isActive: false });
    expect(dto.isActive).toBe(false);
    expect(sessions.revokeForUser).toHaveBeenCalledWith(mock.db, 2);
  });

  it('answers USER_NOT_FOUND for unknown users', async () => {
    mock.db.user.count.mockResolvedValue(0);
    await expect(service.update(admin, 404, { displayName: 'x' })).rejects.toMatchObject({
      code: 'USER_NOT_FOUND',
    });
    await expect(
      service.resetPassword(admin, 404, { newPassword: 'Another123' }),
    ).rejects.toMatchObject({ code: 'USER_NOT_FOUND' });
  });

  it('resets a password: unlocks, forces a change and ends all sessions', async () => {
    mock.db.user.count.mockResolvedValue(1);
    mock.db.user.update.mockResolvedValue(userRow({ id: 2, username: 'bob' }));
    await service.resetPassword(admin, 2, { newPassword: 'Another123' });
    expect(mock.db.user.update.mock.calls[0]![0].data).toMatchObject({
      mustChangePassword: true,
      failedLogins: 0,
      lockedUntil: null,
    });
    expect(sessions.revokeForUser).toHaveBeenCalledWith(mock.db, 2);
  });

  it('revokes all API tokens of a user and logs the count', async () => {
    mock.db.user.findUnique.mockResolvedValue(userRow({ id: 2, username: 'bob' }));
    await service.revokeTokens(admin, 2);
    expect(tokens.revokeAllOfUser).toHaveBeenCalledWith(2);
    expect(activity.log.mock.calls[0]![1].summary).toBe('Revoked 2 API token(s) of bob');
  });
});

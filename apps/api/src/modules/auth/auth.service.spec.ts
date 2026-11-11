import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { authUser, unitConfig, userRow } from '../../../test/unit/fixtures.js';
import { createPrismaMock, type PrismaMock } from '../../../test/unit/prisma-mock.js';
import type { ActivityService } from '../activity/activity.service.js';
import { AuthService } from './auth.service.js';
import { hashPassword, verifyPassword } from './password.js';
import type { SessionService } from './session.service.js';

const PASSWORD = 'Secret123!';

describe('AuthService', () => {
  let hash: string;
  let mock: PrismaMock;
  let sessions: {
    create: jest.Mock<SessionService['create']>;
    destroyByToken: jest.Mock;
    revokeForUser: jest.Mock;
  };
  let activity: { log: jest.Mock<ActivityService['log']> };
  let service: AuthService;

  beforeAll(async () => {
    hash = await hashPassword(PASSWORD);
  });

  beforeEach(() => {
    mock = createPrismaMock();
    sessions = {
      create: jest.fn<SessionService['create']>().mockResolvedValue({
        token: 'tok',
        expiresAt: new Date('2030-01-01T00:00:00Z'),
      }),
      destroyByToken: jest.fn(),
      revokeForUser: jest.fn(),
    };
    activity = { log: jest.fn<ActivityService['log']>().mockResolvedValue(undefined) };
    service = new AuthService(
      mock.prisma,
      unitConfig({ LOGIN_MAX_FAILED: '3', LOGIN_LOCK_MINUTES: '10' }),
      sessions as unknown as SessionService,
      activity as unknown as ActivityService,
    );
    mock.db.user.findUnique.mockImplementation((async (args: {
      where: { username?: string; id?: number };
    }) =>
      args.where.username === 'alice' || args.where.id === 1
        ? { ...userRow({ passwordHash: hash }), memberships: [] }
        : null) as never);
  });

  describe('login', () => {
    it('signs in case-insensitively, resets counters and opens a session', async () => {
      const result = await service.login(
        { username: 'ALICE', password: PASSWORD },
        { ip: '1.2.3.4' },
      );
      expect(mock.db.user.findUnique.mock.calls[0]![0].where).toEqual({ username: 'alice' });
      expect(mock.db.user.update.mock.calls[0]![0].data).toMatchObject({
        failedLogins: 0,
        lockedUntil: null,
      });
      expect(sessions.create).toHaveBeenCalledWith(1, { ip: '1.2.3.4' });
      expect(result.session.token).toBe('tok');
      expect(result.me.user.username).toBe('alice');
      expect(result.me.memberships).toEqual([]);
    });

    it('answers INVALID_CREDENTIALS for unknown users', async () => {
      await expect(service.login({ username: 'mallory', password: 'x' }, {})).rejects.toMatchObject(
        {
          code: 'INVALID_CREDENTIALS',
        },
      );
    });

    it('counts failed attempts', async () => {
      await expect(
        service.login({ username: 'alice', password: 'wrong' }, {}),
      ).rejects.toMatchObject({
        code: 'INVALID_CREDENTIALS',
      });
      expect(mock.db.user.update.mock.calls[0]![0].data).toMatchObject({ failedLogins: 1 });
    });

    it('locks the account after LOGIN_MAX_FAILED failures and logs it', async () => {
      mock.db.user.findUnique.mockResolvedValue(userRow({ passwordHash: hash, failedLogins: 2 }));
      const before = Date.now();
      await expect(
        service.login({ username: 'alice', password: 'wrong' }, {}),
      ).rejects.toMatchObject({
        code: 'ACCOUNT_LOCKED',
      });
      const data = mock.db.user.update.mock.calls[0]![0].data as {
        lockedUntil: Date;
        failedLogins: number;
      };
      expect(data.failedLogins).toBe(0);
      expect(data.lockedUntil.getTime()).toBeGreaterThanOrEqual(before + 10 * 60_000);
      expect(activity.log.mock.calls[0]![1]).toMatchObject({
        action: 'locked',
        entityType: 'user',
      });
    });

    it('refuses locked accounts even with the right password', async () => {
      mock.db.user.findUnique.mockResolvedValue(
        userRow({ passwordHash: hash, lockedUntil: new Date(Date.now() + 60_000) }),
      );
      await expect(
        service.login({ username: 'alice', password: PASSWORD }, {}),
      ).rejects.toMatchObject({
        code: 'ACCOUNT_LOCKED',
      });
    });

    it('refuses disabled accounts after a correct password', async () => {
      mock.db.user.findUnique.mockResolvedValue(userRow({ passwordHash: hash, isActive: false }));
      await expect(
        service.login({ username: 'alice', password: PASSWORD }, {}),
      ).rejects.toMatchObject({
        code: 'ACCOUNT_DISABLED',
      });
      expect(sessions.create).not.toHaveBeenCalled();
    });
  });

  it('maps memberships into the profile', async () => {
    mock.db.user.findUnique.mockResolvedValue({
      ...userRow(),
      memberships: [{ role: 'tester', project: { id: 3, key: 'ACS', name: 'ACS Smart' } }],
    } as never);
    await expect(service.me(1)).resolves.toMatchObject({
      memberships: [{ projectId: 3, projectKey: 'ACS', projectName: 'ACS Smart', role: 'tester' }],
    });
  });

  it('logs out by destroying the session of the cookie', async () => {
    await service.logout('tok');
    expect(sessions.destroyByToken).toHaveBeenCalledWith('tok');
    await service.logout(undefined);
    expect(sessions.destroyByToken).toHaveBeenCalledTimes(1);
  });

  describe('changePassword', () => {
    it('rejects a wrong current password', async () => {
      await expect(
        service.changePassword(
          authUser(),
          { currentPassword: 'nope', newPassword: 'Another1!' },
          's',
        ),
      ).rejects.toMatchObject({ code: 'WRONG_PASSWORD' });
    });

    it('rejects reusing the current password', async () => {
      await expect(
        service.changePassword(
          authUser(),
          { currentPassword: PASSWORD, newPassword: PASSWORD },
          's',
        ),
      ).rejects.toMatchObject({ code: 'SAME_PASSWORD' });
    });

    it('stores the new hash, clears the flag and signs out other sessions', async () => {
      await service.changePassword(
        authUser(),
        { currentPassword: PASSWORD, newPassword: 'Brand-new-1' },
        'current-session',
      );
      const data = mock.db.user.update.mock.calls[0]![0].data as {
        passwordHash: string;
        mustChangePassword: boolean;
      };
      expect(data.mustChangePassword).toBe(false);
      await expect(verifyPassword('Brand-new-1', data.passwordHash)).resolves.toBe(true);
      expect(sessions.revokeForUser).toHaveBeenCalledWith(mock.db, 1, 'current-session');
      expect(activity.log.mock.calls[0]![1]).toMatchObject({ action: 'password_changed' });
    });
  });
});

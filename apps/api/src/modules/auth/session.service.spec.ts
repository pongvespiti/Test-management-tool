import { beforeEach, describe, expect, it } from '@jest/globals';
import { unitConfig, userRow } from '../../../test/unit/fixtures.js';
import { createPrismaMock, type PrismaMock } from '../../../test/unit/prisma-mock.js';
import { SessionService, sha256Hex } from './session.service.js';

const HOUR = 3600 * 1000;

describe('SessionService', () => {
  let mock: PrismaMock;
  let service: SessionService;

  beforeEach(() => {
    mock = createPrismaMock();
    service = new SessionService(
      mock.prisma,
      unitConfig({ SESSION_MAX_DAYS: '7', SESSION_IDLE_HOURS: '12' }),
    );
  });

  const sessionRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'hash',
    userId: 1,
    expiresAt: new Date(Date.now() + 24 * HOUR),
    lastSeenAt: new Date(),
    createdAt: new Date(),
    ip: null,
    userAgent: null,
    user: userRow(),
    ...overrides,
  });

  it('creates a random token and stores only its SHA-256', async () => {
    const { token, expiresAt } = await service.create(1, { ip: '10.0.0.1', userAgent: 'jest' });
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const data = mock.db.session.create.mock.calls[0]![0].data;
    expect(data).toMatchObject({
      id: sha256Hex(token),
      userId: 1,
      ip: '10.0.0.1',
      userAgent: 'jest',
    });
    expect(expiresAt.getTime() - Date.now()).toBeGreaterThan(6.9 * 24 * HOUR);
  });

  it('resolves a valid session to its user', async () => {
    mock.db.session.findUnique.mockResolvedValue(sessionRow() as never);
    const resolved = await service.resolve('token');
    expect(mock.db.session.findUnique.mock.calls[0]![0].where).toEqual({ id: sha256Hex('token') });
    expect(resolved).toEqual({
      sessionId: sha256Hex('token'),
      user: {
        id: 1,
        username: 'alice',
        displayName: 'Alice',
        isAdmin: false,
        isTechnician: false,
        mustChangePassword: false,
      },
    });
    expect(mock.db.session.update).not.toHaveBeenCalled();
  });

  it('refreshes last_seen_at at most once a minute', async () => {
    mock.db.session.findUnique.mockResolvedValue(
      sessionRow({ lastSeenAt: new Date(Date.now() - 2 * 60_000) }) as never,
    );
    await service.resolve('token');
    expect(mock.db.session.update).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['expired', { expiresAt: new Date(Date.now() - 1000) }],
    ['idle too long', { lastSeenAt: new Date(Date.now() - 13 * HOUR) }],
    ['of a disabled user', { user: userRow({ isActive: false }) }],
  ])('drops a session that is %s', async (_label, overrides) => {
    mock.db.session.findUnique.mockResolvedValue(sessionRow(overrides) as never);
    await expect(service.resolve('token')).resolves.toBeNull();
    expect(mock.db.session.deleteMany).toHaveBeenCalledWith({ where: { id: sha256Hex('token') } });
  });

  it('returns null for unknown tokens', async () => {
    mock.db.session.findUnique.mockResolvedValue(null);
    await expect(service.resolve('nope')).resolves.toBeNull();
  });

  it('revokes all sessions of a user except the kept one', async () => {
    await service.revokeForUser(mock.db, 4, 'keep-me');
    expect(mock.db.session.deleteMany).toHaveBeenCalledWith({
      where: { userId: 4, id: { not: 'keep-me' } },
    });
    await service.revokeForUser(mock.db, 4);
    expect(mock.db.session.deleteMany).toHaveBeenLastCalledWith({ where: { userId: 4 } });
  });

  it('cleans up expired and idle sessions', async () => {
    mock.db.session.deleteMany.mockResolvedValue({ count: 3 });
    await expect(service.cleanup()).resolves.toBe(3);
  });

  it('destroys a session by its token', async () => {
    await service.destroyByToken('t');
    expect(mock.db.session.deleteMany).toHaveBeenCalledWith({ where: { id: sha256Hex('t') } });
  });
});

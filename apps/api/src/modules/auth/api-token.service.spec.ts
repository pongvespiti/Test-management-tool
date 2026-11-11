import { beforeEach, describe, expect, it } from '@jest/globals';
import type { ApiToken } from '@tmt/database';
import { userRow } from '../../../test/unit/fixtures.js';
import { createPrismaMock, type PrismaMock } from '../../../test/unit/prisma-mock.js';
import { AppException } from '../../common/errors/app.exception.js';
import { ApiTokenService, MAX_ACTIVE_TOKENS } from './api-token.service.js';
import { sha256Hex } from './session.service.js';

const NOW = Date.now();

function tokenRow(overrides: Partial<ApiToken> = {}): ApiToken {
  return {
    id: 9,
    userId: 1,
    name: 'CI',
    tokenHash: 'h',
    prefix: 'tmt_abcd',
    createdAt: new Date(NOW - 1000),
    lastUsedAt: new Date(NOW - 1000),
    expiresAt: null,
    revokedAt: null,
    ...overrides,
  };
}

describe('ApiTokenService', () => {
  let mock: PrismaMock;
  let service: ApiTokenService;

  beforeEach(() => {
    mock = createPrismaMock();
    service = new ApiTokenService(mock.prisma);
  });

  describe('resolve', () => {
    it('ignores strings without the tmt_ prefix', async () => {
      await expect(service.resolve('ghp_abc')).resolves.toBeNull();
      expect(mock.db.apiToken.findUnique).not.toHaveBeenCalled();
    });

    it('returns the user of a valid token, looked up by hash', async () => {
      mock.db.apiToken.findUnique.mockResolvedValue({ ...tokenRow(), user: userRow() } as never);
      const user = await service.resolve('tmt_secret');
      expect(mock.db.apiToken.findUnique.mock.calls[0]![0].where).toEqual({
        tokenHash: sha256Hex('tmt_secret'),
      });
      expect(user?.username).toBe('alice');
      expect(mock.db.apiToken.update).not.toHaveBeenCalled();
    });

    it.each([
      ['revoked', { revokedAt: new Date(NOW - 1) }],
      ['expired', { expiresAt: new Date(NOW - 1) }],
    ])('rejects a %s token', async (_label, overrides) => {
      mock.db.apiToken.findUnique.mockResolvedValue({
        ...tokenRow(overrides),
        user: userRow(),
      } as never);
      await expect(service.resolve('tmt_x')).resolves.toBeNull();
    });

    it('rejects tokens of disabled users', async () => {
      mock.db.apiToken.findUnique.mockResolvedValue({
        ...tokenRow(),
        user: userRow({ isActive: false }),
      } as never);
      await expect(service.resolve('tmt_x')).resolves.toBeNull();
    });

    it('records the last use at most every five minutes', async () => {
      mock.db.apiToken.findUnique.mockResolvedValue({
        ...tokenRow({ lastUsedAt: new Date(NOW - 6 * 60_000) }),
        user: userRow(),
      } as never);
      await service.resolve('tmt_x');
      expect(mock.db.apiToken.update).toHaveBeenCalledTimes(1);
    });
  });

  it('creates a token, stores its hash and returns the secret once', async () => {
    mock.db.apiToken.count.mockResolvedValue(0);
    mock.db.apiToken.create.mockImplementation((async (args: { data: Partial<ApiToken> }) =>
      tokenRow({ ...args.data, id: 11 })) as never);
    const created = await service.create(1, { name: 'CI', expiresInDays: 30 });
    expect(created.token).toMatch(/^tmt_[A-Za-z0-9_-]{40}$/);
    const data = mock.db.apiToken.create.mock.calls[0]![0].data;
    expect(data.tokenHash).toBe(sha256Hex(created.token));
    expect(data.prefix).toBe(created.token.slice(0, 8));
    expect((data.expiresAt as Date).getTime()).toBeGreaterThan(NOW + 29 * 24 * 3600 * 1000);
    expect(created).toMatchObject({ id: 11, name: 'CI', prefix: created.token.slice(0, 8) });
  });

  it('limits the number of active tokens', async () => {
    mock.db.apiToken.count.mockResolvedValue(MAX_ACTIVE_TOKENS);
    await expect(service.create(1, { name: 'x' })).rejects.toMatchObject({
      code: 'TOO_MANY_TOKENS',
    });
  });

  it('revokes only own active tokens', async () => {
    mock.db.apiToken.updateMany.mockResolvedValue({ count: 0 });
    const error = await service.revoke(1, 99).catch((e: AppException) => e);
    expect((error as AppException).code).toBe('TOKEN_NOT_FOUND');
    mock.db.apiToken.updateMany.mockResolvedValue({ count: 1 });
    await expect(service.revoke(1, 9)).resolves.toBeUndefined();
    expect(mock.db.apiToken.updateMany.mock.calls[1]![0].where).toEqual({
      id: 9,
      userId: 1,
      revokedAt: null,
    });
  });

  it('lists active tokens as DTOs', async () => {
    mock.db.apiToken.findMany.mockResolvedValue([tokenRow()]);
    const [dto] = await service.list(1);
    expect(dto).toEqual({
      id: 9,
      name: 'CI',
      prefix: 'tmt_abcd',
      createdAt: new Date(NOW - 1000).toISOString(),
      lastUsedAt: new Date(NOW - 1000).toISOString(),
      expiresAt: null,
    });
  });
});

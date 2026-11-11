import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { Prisma } from '@tmt/database';
import { unitConfig } from '../../../test/unit/fixtures.js';
import { createPrismaMock, type PrismaMock } from '../../../test/unit/prisma-mock.js';
import { InitialAdminService } from './initial-admin.service.js';
import { verifyPassword } from './password.js';

describe('InitialAdminService', () => {
  let mock: PrismaMock;

  beforeEach(() => {
    mock = createPrismaMock();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  it('does nothing when users exist', async () => {
    mock.db.user.count.mockResolvedValue(3);
    const service = new InitialAdminService(mock.prisma, unitConfig());
    await expect(service.ensureInitialAdmin()).resolves.toBeNull();
    expect(mock.db.user.create).not.toHaveBeenCalled();
  });

  it('creates the administrator with INITIAL_ADMIN_PASSWORD', async () => {
    mock.db.user.count.mockResolvedValue(0);
    const service = new InitialAdminService(
      mock.prisma,
      unitConfig({ INITIAL_ADMIN_USERNAME: 'Root', INITIAL_ADMIN_PASSWORD: 'FromEnv123' }),
    );
    await expect(service.ensureInitialAdmin()).resolves.toBeNull();
    const data = mock.db.user.create.mock.calls[0]![0].data as {
      username: string;
      passwordHash: string;
      isAdmin: boolean;
      mustChangePassword: boolean;
    };
    expect(data).toMatchObject({ username: 'root', isAdmin: true, mustChangePassword: true });
    await expect(verifyPassword('FromEnv123', data.passwordHash)).resolves.toBe(true);
  });

  it('generates and returns a one-time password when none is configured', async () => {
    mock.db.user.count.mockResolvedValue(0);
    const service = new InitialAdminService(mock.prisma, unitConfig());
    const generated = await service.ensureInitialAdmin();
    expect(generated).toMatch(/^[A-Za-z0-9_-]{16}$/);
  });

  it('tolerates a concurrent creation by another instance', async () => {
    mock.db.user.count.mockResolvedValue(0);
    mock.db.user.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'test' }),
    );
    const service = new InitialAdminService(
      mock.prisma,
      unitConfig({ INITIAL_ADMIN_PASSWORD: 'FromEnv123' }),
    );
    await expect(service.ensureInitialAdmin()).resolves.toBeNull();
  });

  it('is skipped in the test environment', async () => {
    const service = new InitialAdminService(mock.prisma, unitConfig({ NODE_ENV: 'test' }));
    await service.onApplicationBootstrap();
    expect(mock.db.user.count).not.toHaveBeenCalled();
  });
});

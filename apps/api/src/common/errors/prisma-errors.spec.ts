import { describe, expect, it } from '@jest/globals';
import { Prisma } from '@tmt/database';
import { isDbUnavailable, isRecordNotFound, isUniqueViolation } from './prisma-errors.js';

const known = (code: string, meta?: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError('db error', { code, clientVersion: 'test', meta });

describe('prisma error helpers', () => {
  it('detects unique violations, optionally of one constraint', () => {
    const viaAdapter = known('P2002', {
      driverAdapterError: { cause: { constraint: { index: 'projects_key_key' } } },
    });
    expect(isUniqueViolation(viaAdapter)).toBe(true);
    expect(isUniqueViolation(viaAdapter, 'projects_key_key')).toBe(true);
    expect(isUniqueViolation(viaAdapter, 'users_username_key')).toBe(false);
    expect(isUniqueViolation(known('P2002', { target: ['key'] }), 'key')).toBe(true);
    expect(isUniqueViolation(known('P2002', { target: 'key' }), 'key')).toBe(true);
    expect(isUniqueViolation(known('P2025'))).toBe(false);
    expect(isUniqueViolation(new Error('x'))).toBe(false);
  });

  it('detects missing records', () => {
    expect(isRecordNotFound(known('P2025'))).toBe(true);
    expect(isRecordNotFound(known('P2002'))).toBe(false);
    expect(isRecordNotFound(null)).toBe(false);
  });

  it('detects an unreachable database through nested causes', () => {
    expect(isDbUnavailable(Object.assign(new Error('x'), { code: 'ECONNREFUSED' }))).toBe(true);
    expect(isDbUnavailable(Object.assign(new Error('x'), { code: '57P01' }))).toBe(true);
    expect(isDbUnavailable(new Error('Connection terminated unexpectedly'))).toBe(true);
    const nested = new Error('outer', {
      cause: new Error('middle', { cause: Object.assign(new Error('inner'), { code: '08006' }) }),
    });
    expect(isDbUnavailable(nested)).toBe(true);
    expect(isDbUnavailable(new Prisma.PrismaClientInitializationError('down', 'test'))).toBe(true);
    expect(isDbUnavailable(new Error('syntax error'))).toBe(false);
    expect(isDbUnavailable(undefined)).toBe(false);
  });
});

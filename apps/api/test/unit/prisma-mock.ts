import type { PrismaClient } from '@tmt/database';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import type { PrismaService } from '../../src/prisma/prisma.service.js';

export interface PrismaMock {
  /** Inject this where a `PrismaService` is expected. */
  prisma: PrismaService;
  /** The mocked client: stub queries with `db.user.findUnique.mockResolvedValue(…)`. */
  db: DeepMockProxy<PrismaClient>;
}

/**
 * Prisma mock for unit tests. Interactive transactions run the callback with the same mocked
 * client, so expectations on `db.<model>.<method>` cover code inside `$transaction` too.
 */
export function createPrismaMock(): PrismaMock {
  const db = mockDeep<PrismaClient>();
  db.$transaction.mockImplementation(((arg: unknown) =>
    typeof arg === 'function'
      ? (arg as (tx: unknown) => Promise<unknown>)(db)
      : Promise.all(arg as Promise<unknown>[])) as never);
  return { prisma: { db } as unknown as PrismaService, db };
}

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

export interface CreatePrismaClientOptions {
  /** PostgreSQL connection string, e.g. `postgresql://user:pass@host:5432/tmt`. */
  connectionString: string;
  /** Maximum pool size (default 10). */
  maxConnections?: number;
  /** Log SQL queries (development only). */
  logQueries?: boolean;
}

/**
 * Creates a Prisma client on the node-postgres driver adapter (Prisma 7, no native query engine).
 * The connection string always comes from configuration — never hard-coded.
 */
export function createPrismaClient(options: CreatePrismaClientOptions): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: options.connectionString,
    max: options.maxConnections ?? 10,
  });
  return new PrismaClient({
    adapter,
    log: options.logQueries ? ['query', 'warn', 'error'] : ['warn'],
  });
}

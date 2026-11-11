import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { createPrismaClient, type PrismaClient } from '@tmt/database';
import { AppConfig } from '../config/app-config.js';

/** Transaction client handed to `prisma.$transaction(async (tx) => …)` callbacks. */
export type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];
/** Either the root client or a transaction client. */
export type Db = PrismaClient | Tx;

/**
 * The single Prisma client of the process (node-postgres adapter, pool size from config).
 * Inject `PrismaService` and use `this.prisma.db` for queries.
 */
@Injectable()
export class PrismaService implements OnModuleDestroy {
  readonly db: PrismaClient;

  constructor(config: AppConfig) {
    this.db = createPrismaClient({
      connectionString: config.databaseUrl,
      maxConnections: config.dbPoolMax,
      logQueries: config.logLevel === 'trace',
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.db.$disconnect();
  }
}

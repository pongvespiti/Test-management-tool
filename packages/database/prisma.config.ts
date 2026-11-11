import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { defineConfig, env } from 'prisma/config';

// Package-local `.env` first, then the monorepo root `.env` (values already set win).
loadEnv({ path: ['.env', path.join('..', '..', '.env')], quiet: true });

/**
 * Prisma CLI configuration (generate, migrate, studio).
 * DATABASE_URL comes from the environment — never hard-coded.
 */
export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const MIGRATIONS_DIR = fileURLToPath(
  new URL('../../../../packages/database/prisma/migrations', import.meta.url),
);

/**
 * Recreates the test database schema from the Prisma migrations (plain SQL, applied in order),
 * so tests always run against exactly what `prisma migrate deploy` would create.
 */
export default async function globalSetup(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://postgres@localhost:5432/tmt_next_test';
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
    const dirs = (await fs.readdir(MIGRATIONS_DIR, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    for (const dir of dirs) {
      const sql = await fs.readFile(path.join(MIGRATIONS_DIR, dir, 'migration.sql'), 'utf8');
      await client.query(sql);
    }
  } finally {
    await client.end();
  }
}

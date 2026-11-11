import path from 'node:path';
import { config as loadEnv } from 'dotenv';

/**
 * Loads `.env` of the workspace, then of the monorepo root (first file wins); variables already
 * set in the real environment always win. Call before the Nest application is created.
 */
export function loadEnvFiles(): void {
  loadEnv({ path: ['.env', path.join('..', '..', '.env')], quiet: true });
}

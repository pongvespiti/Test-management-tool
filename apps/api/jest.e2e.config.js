import { createNodeConfig } from '@tmt/jest-config/node';

/**
 * End-to-end tests: the real Nest application (supertest) on the PostgreSQL test database
 * (TEST_DATABASE_URL, re-created from the Prisma migrations). Files run one at a time because
 * they share that database.
 */
export default createNodeConfig({
  rootDir: import.meta.dirname,
  displayName: 'api:e2e',
  testMatch: ['<rootDir>/test/**/*.e2e-spec.ts'],
  setupFiles: ['<rootDir>/test/setup/env.ts'],
  globalSetup: '<rootDir>/test/setup/global-setup.ts',
  testTimeout: 30_000,
  serial: true,
});

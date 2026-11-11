import { createNodeConfig } from '@tmt/jest-config/node';

/** Contract tests of the schema (no database needed). */
export default createNodeConfig({
  rootDir: import.meta.dirname,
  displayName: 'database',
  testMatch: ['<rootDir>/test/**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/generated/**', '!src/index.ts'],
});

import { createNodeConfig } from '@tmt/jest-config/node';

/** Unit tests: `src/**\/*.spec.ts` next to the code, no database (dependencies are mocked). */
export default createNodeConfig({
  rootDir: import.meta.dirname,
  displayName: 'api:unit',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  setupFiles: ['<rootDir>/test/setup/env.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.spec.ts',
    '!src/**/*.module.ts',
    '!src/main.ts',
    '!src/scripts/**',
  ],
});

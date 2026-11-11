import { createNodeConfig } from '@tmt/jest-config/node';

export default createNodeConfig({
  rootDir: import.meta.dirname,
  displayName: 'excel',
  testMatch: ['<rootDir>/test/**/*.test.ts'],
  testTimeout: 30_000,
});

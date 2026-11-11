import { createNodeConfig } from '@tmt/jest-config/node';

export default createNodeConfig({
  rootDir: import.meta.dirname,
  displayName: 'shared',
  testMatch: ['<rootDir>/test/**/*.test.ts'],
});

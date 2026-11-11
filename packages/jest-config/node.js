/**
 * Jest preset for the Node.js workspaces (apps/api, packages/*).
 *
 * The sources are native ES modules (NestJS 12 and Prisma 7 are ESM-only), so Jest runs in ESM mode:
 * the test script starts Node with `--experimental-vm-modules`, `.ts` files are treated as ESM and
 * compiled by SWC (decorators + decorator metadata for NestJS dependency injection).
 *
 * In test files import the Jest API explicitly: `import { describe, expect, it, jest } from '@jest/globals'`.
 */

/** SWC options shared by every Node workspace. */
export const swcOptions = {
  jsc: {
    parser: { syntax: 'typescript', decorators: true },
    transform: { legacyDecorator: true, decoratorMetadata: true, useDefineForClassFields: false },
    target: 'es2023',
    keepClassNames: true,
  },
  module: { type: 'es6' },
  sourceMaps: 'inline',
};

/**
 * @param {object} options
 * @param {string} options.rootDir           workspace directory (pass `import.meta.dirname`)
 * @param {string} options.displayName       label in the Jest output
 * @param {string[]} [options.testMatch]     globs relative to rootDir
 * @param {string[]} [options.setupFiles]    run before each test file (environment variables …)
 * @param {string} [options.globalSetup]     run once before all test files
 * @param {string} [options.globalTeardown]  run once after all test files
 * @param {string[]} [options.collectCoverageFrom]
 * @param {import('jest').Config['coverageThreshold']} [options.coverageThreshold]
 * @param {number} [options.testTimeout]
 * @param {boolean} [options.serial]         run files one at a time (shared database)
 * @returns {import('jest').Config}
 */
export function createNodeConfig({
  rootDir,
  displayName,
  testMatch = ['<rootDir>/src/**/*.spec.ts', '<rootDir>/test/**/*.spec.ts'],
  setupFiles = [],
  globalSetup,
  globalTeardown,
  collectCoverageFrom = [
    'src/**/*.ts',
    '!src/**/*.spec.ts',
    '!src/**/index.ts',
    '!src/generated/**',
  ],
  coverageThreshold,
  testTimeout = 15_000,
  serial = false,
}) {
  return {
    rootDir,
    displayName,
    testEnvironment: 'node',
    testMatch,
    setupFiles,
    ...(globalSetup && { globalSetup }),
    ...(globalTeardown && { globalTeardown }),
    extensionsToTreatAsEsm: ['.ts'],
    moduleFileExtensions: ['ts', 'js', 'mjs', 'json'],
    // Sources import siblings as `./x.js` (NodeNext); resolve those to the `.ts` files.
    moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
    transform: { '^.+\\.ts$': ['@swc/jest', swcOptions] },
    testPathIgnorePatterns: ['/node_modules/', '/dist/'],
    collectCoverageFrom,
    coverageDirectory: '<rootDir>/coverage',
    coverageReporters: ['text-summary', 'lcov', 'json-summary'],
    ...(coverageThreshold && { coverageThreshold }),
    testTimeout,
    ...(serial && { maxWorkers: 1 }),
    clearMocks: true,
    restoreMocks: true,
  };
}

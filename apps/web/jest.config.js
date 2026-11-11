import nextJest from 'next/jest.js';

/**
 * Unit tests of the web app: Jest via `next/jest` (SWC, CSS/asset stubs, `.env` loading) in jsdom
 * with React Testing Library. Test files live next to the code as `*.test.ts(x)`.
 */
const createJestConfig = nextJest({ dir: import.meta.dirname });

/** @type {import('jest').Config} */
const config = {
  displayName: 'web',
  testEnvironment: '<rootDir>/jest.environment.js',
  testMatch: ['<rootDir>/src/**/*.test.{ts,tsx}'],
  modulePathIgnorePatterns: ['<rootDir>/.next/'],
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts'],
  moduleNameMapper: {
    // The shared contract is an ESM-only package; tests compile its sources instead.
    '^@tmt/shared$': '<rootDir>/../../packages/shared/src/index.ts',
    // App Router hooks are replaced by a controllable test double (see src/test/mocks).
    '^next/navigation$': '<rootDir>/src/test/mocks/next-navigation.ts',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.test.{ts,tsx}',
    '!src/test/**',
    '!src/app/**',
    '!src/components/ui/**',
    '!src/**/index.ts',
  ],
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: ['text-summary', 'lcov', 'json-summary'],
  clearMocks: true,
  restoreMocks: true,
};

export default createJestConfig(config);

/** Defaults for integration tests (override TEST_DATABASE_URL to use another database). */
process.env.NODE_ENV = 'test';
process.env.TEST_DATABASE_URL ??= 'postgresql://postgres@localhost:5432/tmt_next_test';

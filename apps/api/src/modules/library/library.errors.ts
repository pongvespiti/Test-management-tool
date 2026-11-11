/** Error factories and constraint names of the library shared with other modules (imports). */
import { conflict } from '../../common/errors/app.exception.js';

/** Unique index of suite prefixes per project. */
export const SUITE_PREFIX_UNIQUE = 'suites_project_id_prefix_key';

/** Partial unique index: case codes are unique per suite among live cases. */
export const CASE_CODE_UNIQUE = 'test_cases_suite_code_live_key';

export function suitePrefixTaken(prefix: string) {
  return conflict('SUITE_PREFIX_TAKEN', `Prefix ${prefix} is already used in this project`);
}

export function caseCodeTaken(code: string | null | undefined) {
  return conflict('CASE_CODE_TAKEN', `Case code ${code ?? ''} is already used in this suite`);
}

/**
 * Options of interactive transactions that may touch many cases (bulk actions, inlining a shared
 * step, imports): Prisma's default 5 s timeout is too short for 1000 cases on a slow disk.
 */
export const LONG_TX = { maxWait: 10_000, timeout: 120_000 } as const;

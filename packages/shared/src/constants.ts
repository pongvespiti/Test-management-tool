/** Protocol constants shared by the API and the web app (single source, never duplicated). */

/** Base path of the REST API. */
export const API_PREFIX = '/api/v1';

/**
 * CSRF defence (ADR-004): cookie-authenticated unsafe requests must carry this header/value.
 * Browsers cannot add custom headers to cross-site requests without a CORS preflight.
 */
export const CSRF_HEADER = 'x-requested-with';
export const CSRF_HEADER_VALUE = 'tmt';

/** Personal API tokens start with this prefix (`Authorization: Bearer tmt_…`). */
export const API_TOKEN_PREFIX = 'tmt_';

/** Default page size of paged lists (`?page&pageSize`). */
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 500;

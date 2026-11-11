import { z } from 'zod';

/**
 * Route id parameter (`:projectId`, `:caseId` …): a positive 32-bit integer. Anything else is a
 * 404 — ids that cannot exist are "not found", not "bad request".
 */
export const routeIdSchema = z.coerce.number().int().positive().max(2_147_483_647);

/** `@Param('caseId', ID)` — shorthand for the id parameter options. */
export const ID = { schema: routeIdSchema } as const;

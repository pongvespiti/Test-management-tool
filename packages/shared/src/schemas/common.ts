import { z } from 'zod';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../constants';

/** Positive integer id from a path param or JSON body. */
export const idSchema = z.coerce.number().int().positive();

/** Optional free text; empty strings become null so "cleared" fields are stored as NULL. */
export const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .transform((v) => (v.trim() === '' ? null : v))
    .nullable()
    .optional();

/** Required single-line text, trimmed. */
export const requiredLine = (max: number) => z.string().trim().min(1).max(max);

/** Optional single-line text, trimmed; empty → null. */
export const optionalLine = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();

/** Calendar date as `YYYY-MM-DD`; empty → null. */
export const optionalDate = z
  .union([z.iso.date(), z.literal('')])
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .optional();

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});
export type PaginationInput = z.infer<typeof paginationSchema>;

/** Query-string boolean: "true"/"1" → true, "false"/"0" → false. */
export const queryBool = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((v) => v === true || v === 'true' || v === '1');

/** Comma separated list in a query string (`?status=new,open`). */
export const csvList = <T extends z.ZodType<unknown, string>>(item: T) =>
  z
    .string()
    .transform((s) =>
      s
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
    )
    .pipe(z.array(item));

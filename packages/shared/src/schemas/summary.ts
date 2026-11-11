import { z } from 'zod';
import { requiredLine } from './common';
import { reportScopeSchema } from './execution';

/** Built-in dimensions next to the environment labels (they start with "@" so no label clashes). */
export const SUMMARY_TOPIC = '@topic';
export const SUMMARY_RELEASE = '@release';
export const SUMMARY_BUILD = '@build';
export const SUMMARY_BUILTIN_KEYS = [SUMMARY_TOPIC, SUMMARY_RELEASE, SUMMARY_BUILD] as const;

const keySchema = z.string().trim().min(1).max(100);

/** What a summary view shows: one dimension down the rows, one across, and the values kept. */
export const summaryViewConfigSchema = z.object({
  rows: keySchema.nullable().default(null),
  cols: keySchema.nullable().default(null),
  /** Dimension key → the values kept (any of them). An empty text is "not set". */
  filters: z.record(keySchema, z.array(z.string().max(200)).max(100)).default({}),
});
export type SummaryViewConfig = z.infer<typeof summaryViewConfigSchema>;

const listOfText = z
  .union([z.string(), z.array(z.string())])
  .transform((v) => (Array.isArray(v) ? v : [v]))
  .pipe(z.array(z.string().max(400)).max(200));

/** `rows` / `cols` pick the dimensions, each `f` is `key=value` (several = any of those values). */
export const reportSummaryQuerySchema = reportScopeSchema.extend({
  rows: keySchema.optional(),
  cols: keySchema.optional(),
  f: listOfText.default([]),
});
export type ReportSummaryQuery = z.infer<typeof reportSummaryQuerySchema>;

export const savedViewInputSchema = z.object({
  name: requiredLine(80),
  shared: z.boolean().default(false),
  config: summaryViewConfigSchema,
});
export type SavedViewInput = z.infer<typeof savedViewInputSchema>;

/** One side of a comparison: a single run (`run:12`) or the latest results of a build (`build:3`). */
export const compareSideSchema = z
  .string()
  .regex(/^(run|build):[1-9]\d{0,9}$/, 'Use run:<id> or build:<id>');

export const reportCompareQuerySchema = z.object({
  base: compareSideSchema,
  target: compareSideSchema,
});
export type ReportCompareQuery = z.infer<typeof reportCompareQuerySchema>;

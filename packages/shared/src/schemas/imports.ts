import { z } from 'zod';
import { IMPORT_TARGETS } from '../enums';
import { fieldKeySchema, suitePrefixSchema } from './library';
import { idSchema, requiredLine } from './common';

export const importAnalyzeSchema = z.object({
  uploadId: z.uuid(),
  /** Sheet name; omitted → engine picks the most likely case sheet. */
  sheet: z.string().max(200).optional(),
  /** 1-based header row; omitted → auto-detect. */
  headerRow: z.number().int().min(1).max(100000).optional(),
});
export type ImportAnalyzeInput = z.infer<typeof importAnalyzeSchema>;

export const columnMappingSchema = z.object({
  /** 1-based column index in the sheet. */
  col: z.number().int().min(1).max(16384),
  target: z.enum(IMPORT_TARGETS),
  /** For target `custom`: key of an existing suite field. */
  customKey: fieldKeySchema.optional(),
  /** For target `new_custom`: label of the field to create (defaults to the header text). */
  newFieldLabel: z.string().trim().max(100).optional(),
});
export type ColumnMapping = z.infer<typeof columnMappingSchema>;

export const importOptionsSchema = z.object({
  onDuplicateInFile: z.enum(['renumber', 'keep_first']).default('renumber'),
  onExisting: z.enum(['update', 'skip', 'create_new']).default('update'),
  saveEnvTemplate: z.boolean().default(true),
  /** Put every imported case under this existing section (optional). */
  parentSectionId: idSchema.nullable().optional(),
});
export type ImportOptions = z.infer<typeof importOptionsSchema>;

export const importRunSchema = z
  .object({
    uploadId: z.uuid(),
    sheet: z.string().max(200),
    headerRow: z.number().int().min(1).max(100000),
    columns: z.array(columnMappingSchema).min(1).max(200),
    options: importOptionsSchema.default({
      onDuplicateInFile: 'renumber',
      onExisting: 'update',
      saveEnvTemplate: true,
    }),
    suiteId: idSchema.optional(),
    newSuite: z.object({ name: requiredLine(200), prefix: suitePrefixSchema }).optional(),
  })
  .refine((v) => Boolean(v.suiteId) !== Boolean(v.newSuite), {
    message: 'Choose an existing suite or create a new one',
    path: ['suiteId'],
  })
  .refine((v) => v.columns.some((c) => c.target === 'title' || c.target === 'code'), {
    message: 'Map at least one column to Title or Case code',
    path: ['columns'],
  });
export type ImportRunInput = z.infer<typeof importRunSchema>;

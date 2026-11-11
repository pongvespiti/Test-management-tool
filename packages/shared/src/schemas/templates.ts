import { z } from 'zod';
import { idSchema, optionalLine, optionalText, queryBool, requiredLine } from './common';

/** Multipart text fields sent with a template upload. */
export const templateFieldsSchema = z.object({
  name: requiredLine(200),
  description: optionalText(2000),
  suiteId: z
    .union([idSchema, z.literal('')])
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional(),
  /** Sheet cloned once per run (renamed to the run code). Empty → no per-run sheet. */
  runSheet: optionalLine(100),
  isDefault: queryBool.default(false),
});
export type TemplateFieldsInput = z.infer<typeof templateFieldsSchema>;

export const updateTemplateSchema = z.object({
  name: requiredLine(200).optional(),
  description: optionalText(2000),
  suiteId: idSchema.nullable().optional(),
  runSheet: optionalLine(100),
  isDefault: z.boolean().optional(),
});
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;

export const exportQuerySchema = z.object({
  /** 0 or omitted = plan's template, else project default, else built-in. */
  templateId: z.coerce.number().int().min(0).optional(),
});

export const lookupUsersQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
});

export const attachmentFieldsSchema = z.object({
  entityType: z.enum(['run_case', 'defect', 'test_case', 'plan', 'comment']),
  entityId: idSchema,
});
export type AttachmentFieldsInput = z.infer<typeof attachmentFieldsSchema>;

export const listAttachmentsQuerySchema = attachmentFieldsSchema;

export const activityQuerySchema = z.object({
  entityType: z.string().max(40).optional(),
  entityId: idSchema.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

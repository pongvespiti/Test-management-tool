import { z } from 'zod';
import {
  CASE_PRIORITIES,
  CASE_STATUSES,
  CASE_TEMPLATES,
  CASE_TYPES,
  FIELD_TYPES,
  REVIEW_DECISIONS,
} from '../enums';
import {
  csvList,
  idSchema,
  optionalLine,
  optionalText,
  paginationSchema,
  queryBool,
  requiredLine,
} from './common';

export const fieldKeySchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]{0,39}$/, 'lower-case letters, digits and _, starting with a letter');

export const fieldDefSchema = z.object({
  key: fieldKeySchema,
  label: requiredLine(100),
  type: z.enum(FIELD_TYPES).default('text'),
  options: z.array(requiredLine(100)).max(100).optional(),
  showInTable: z.boolean().default(false),
});
export type FieldDefInput = z.infer<typeof fieldDefSchema>;

export const suitePrefixSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z][A-Z0-9]{0,9}$/, '1–10 letters/digits, starting with a letter');

const fieldDefsSchema = z
  .array(fieldDefSchema)
  .max(40)
  .refine((defs) => new Set(defs.map((d) => d.key)).size === defs.length, {
    message: 'Field keys must be unique',
  });

const envTemplateSchema = z
  .array(requiredLine(100))
  .max(80)
  .refine((labels) => new Set(labels.map((l) => l.toLowerCase())).size === labels.length, {
    message: 'Environment labels must be unique',
  });

export const createSuiteSchema = z.object({
  name: requiredLine(200),
  prefix: suitePrefixSchema,
  description: optionalText(4000),
  fieldDefs: fieldDefsSchema.default([]),
  envTemplate: envTemplateSchema.default([]),
});
export type CreateSuiteInput = z.infer<typeof createSuiteSchema>;

export const updateSuiteSchema = z.object({
  name: requiredLine(200).optional(),
  prefix: suitePrefixSchema.optional(),
  description: optionalText(4000),
  fieldDefs: fieldDefsSchema.optional(),
  envTemplate: envTemplateSchema.optional(),
  isArchived: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});
export type UpdateSuiteInput = z.infer<typeof updateSuiteSchema>;

export const createSectionSchema = z.object({
  name: requiredLine(300),
  code: optionalLine(100),
  parentId: idSchema.nullable().optional(),
});
export type CreateSectionInput = z.infer<typeof createSectionSchema>;

export const updateSectionSchema = z.object({
  name: requiredLine(300).optional(),
  code: optionalLine(100),
  parentId: idSchema.nullable().optional(),
  sortOrder: z.number().int().optional(),
});
export type UpdateSectionInput = z.infer<typeof updateSectionSchema>;

export const deleteSectionSchema = z.object({
  /** When the section is not empty: move its cases and child sections to the parent. */
  moveContentToParent: queryBool.default(false),
});

/** One tag: trimmed, 1–50 chars. Tags are case-insensitive unique per case (dedupe keeps the first). */
export const tagSchema = z.string().trim().min(1).max(50);
export const tagsSchema = z
  .array(tagSchema)
  .max(30)
  .transform((tags) => {
    const seen = new Set<string>();
    return tags.filter((t) =>
      seen.has(t.toLowerCase()) ? false : (seen.add(t.toLowerCase()), true),
    );
  });

/** Plain step of a step-by-step case. */
export const plainStepSchema = z.object({
  action: z.string().max(10000),
  expected: z.string().max(10000).default(''),
});
export type PlainStep = z.infer<typeof plainStepSchema>;

/** A case step is either written inline or references a shared step set (expanded at run time). */
export const caseStepSchema = z.discriminatedUnion('kind', [
  plainStepSchema.extend({ kind: z.literal('step') }),
  z.object({ kind: z.literal('shared'), sharedStepId: idSchema }),
]);
export type CaseStepInput = z.infer<typeof caseStepSchema>;

const caseFields = {
  sectionId: idSchema.nullable().optional(),
  code: optionalLine(100),
  title: requiredLine(500),
  caseType: z.enum(CASE_TYPES).default('Normal'),
  status: z.enum(CASE_STATUSES).default('ready'),
  priority: z.enum(CASE_PRIORITIES).default('medium'),
  tags: tagsSchema.default([]),
  estimateMinutes: z.number().int().min(0).max(100000).nullable().optional(),
  /** Requirement ids / Jira keys / spec references, free text. */
  references: optionalLine(500),
  template: z.enum(CASE_TEMPLATES).default('text'),
  precondition: optionalText(20000),
  procedure: optionalText(20000),
  expected: optionalText(20000),
  steps: z.array(caseStepSchema).max(200).default([]),
  remark: optionalText(20000),
  summaryGroup: optionalLine(200),
  custom: z.record(z.string(), z.string().max(20000)).default({}),
};

export const createCaseSchema = z.object(caseFields);
export type CreateCaseInput = z.infer<typeof createCaseSchema>;

export const updateCaseSchema = z.object({
  sectionId: caseFields.sectionId,
  code: caseFields.code,
  title: requiredLine(500).optional(),
  caseType: z.enum(CASE_TYPES).optional(),
  status: z.enum(CASE_STATUSES).optional(),
  priority: z.enum(CASE_PRIORITIES).optional(),
  tags: tagsSchema.optional(),
  estimateMinutes: caseFields.estimateMinutes,
  references: caseFields.references,
  template: z.enum(CASE_TEMPLATES).optional(),
  precondition: caseFields.precondition,
  procedure: caseFields.procedure,
  expected: caseFields.expected,
  steps: z.array(caseStepSchema).max(200).optional(),
  remark: caseFields.remark,
  summaryGroup: caseFields.summaryGroup,
  custom: z.record(z.string(), z.string().max(20000)).optional(),
  /** Optimistic concurrency: the version the client edited. */
  version: z.number().int().positive().optional(),
});
export type UpdateCaseInput = z.infer<typeof updateCaseSchema>;

export const listCasesQuerySchema = paginationSchema.extend({
  sectionId: idSchema.optional(),
  includeSubsections: queryBool.default(true),
  q: z.string().trim().max(200).optional(),
  caseType: z.enum(CASE_TYPES).optional(),
  status: z.enum(CASE_STATUSES).optional(),
  priority: csvList(z.enum(CASE_PRIORITIES)).optional(),
  tag: z.string().trim().max(50).optional(),
  /** Only cases that are not in any section. */
  unsectioned: queryBool.optional(),
});
export type ListCasesQuery = z.infer<typeof listCasesQuerySchema>;

/** Shortest text the project-wide case search accepts. */
export const CASE_SEARCH_MIN_LENGTH = 2;

/** Project-wide case search (header search box): free text over every suite. */
export const searchCasesQuerySchema = z.object({
  q: z.string().trim().min(CASE_SEARCH_MIN_LENGTH).max(200),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
export type SearchCasesQuery = z.infer<typeof searchCasesQuerySchema>;

export const bulkCasesSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('move'),
    ids: z.array(idSchema).min(1).max(1000),
    sectionId: idSchema.nullable(),
  }),
  z.object({
    action: z.literal('setStatus'),
    ids: z.array(idSchema).min(1).max(1000),
    status: z.enum(CASE_STATUSES),
  }),
  z.object({
    action: z.literal('setType'),
    ids: z.array(idSchema).min(1).max(1000),
    caseType: z.enum(CASE_TYPES),
  }),
  z.object({
    action: z.literal('setPriority'),
    ids: z.array(idSchema).min(1).max(1000),
    priority: z.enum(CASE_PRIORITIES),
  }),
  z.object({
    action: z.literal('addTags'),
    ids: z.array(idSchema).min(1).max(1000),
    tags: tagsSchema,
  }),
  z.object({
    action: z.literal('removeTags'),
    ids: z.array(idSchema).min(1).max(1000),
    tags: tagsSchema,
  }),
  /** Send cases (draft or ready) to review. */
  z.object({
    action: z.literal('submitReview'),
    ids: z.array(idSchema).min(1).max(1000),
    reviewerId: idSchema.nullable().optional(),
  }),
  /** Lead: approve cases that are in review → ready. */
  z.object({ action: z.literal('approve'), ids: z.array(idSchema).min(1).max(1000) }),
  z.object({ action: z.literal('delete'), ids: z.array(idSchema).min(1).max(1000) }),
]);
export type BulkCasesInput = z.infer<typeof bulkCasesSchema>;

// ---------------------------------------------------------------- review workflow

export const submitReviewSchema = z.object({
  /** Who should review; null/omitted = any lead. */
  reviewerId: idSchema.nullable().optional(),
  note: optionalText(5000),
});
export type SubmitReviewInput = z.infer<typeof submitReviewSchema>;

export const reviewDecisionSchema = z.object({
  decision: z.enum(REVIEW_DECISIONS),
  note: optionalText(5000),
});
export type ReviewDecisionInput = z.infer<typeof reviewDecisionSchema>;

export const listReviewsQuerySchema = z.object({
  /** Only cases waiting for me (reviewer = me or unassigned). */
  mine: queryBool.default(false),
});

// ---------------------------------------------------------------- shared steps

export const createSharedStepSchema = z.object({
  name: requiredLine(200),
  description: optionalText(4000),
  steps: z.array(plainStepSchema).min(1).max(100),
});
export type CreateSharedStepInput = z.infer<typeof createSharedStepSchema>;

export const updateSharedStepSchema = z.object({
  name: requiredLine(200).optional(),
  description: optionalText(4000),
  steps: z.array(plainStepSchema).min(1).max(100).optional(),
  version: z.number().int().positive().optional(),
});
export type UpdateSharedStepInput = z.infer<typeof updateSharedStepSchema>;

import { z } from 'zod';
import { REQUIREMENT_SOURCES } from '../enums';
import { normalizeReference } from '../logic/references';
import { idSchema, optionalLine, optionalText, requiredLine } from './common';

/** A requirement key is written like a case reference, so `REQ_1` and `req 1` are one key. */
export const requirementKeySchema = requiredLine(100).transform((v) => normalizeReference(v));

export const createRequirementSchema = z.object({
  /** `REQ-12`, a Jira key, a section number … — the text cases cite in their references. */
  key: requirementKeySchema,
  title: requiredLine(500),
  description: optionalText(8000),
  /** Where the full text lives when it is not here: spec section, PDF page, meeting minutes. */
  sourceRef: optionalLine(500),
});
export type CreateRequirementInput = z.infer<typeof createRequirementSchema>;

export const updateRequirementSchema = createRequirementSchema.partial();
export type UpdateRequirementInput = z.infer<typeof updateRequirementSchema>;

export const listRequirementsQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  source: z.enum(REQUIREMENT_SOURCES).optional(),
});
export type ListRequirementsQuery = z.infer<typeof listRequirementsQuerySchema>;

/** Replaces the cases linked to a requirement. */
export const setRequirementCasesSchema = z.object({
  caseIds: z.array(idSchema).max(1000),
});
export type SetRequirementCasesInput = z.infer<typeof setRequirementCasesSchema>;

// ------------------------------------------------------------------ Excel / CSV import

/** What a column of the sheet holds. */
export const REQUIREMENT_FIELDS = ['key', 'title', 'description', 'sourceRef'] as const;
export type RequirementField = (typeof REQUIREMENT_FIELDS)[number];

export const REQUIREMENT_FIELD_LABELS: Record<RequirementField, string> = {
  key: 'Requirement ID',
  title: 'Title',
  description: 'Description',
  sourceRef: 'Source / document',
};

const columnSchema = z.number().int().min(1).max(16384);

export const requirementImportSchema = z.object({
  uploadId: z.uuid(),
  sheet: z.string().max(200),
  headerRow: z.number().int().min(1).max(100000),
  /** 1-based sheet column of each field; key and title are required. */
  mapping: z.object({
    key: columnSchema,
    title: columnSchema,
    description: columnSchema.nullable().optional(),
    sourceRef: columnSchema.nullable().optional(),
  }),
  /** A key that already exists: overwrite its text or leave it. */
  onExisting: z.enum(['update', 'skip']).default('update'),
});
export type RequirementImportInput = z.infer<typeof requirementImportSchema>;

// ------------------------------------------------------------------ Jira (read only)

/** Jira issue keys: project key, dash, number. */
export const JIRA_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_]*-\d+$/;
export const JIRA_IMPORT_MAX_KEYS = 100;

export const jiraRequirementImportSchema = z
  .object({
    /** Issue keys, one per entry (comma/space separated text is split by the form). */
    keys: z
      .array(z.string().trim().regex(JIRA_KEY_PATTERN, 'Use issue keys like IOT-345'))
      .min(1)
      .max(JIRA_IMPORT_MAX_KEYS)
      .optional(),
    /** A JQL search; the issues it finds are imported (at most 200). */
    jql: z.string().trim().min(1).max(1000).optional(),
  })
  .refine((v) => Boolean(v.keys) !== Boolean(v.jql), {
    message: 'Give issue keys or a JQL search, not both',
    path: ['keys'],
  });
export type JiraRequirementImportInput = z.infer<typeof jiraRequirementImportSchema>;

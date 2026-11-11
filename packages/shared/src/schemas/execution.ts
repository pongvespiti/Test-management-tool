import { z } from 'zod';
import {
  CASE_PRIORITIES,
  COMMENT_ENTITY_TYPES,
  DEFECT_PRIORITIES,
  DEFECT_SEVERITIES,
  DEFECT_STATUSES,
  EXECUTED_STATUSES,
  JUDGEMENTS,
  JUNIT_MATCH_MODES,
  JUNIT_SKIPPED_AS,
  MATRIX_GROUP_BY,
  RERUN_STATUSES,
  RESULT_STATUSES,
} from '../enums';
import {
  csvList,
  idSchema,
  optionalDate,
  optionalLine,
  optionalText,
  paginationSchema,
  queryBool,
  requiredLine,
} from './common';
import { tagSchema } from './library';

export const envEntrySchema = z.object({
  label: requiredLine(100),
  value: z.string().max(500).default(''),
});
export type EnvEntry = z.infer<typeof envEntrySchema>;

export const createPlanSchema = z.object({
  releaseId: idSchema.nullable().optional(),
  docNo: requiredLine(60),
  title: requiredLine(300),
  purpose: optionalText(8000),
  testMethod: optionalText(8000),
  judgementCriteria: optionalText(8000),
  rawDataPath: optionalText(1000),
  templateId: idSchema.nullable().optional(),
});
export type CreatePlanInput = z.infer<typeof createPlanSchema>;

export const updatePlanSchema = createPlanSchema.partial().extend({
  overallJudgement: z.enum(JUDGEMENTS).nullable().optional(),
  judgementNote: optionalText(8000),
});
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;

export const listPlansQuerySchema = z.object({
  releaseId: idSchema.optional(),
});

export const runCodeSchema = requiredLine(60);

/**
 * Which library cases go into a run. All given filters are ANDed; omitted filters do not restrict.
 * Deprecated and deleted cases are never added.
 */
export const runCaseFilterFields = {
  /** Restrict to these sections (and their sub-sections). */
  sectionIds: z.array(idSchema).max(2000).optional(),
  /** Explicit case selection (cases must belong to the suite → 422 BAD_CASE). */
  caseIds: z.array(idSchema).max(5000).optional(),
  /** Only cases with one of these priorities. */
  priorities: z.array(z.enum(CASE_PRIORITIES)).max(4).optional(),
  /** Only cases having at least one of these tags (case-insensitive). */
  tags: z.array(tagSchema).max(30).optional(),
  /** Only cases with these review statuses (default: ready). */
  caseStatuses: z
    .array(z.enum(['draft', 'in_review', 'ready']))
    .min(1)
    .default(['ready']),
};

export const createRunSchema = z.object({
  suiteId: idSchema,
  code: runCodeSchema,
  scenario: optionalLine(300),
  environment: z.array(envEntrySchema).max(80).default([]),
  testerId: idSchema.nullable().optional(),
  /** Build under test; must belong to the plan's release (422 BAD_BUILD). */
  buildId: idSchema.nullable().optional(),
  testedDate: optionalDate,
  ...runCaseFilterFields,
});
export type CreateRunInput = z.infer<typeof createRunSchema>;

/** Add more library cases (snapshots) to an existing run; cases already in the run are skipped. */
export const addRunCasesSchema = z.object(runCaseFilterFields);
export type AddRunCasesInput = z.infer<typeof addRunCasesSchema>;

/** Remove run cases. Testers may remove untested ones; removing executed ones needs lead. */
export const removeRunCasesSchema = z.object({
  runCaseIds: z.array(idSchema).min(1).max(2000),
});
export type RemoveRunCasesInput = z.infer<typeof removeRunCasesSchema>;

/** New run in the same plan with the cases of a source run whose current result is in `statuses`. */
export const rerunSchema = z.object({
  code: runCodeSchema,
  scenario: optionalLine(300),
  statuses: z.array(z.enum(RERUN_STATUSES)).min(1).default(['ng', 'blocked']),
  /** Only these run cases of the source run (that also match `statuses`); omitted = all matching. */
  runCaseIds: z.array(idSchema).min(1).max(2000).optional(),
  /** Copy the source run's environment (ignored when `environment` is given). */
  copyEnvironment: z.boolean().default(true),
  environment: z.array(envEntrySchema).max(80).optional(),
  testerId: idSchema.nullable().optional(),
  /** Build of the new run; omitted = the source run's build. */
  buildId: idSchema.nullable().optional(),
  /** Keep each run case's assignee from the source run. */
  keepAssignees: z.boolean().default(true),
  /**
   * false (default): reuse the source run's case snapshot (same steps the failure was found with).
   * true: take a fresh snapshot from the current library version (falls back to the old snapshot
   * when the library case was deleted).
   */
  refreshFromLibrary: z.boolean().default(false),
});
export type RerunInput = z.infer<typeof rerunSchema>;

/** Assign run cases to a project member (tester or lead); null = unassign (falls back to the run tester). */
export const assignRunCasesSchema = z.object({
  runCaseIds: z.array(idSchema).min(1).max(2000),
  assigneeId: idSchema.nullable(),
});
export type AssignRunCasesInput = z.infer<typeof assignRunCasesSchema>;

export const updateRunSchema = z.object({
  code: runCodeSchema.optional(),
  scenario: optionalLine(300),
  environment: z.array(envEntrySchema).max(80).optional(),
  testerId: idSchema.nullable().optional(),
  buildId: idSchema.nullable().optional(),
  testedDate: optionalDate,
  judgement: z.enum(JUDGEMENTS).nullable().optional(),
  judgementNote: optionalText(8000),
  remark: optionalText(8000),
  sortOrder: z.number().int().optional(),
});
export type UpdateRunInput = z.infer<typeof updateRunSchema>;

export const duplicateRunSchema = z.object({
  code: runCodeSchema,
  scenario: optionalLine(300),
  environment: z.array(envEntrySchema).max(80).optional(),
  testerId: idSchema.nullable().optional(),
  /** Omitted = the source run's build. */
  buildId: idSchema.nullable().optional(),
});
export type DuplicateRunInput = z.infer<typeof duplicateRunSchema>;

/** Result of one step of a step-by-step run case (index-aligned with `RunCaseDTO.steps`). */
export const stepResultSchema = z.object({
  status: z.enum(RESULT_STATUSES),
  actual: z.string().max(10000).default(''),
});
export type StepResultInput = z.infer<typeof stepResultSchema>;

export const setResultSchema = z.object({
  status: z.enum(RESULT_STATUSES),
  actualResult: optionalText(20000),
  remark: optionalText(20000),
  elapsedSec: z.number().int().min(0).max(864000).nullable().optional(),
  /**
   * Step results; length must equal the run case's step count (422 STEP_COUNT_MISMATCH).
   * Omitted = keep the current step results; null = clear them.
   */
  stepResults: z.array(stepResultSchema).max(300).nullable().optional(),
});
export type SetResultInput = z.infer<typeof setResultSchema>;

export const bulkResultSchema = z.object({
  runCaseIds: z.array(idSchema).min(1).max(2000),
  status: z.enum(EXECUTED_STATUSES),
});
export type BulkResultInput = z.infer<typeof bulkResultSchema>;

export const matrixQuerySchema = z.object({
  groupBy: z.enum(MATRIX_GROUP_BY).default('summary'),
});

/** Editable defect fields (no defaults, so they can be reused for PATCH). */
const defectFields = {
  title: requiredLine(300),
  description: optionalText(20000),
  steps: optionalText(20000),
  expected: optionalText(20000),
  actual: optionalText(20000),
  severity: z.enum(DEFECT_SEVERITIES),
  priority: z.enum(DEFECT_PRIORITIES),
  assigneeId: idSchema.nullable().optional(),
  releaseId: idSchema.nullable().optional(),
  foundIn: optionalLine(300),
  fixedIn: optionalLine(300),
  foundInBuildId: idSchema.nullable().optional(),
  fixedInBuildId: idSchema.nullable().optional(),
  environment: optionalText(2000),
  externalKey: optionalLine(100),
};

export const createDefectSchema = z.object({
  ...defectFields,
  severity: defectFields.severity.default('major'),
  priority: defectFields.priority.default('medium'),
  /** Link the new defect to this run case (NG result). */
  runCaseId: idSchema.optional(),
});
export type CreateDefectInput = z.infer<typeof createDefectSchema>;

/** No defaults here: a PATCH must never reset fields it does not mention. */
export const updateDefectSchema = z.object(defectFields).partial();
export type UpdateDefectInput = z.infer<typeof updateDefectSchema>;

export const transitionDefectSchema = z.object({
  to: z.enum(DEFECT_STATUSES),
  comment: optionalText(5000),
});
export type TransitionDefectInput = z.infer<typeof transitionDefectSchema>;

export const listDefectsQuerySchema = paginationSchema.extend({
  status: csvList(z.enum(DEFECT_STATUSES)).optional(),
  severity: csvList(z.enum(DEFECT_SEVERITIES)).optional(),
  releaseId: idSchema.optional(),
  /** Defects found in or fixed in this build. */
  buildId: idSchema.optional(),
  planId: idSchema.optional(),
  runId: idSchema.optional(),
  assigneeId: idSchema.optional(),
  q: z.string().trim().max(200).optional(),
});
export type ListDefectsQuery = z.infer<typeof listDefectsQuerySchema>;

export const linkDefectSchema = z.object({ runCaseId: idSchema });

export const createCommentSchema = z.object({
  entityType: z.enum(COMMENT_ENTITY_TYPES),
  entityId: idSchema,
  body: requiredLine(5000),
});
export type CreateCommentInput = z.infer<typeof createCommentSchema>;

export const listCommentsQuerySchema = z.object({
  entityType: z.enum(COMMENT_ENTITY_TYPES),
  entityId: idSchema,
});

export const dashboardQuerySchema = z.object({
  releaseId: idSchema.optional(),
});

/** "My work": the day or the Monday-to-Sunday week that contains `date` (default: today). */
export const MY_WORK_RANGES = ['day', 'week'] as const;
export type MyWorkRange = (typeof MY_WORK_RANGES)[number];
export const myWorkQuerySchema = z.object({
  range: z.enum(MY_WORK_RANGES).default('day'),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date as YYYY-MM-DD')
    .optional(),
});
export type MyWorkQuery = z.infer<typeof myWorkQuerySchema>;

// ---------------------------------------------------------------- automation (JUnit XML)

/** Query string of `POST …/runs/:runId/junit` (multipart field `file`). */
export const junitImportQuerySchema = z.object({
  matchBy: z.enum(JUNIT_MATCH_MODES).default('auto'),
  /** true = only report what would change. */
  dryRun: queryBool.default(false),
  /** Create library cases (and run cases) for tests that match nothing. */
  createMissing: queryBool.default(false),
  skippedAs: z.enum(JUNIT_SKIPPED_AS).default('nt'),
});
export type JunitImportQuery = z.infer<typeof junitImportQuerySchema>;

// ---------------------------------------------------------------- reports

/** Scope shared by the report endpoints. `planId` wins over `releaseId`; none = whole project. */
export const reportScopeSchema = z.object({
  releaseId: idSchema.optional(),
  planId: idSchema.optional(),
});

export const reportTrendQuerySchema = reportScopeSchema.extend({
  days: z.coerce.number().int().min(1).max(365).default(30),
});
export type ReportTrendQuery = z.infer<typeof reportTrendQuerySchema>;

export const reportDefectsQuerySchema = z.object({
  releaseId: idSchema.optional(),
  days: z.coerce.number().int().min(1).max(365).default(30),
});
export type ReportDefectsQuery = z.infer<typeof reportDefectsQuerySchema>;

export const reportCoverageQuerySchema = z.object({
  releaseId: idSchema.optional(),
});

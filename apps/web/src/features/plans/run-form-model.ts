/**
 * Values, request bodies and validation of the run dialogs (new run, edit, duplicate, re-run). The
 * form values hold editable environment rows and select strings, so they differ from the bodies.
 */
import {
  createRunSchema,
  duplicateRunSchema,
  rerunSchema,
  updateRunSchema,
  type CasePriority,
  type Judgement,
  type RerunStatus,
  type RunDTO,
  type StatusCounts,
} from '@tmt/shared';
import { schemaErrors, type FlatErrors } from '@/lib/form-errors';
import { toId } from '@/lib/forms';
import {
  envEntriesOf,
  envRowErrors,
  envRowsFromEntries,
  withoutBodyErrors,
  type EnvRow,
} from './env-rows';
import { suggestDuplicateCode, suggestRerunCode, usedCodes } from './plan-utils';

/** Review statuses a new run may take cases from (deprecated cases are never added). */
export type SelectableStatus = 'draft' | 'in_review' | 'ready';
export const CASE_STATUS_CHOICES: SelectableStatus[] = ['ready', 'in_review', 'draft'];

// ------------------------------------------------------------------ new run

export interface NewRunValues {
  suiteId: string | null;
  code: string;
  scenario: string;
  testerId: number | null;
  buildId: number | null;
  testedDate: string | null;
  dueDate: string | null;
  sectionIds: string[];
  priorities: CasePriority[];
  tags: string[];
  caseStatuses: SelectableStatus[];
  environment: EnvRow[];
}

export function newRunDefaults(): NewRunValues {
  return {
    suiteId: null,
    code: '',
    scenario: '',
    testerId: null,
    buildId: null,
    testedDate: null,
    dueDate: null,
    sectionIds: [],
    priorities: [],
    tags: [],
    caseStatuses: ['ready'],
    environment: [],
  };
}

export function newRunBody(v: NewRunValues) {
  return {
    suiteId: toId(v.suiteId) ?? 0,
    code: v.code,
    scenario: v.scenario,
    testerId: v.testerId,
    buildId: v.buildId,
    testedDate: v.testedDate ?? '',
    dueDate: v.dueDate ?? '',
    environment: envEntriesOf(v.environment),
    // Empty filters are left out: "no restriction".
    sectionIds: v.sectionIds.length ? v.sectionIds.map(Number) : undefined,
    priorities: v.priorities.length ? v.priorities : undefined,
    tags: v.tags.length ? v.tags : undefined,
    caseStatuses: v.caseStatuses,
  };
}

export function validateNewRun(v: NewRunValues): FlatErrors {
  const errors = {
    ...withoutBodyErrors(schemaErrors(createRunSchema, newRunBody(v))),
    ...envRowErrors(v.environment),
  };
  if (!v.suiteId) errors.suiteId = 'Choose a suite';
  if (v.caseStatuses.length === 0) errors.caseStatuses = 'Choose at least one status';
  return errors;
}

// ------------------------------------------------------------------ edit

export interface EditRunValues {
  code: string;
  scenario: string;
  testerId: number | null;
  buildId: number | null;
  testedDate: string | null;
  dueDate: string | null;
  environment: EnvRow[];
  judgement: Judgement | null;
  judgementNote: string;
  remark: string;
}

export function editRunDefaults(run: RunDTO): EditRunValues {
  return {
    code: run.code,
    scenario: run.scenario ?? '',
    testerId: run.tester?.id ?? null,
    buildId: run.build?.id ?? null,
    testedDate: run.testedDate,
    dueDate: run.dueDate,
    environment: envRowsFromEntries(run.environment),
    judgement: run.judgement,
    judgementNote: run.judgementNote ?? '',
    remark: run.remark ?? '',
  };
}

export function editRunBody(v: EditRunValues) {
  return {
    code: v.code,
    scenario: v.scenario,
    testerId: v.testerId,
    buildId: v.buildId,
    testedDate: v.testedDate ?? '',
    dueDate: v.dueDate ?? '',
    environment: envEntriesOf(v.environment),
    judgement: v.judgement,
    judgementNote: v.judgementNote,
    remark: v.remark,
  };
}

export function validateEditRun(v: EditRunValues): FlatErrors {
  return {
    ...withoutBodyErrors(schemaErrors(updateRunSchema, editRunBody(v))),
    ...envRowErrors(v.environment),
  };
}

// ------------------------------------------------------------------ duplicate

export interface DuplicateRunValues {
  code: string;
  scenario: string;
  testerId: number | null;
  buildId: number | null;
  environment: EnvRow[];
}

export function duplicateRunDefaults(run: RunDTO, planRuns: RunDTO[]): DuplicateRunValues {
  return {
    code: suggestDuplicateCode(run.code, usedCodes(planRuns)),
    scenario: run.scenario ?? '',
    testerId: run.tester?.id ?? null,
    buildId: run.build?.id ?? null,
    environment: envRowsFromEntries(run.environment),
  };
}

export function duplicateRunBody(v: DuplicateRunValues) {
  return {
    code: v.code,
    scenario: v.scenario,
    testerId: v.testerId,
    buildId: v.buildId,
    environment: envEntriesOf(v.environment),
  };
}

export function validateDuplicateRun(v: DuplicateRunValues): FlatErrors {
  return {
    ...withoutBodyErrors(schemaErrors(duplicateRunSchema, duplicateRunBody(v))),
    ...envRowErrors(v.environment),
  };
}

// ------------------------------------------------------------------ re-run

export interface RerunValues {
  code: string;
  scenario: string;
  statuses: RerunStatus[];
  copyEnvironment: boolean;
  environment: EnvRow[];
  testerId: number | null;
  buildId: number | null;
  keepAssignees: boolean;
  refreshFromLibrary: boolean;
}

export function rerunDefaults(run: RunDTO, planRuns: RunDTO[]): RerunValues {
  return {
    code: suggestRerunCode(run.code, usedCodes(planRuns)),
    scenario: run.scenario ?? '',
    statuses: ['ng', 'blocked'],
    copyEnvironment: true,
    environment: envRowsFromEntries(run.environment),
    testerId: run.tester?.id ?? null,
    buildId: run.build?.id ?? null,
    keepAssignees: true,
    refreshFromLibrary: false,
  };
}

export function rerunBody(v: RerunValues) {
  return {
    code: v.code,
    scenario: v.scenario,
    statuses: v.statuses,
    copyEnvironment: v.copyEnvironment,
    environment: v.copyEnvironment ? undefined : envEntriesOf(v.environment),
    testerId: v.testerId,
    buildId: v.buildId,
    keepAssignees: v.keepAssignees,
    refreshFromLibrary: v.refreshFromLibrary,
  };
}

export function validateRerun(v: RerunValues): FlatErrors {
  const errors = {
    ...withoutBodyErrors(schemaErrors(rerunSchema, rerunBody(v))),
    ...(v.copyEnvironment ? {} : envRowErrors(v.environment)),
  };
  if (v.statuses.length === 0) errors.statuses = 'Choose at least one result';
  return errors;
}

/** Run cases of the source run whose current result is one of `statuses`. */
export function rerunMatching(statuses: readonly RerunStatus[], counts: StatusCounts): number {
  return statuses.reduce((sum, s) => sum + counts[s], 0);
}

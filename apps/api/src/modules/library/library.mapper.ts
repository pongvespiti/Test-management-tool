import type { Suite, TestCase } from '@tmt/database';
import {
  displayId,
  normalizeText,
  type CaseStepDTO,
  type CaseStepInput,
  type FieldDef,
  type PlainStepDTO,
  type SuiteDTO,
  type TestCaseDTO,
  type UserRef,
} from '@tmt/shared';
import { unprocessable } from '../../common/errors/app.exception.js';
import { iso, refOf } from '../../common/users/user-refs.js';
import type { SectionTree } from './section-tree.js';

/** Shared steps by id, for expanding `{ kind: 'shared' }` case steps. */
export type SharedStepLookup = Map<number, { name: string; steps: PlainStepDTO[] }>;

export function fieldDefsOf(s: Pick<Suite, 'fieldDefs'>): FieldDef[] {
  return Array.isArray(s.fieldDefs) ? (s.fieldDefs as unknown as FieldDef[]) : [];
}

export function envTemplateOf(s: Pick<Suite, 'envTemplate'>): string[] {
  return Array.isArray(s.envTemplate) ? (s.envTemplate as unknown as string[]) : [];
}

export function toSuiteDTO(s: Suite, caseCount: number): SuiteDTO {
  return {
    id: s.id,
    projectId: s.projectId,
    name: s.name,
    prefix: s.prefix,
    description: s.description,
    topic: s.topic,
    fieldDefs: fieldDefsOf(s),
    envTemplate: envTemplateOf(s),
    caseCount,
    sortOrder: s.sortOrder,
    isArchived: s.isArchived,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

/** Case steps as stored in `test_cases.steps`. */
export function rawCaseSteps(v: unknown): CaseStepInput[] {
  return Array.isArray(v) ? (v as CaseStepInput[]) : [];
}

/** Stored steps with shared steps resolved (`missing: true` when the shared step is gone). */
export function expandCaseSteps(raw: unknown, shared: SharedStepLookup): CaseStepDTO[] {
  return rawCaseSteps(raw).map((s): CaseStepDTO => {
    if (s.kind === 'shared') {
      const ss = shared.get(s.sharedStepId);
      return ss
        ? { kind: 'shared', sharedStepId: s.sharedStepId, name: ss.name, steps: ss.steps }
        : { kind: 'shared', sharedStepId: s.sharedStepId, name: '', steps: [], missing: true };
    }
    return { kind: 'step', action: s.action, expected: s.expected ?? '' };
  });
}

/** Every user id a TestCaseDTO refers to (for `loadUserRefs`). */
export function caseUserIds(c: TestCase): (number | null)[] {
  return [c.createdById, c.updatedById, c.reviewerId, c.reviewRequestedById, c.reviewedById];
}

export function toCaseDTO(
  c: TestCase,
  prefix: string,
  tree: SectionTree,
  users: Map<number, UserRef>,
  shared: SharedStepLookup = new Map(),
): TestCaseDTO {
  return {
    id: c.id,
    suiteId: c.suiteId,
    sectionId: c.sectionId,
    sectionPath: tree.pathOf(c.sectionId),
    seq: c.seq,
    displayId: displayId(prefix, c.seq),
    code: c.code,
    title: c.title,
    caseType: c.caseType,
    status: c.status,
    priority: c.priority,
    tags: c.tags,
    estimateMinutes: c.estimateMinutes,
    references: c.references,
    template: c.template,
    steps: expandCaseSteps(c.steps, shared),
    review: {
      reviewer: refOf(users, c.reviewerId),
      requestedBy: refOf(users, c.reviewRequestedById),
      requestedAt: iso(c.reviewRequestedAt),
      reviewedBy: refOf(users, c.reviewedById),
      reviewedAt: iso(c.reviewedAt),
      note: c.reviewNote,
    },
    precondition: c.precondition,
    procedure: c.procedure,
    expected: c.expected,
    remark: c.remark,
    summaryGroup: c.summaryGroup,
    custom: (c.custom ?? {}) as Record<string, string>,
    version: c.version,
    sortOrder: c.sortOrder,
    source: (c.source as TestCaseDTO['source']) ?? null,
    createdBy: refOf(users, c.createdById),
    updatedBy: refOf(users, c.updatedById),
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

/** Snapshot stored in `test_case_versions.data`. */
export function versionData(c: TestCase): Record<string, unknown> {
  return {
    sectionId: c.sectionId,
    code: c.code,
    title: c.title,
    caseType: c.caseType,
    status: c.status,
    priority: c.priority,
    tags: c.tags,
    estimateMinutes: c.estimateMinutes,
    references: c.references,
    template: c.template,
    steps: c.steps,
    precondition: c.precondition,
    procedure: c.procedure,
    expected: c.expected,
    remark: c.remark,
    summaryGroup: c.summaryGroup,
    custom: c.custom,
  };
}

/**
 * Validates custom values against the suite's field definitions: unknown keys → 422 UNKNOWN_FIELD,
 * select values must be one of the options (422 INVALID_OPTION), empty values are dropped, long
 * texts are normalised like other case texts.
 */
export function cleanCustom(
  defs: readonly FieldDef[],
  input: Record<string, string>,
): Record<string, string> {
  const byKey = new Map(defs.map((d) => [d.key, d]));
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(input)) {
    const def = byKey.get(key);
    if (!def) throw unprocessable('UNKNOWN_FIELD', `Unknown field "${key}" for this suite`);
    const value = def.type === 'longtext' ? (normalizeText(raw) ?? '') : (raw ?? '').trim();
    if (!value) continue;
    if (def.type === 'select' && def.options?.length && !def.options.includes(value)) {
      throw unprocessable('INVALID_OPTION', `"${value}" is not an option of ${def.label}`);
    }
    out[key] = value;
  }
  return out;
}

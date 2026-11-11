/**
 * Applies an import plan inside the commit transaction: suite (new, or new fields / environment
 * template), sections, created and updated cases (with versions), the `imports` record and activity.
 */
import type { Prisma, Suite } from '@tmt/database';
import {
  normalizeText,
  type CasePriority,
  type CaseType,
  type ImportResultDTO,
  type ImportTarget,
} from '@tmt/shared';
import { isUniqueViolation } from '../../common/errors/prisma-errors.js';
import type { Db } from '../../prisma/prisma.service.js';
import type { ActivityService } from '../activity/activity.service.js';
import { reviewableChanged } from '../library/case-rules.js';
import { SUITE_PREFIX_UNIQUE, suitePrefixTaken } from '../library/library.errors.js';
import { cleanCustom } from '../library/library.mapper.js';
import { allocateSeq } from '../library/library.queries.js';
import { insertVersions } from '../library/review-transitions.js';
import { pathKey, type ImportContext, type ImportPlan, type PlannedCase } from './import-plan.js';

/** Cases per multi-row insert. */
const CHUNK = 500;

/** Changes an imported row makes to an existing case. */
export interface CaseChanges {
  sectionId?: number | null;
  title?: string;
  caseType?: CaseType;
  priority?: CasePriority;
  tags?: string[];
  estimateMinutes?: number | null;
  references?: string | null;
  precondition?: string | null;
  procedure?: string | null;
  expected?: string | null;
  remark?: string | null;
  summaryGroup?: string | null;
  custom?: Record<string, string>;
}

function sortedEntries(o: Record<string, string>): [string, string][] {
  return Object.entries(o).toSorted(([a], [b]) => a.localeCompare(b));
}

/** Changes of an `update` row: only mapped columns that differ (`sectionId` undefined = keep). */
export function updateFor(
  plan: Pick<ImportPlan, 'mapped' | 'fieldDefs' | 'parsed'>,
  c: PlannedCase,
  sectionId: number | null | undefined,
): CaseChanges {
  const p = c.parsed;
  const e = c.existing!;
  const has = (t: ImportTarget) => plan.mapped.has(t);
  const set: CaseChanges = {};
  if (sectionId !== undefined && sectionId !== e.sectionId) set.sectionId = sectionId;
  // A row without a title gets its code as title (engine warning) — never overwrite a real title.
  const titleFromCode = p.code !== null && p.title === p.code;
  if (has('title') && !titleFromCode && p.title !== e.title) set.title = p.title;
  if (has('type') && p.caseType !== e.caseType) set.caseType = p.caseType;
  if (has('priority') && p.priority !== e.priority) set.priority = p.priority;
  if (has('tags') && JSON.stringify(p.tags) !== JSON.stringify(e.tags)) set.tags = p.tags;
  if (has('estimate') && p.estimateMinutes !== e.estimateMinutes) {
    set.estimateMinutes = p.estimateMinutes;
  }
  if (has('references') && p.references !== e.references) set.references = p.references;
  for (const key of ['precondition', 'procedure', 'expected', 'remark'] as const) {
    const value = normalizeText(p[key]);
    if (has(key) && value !== e[key]) set[key] = value;
  }
  if (has('summary_group') && p.summaryGroup !== e.summaryGroup) set.summaryGroup = p.summaryGroup;
  // Custom fields of mapped columns: the cell's value, or removed when the cell is empty.
  const customKeys = [...new Set(plan.parsed.customColumns.map((col) => col.key))];
  if (customKeys.length > 0) {
    const current = (e.custom ?? {}) as Record<string, string>;
    // Only the imported values are validated; other (possibly legacy) values are kept as they are.
    const imported = cleanCustom(
      plan.fieldDefs,
      Object.fromEntries(customKeys.flatMap((k) => (p.custom[k] ? [[k, p.custom[k]!]] : []))),
    );
    const next: Record<string, string> = { ...current };
    for (const key of customKeys) delete next[key];
    Object.assign(next, imported);
    if (JSON.stringify(sortedEntries(next)) !== JSON.stringify(sortedEntries(current))) {
      set.custom = next;
    }
  }
  return set;
}

/** Creates the planned suite, or stores its new fields / environment template. */
async function applySuite(
  tx: Db,
  activity: ActivityService,
  ctx: ImportContext,
  plan: ImportPlan,
): Promise<Suite> {
  if (plan.suite) {
    if (plan.newFields.length === 0 && !plan.envTemplate) return plan.suite;
    return tx.suite.update({
      where: { id: plan.suite.id },
      data: {
        ...(plan.newFields.length > 0 && {
          fieldDefs: plan.fieldDefs as unknown as Prisma.InputJsonValue,
        }),
        ...(plan.envTemplate && { envTemplate: plan.envTemplate }),
      },
    });
  }
  const { name, prefix } = plan.newSuite!;
  const agg = await tx.suite.aggregate({
    where: { projectId: ctx.projectId },
    _max: { sortOrder: true },
  });
  const suite = await tx.suite
    .create({
      data: {
        projectId: ctx.projectId,
        name,
        prefix,
        fieldDefs: plan.fieldDefs as unknown as Prisma.InputJsonValue,
        envTemplate: plan.envTemplate ?? [],
        sortOrder: (agg._max.sortOrder ?? 0) + 1,
      },
    })
    .catch((e: unknown) => {
      throw isUniqueViolation(e, SUITE_PREFIX_UNIQUE) ? suitePrefixTaken(prefix) : e;
    });
  await activity.log(tx, {
    projectId: ctx.projectId,
    userId: ctx.userId,
    entityType: 'suite',
    entityId: suite.id,
    action: 'created',
    summary: `Created suite ${suite.name} from import ${ctx.fileName}`,
  });
  return suite;
}

/** Creates the planned sections (parents before children); returns ids by path key. */
async function applySections(
  tx: Db,
  suite: Suite,
  plan: ImportPlan,
): Promise<{ ids: Map<string, number>; created: number }> {
  const ids = new Map<string, number>();
  const lastSort = new Map<number | null, number>();
  let created = 0;
  for (const sec of plan.sections) {
    if (sec.existingId !== null) {
      ids.set(sec.key, sec.existingId);
      continue;
    }
    const parentId = sec.parentKey ? ids.get(sec.parentKey)! : plan.rootSectionId;
    if (!lastSort.has(parentId)) {
      const agg = await tx.section.aggregate({
        where: { suiteId: suite.id, parentId },
        _max: { sortOrder: true },
      });
      lastSort.set(parentId, agg._max.sortOrder ?? 0);
    }
    const sortOrder = lastSort.get(parentId)! + 1;
    lastSort.set(parentId, sortOrder);
    const row = await tx.section.create({
      data: { suiteId: suite.id, parentId, name: sec.name, code: sec.code, sortOrder },
      select: { id: true },
    });
    ids.set(sec.key, row.id);
    created++;
  }
  return { ids, created };
}

/** Inserts the new cases in file order, appended to their sections (bulk, with versions). */
async function applyCreates(
  tx: Db,
  ctx: ImportContext,
  suite: Suite,
  plan: ImportPlan,
  creates: PlannedCase[],
  sectionOf: (c: PlannedCase) => number | null | undefined,
): Promise<void> {
  if (creates.length === 0) return;
  const firstSeq = await allocateSeq(tx, suite.id, creates.length);
  const maxRows = await tx.testCase.groupBy({
    by: ['sectionId'],
    where: { suiteId: suite.id },
    _max: { sortOrder: true },
  });
  const lastSort = new Map(maxRows.map((r) => [r.sectionId, r._max.sortOrder ?? 0]));
  const values = creates.map((c, i): Prisma.TestCaseCreateManyInput => {
    const p = c.parsed;
    const sectionId = sectionOf(c) ?? null;
    const sortOrder = (lastSort.get(sectionId) ?? 0) + 1;
    lastSort.set(sectionId, sortOrder);
    return {
      suiteId: suite.id,
      sectionId,
      seq: firstSeq + i,
      code: c.code,
      title: p.title,
      caseType: p.caseType,
      status: plan.createStatus,
      priority: p.priority,
      tags: p.tags,
      estimateMinutes: p.estimateMinutes,
      references: p.references,
      precondition: normalizeText(p.precondition),
      procedure: normalizeText(p.procedure),
      expected: normalizeText(p.expected),
      remark: normalizeText(p.remark),
      summaryGroup: p.summaryGroup,
      custom: cleanCustom(plan.fieldDefs, p.custom),
      sortOrder,
      source: { fileName: ctx.fileName, sheet: plan.parsed.sheet, row: p.row },
      createdById: ctx.userId,
      updatedById: ctx.userId,
    };
  });
  for (let i = 0; i < values.length; i += CHUNK) {
    const rows = await tx.testCase.createManyAndReturn({ data: values.slice(i, i + CHUNK) });
    await insertVersions(tx, rows, ctx.userId);
  }
}

/**
 * Applies a plan built with `lock` in the same transaction. Unchanged `update` rows are left alone;
 * a non-lead's change of reviewable content sends a ready case back to draft (review rules).
 */
export async function applyImport(
  tx: Db,
  activity: ActivityService,
  ctx: ImportContext,
  plan: ImportPlan,
): Promise<ImportResultDTO> {
  const suite = await applySuite(tx, activity, ctx, plan);
  const sections = await applySections(tx, suite, plan);
  const sectionOf = (c: PlannedCase): number | null | undefined =>
    c.parsed.sectionPath.length > 0
      ? sections.ids.get(pathKey(c.parsed.sectionPath))!
      : (plan.rootSectionId ?? undefined);

  const creates = plan.cases.filter((c) => c.action === 'create');
  await applyCreates(tx, ctx, suite, plan, creates, sectionOf);

  const updates = plan.cases.filter((c) => c.action === 'update');
  for (const c of updates) {
    const set = updateFor(plan, c, sectionOf(c));
    if (Object.keys(set).length === 0) continue;
    const e = c.existing!;
    const backToDraft =
      plan.enforceReview &&
      e.status === 'ready' &&
      reviewableChanged(e, {
        title: set.title,
        precondition: set.precondition,
        procedure: set.procedure,
        expected: set.expected,
        custom: set.custom,
      });
    const u = await tx.testCase.update({
      where: { id: e.id },
      data: {
        ...set,
        ...(backToDraft && { status: 'draft' as const }),
        version: { increment: 1 },
        updatedById: ctx.userId,
      },
    });
    await insertVersions(tx, [u], ctx.userId);
  }

  const created = creates.length;
  const updated = updates.length;
  const skipped = plan.cases.length - created - updated;
  const fieldsCreated = plan.newFields.length;
  const record = await tx.import.create({
    data: {
      projectId: ctx.projectId,
      kind: 'cases',
      suiteId: suite.id,
      fileName: ctx.fileName,
      sheet: plan.parsed.sheet,
      layout: plan.layout,
      stats: {
        cases: plan.cases.length,
        created,
        updated,
        skipped,
        sectionsCreated: sections.created,
        fieldsCreated,
        warnings: plan.warnings.length,
      },
      createdById: ctx.userId,
    },
    select: { id: true },
  });
  await activity.log(tx, {
    projectId: ctx.projectId,
    userId: ctx.userId,
    entityType: 'suite',
    entityId: suite.id,
    action: 'imported',
    summary: `Imported ${ctx.fileName} (${plan.parsed.sheet}) into ${suite.name}: ${created} created, ${updated} updated, ${skipped} skipped`,
    data: { importId: record.id, sectionsCreated: sections.created, fieldsCreated },
  });
  return {
    importId: record.id,
    suiteId: suite.id,
    created,
    updated,
    skipped,
    sectionsCreated: sections.created,
    fieldsCreated,
    warnings: plan.warnings,
  };
}

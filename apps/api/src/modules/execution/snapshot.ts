/**
 * Run-case snapshots (ADR-003): which library cases go into a run and the frozen copy of each case
 * a run executes. Shared steps are flattened into the snapshot here. Also used by the JUnit import
 * (`createMissing`) — keep the exported signatures stable.
 */
import {
  Prisma,
  type CasePriority,
  type CaseStatus,
  type CaseTemplate,
  type CaseType,
  type RunCase,
  type Suite,
  type TestCase,
} from '@tmt/database';
import { displayId, flattenSteps, type RunStepDTO } from '@tmt/shared';
import { unprocessable } from '../../common/errors/app.exception.js';
import type { Db } from '../../prisma/prisma.service.js';
import { expandCaseSteps, type SharedStepLookup } from '../library/library.mapper.js';
import { loadSharedStepLookup } from '../library/library.queries.js';
import { loadSectionTree, type SectionTree } from '../library/section-tree.js';
import { runStepsOf } from './execution.mapper.js';

/** Frozen copy of a library case (everything except the run, the position and the result). */
export interface RunCaseSnapshot {
  testCaseId: number | null;
  caseVersion: number;
  displayId: string;
  code: string | null;
  title: string;
  caseType: CaseType;
  sectionPath: string[];
  priority: CasePriority;
  tags: string[];
  estimateMinutes: number | null;
  references: string | null;
  template: CaseTemplate;
  precondition: string | null;
  procedure: string | null;
  expected: string | null;
  steps: RunStepDTO[];
  caseRemark: string | null;
  summaryGroup: string | null;
  custom: Record<string, string>;
}

/** A run case to insert: snapshot, position and (re-runs) the kept assignee. */
export interface RunCaseInsert extends RunCaseSnapshot {
  sortOrder: number;
  assigneeId?: number | null;
}

/** Which library cases to snapshot. All given filters are ANDed. */
export interface CaseSelection {
  sectionIds?: number[];
  caseIds?: number[];
  priorities?: CasePriority[];
  tags?: string[];
  caseStatuses: readonly Extract<CaseStatus, 'draft' | 'in_review' | 'ready'>[];
}

const INSERT_CHUNK = 500;

/** Snapshot of one library case (the caller sets the sort order). */
export function snapshotOf(
  c: TestCase,
  suite: Pick<Suite, 'prefix'>,
  tree: SectionTree,
  shared: SharedStepLookup,
): RunCaseSnapshot {
  return {
    testCaseId: c.id,
    caseVersion: c.version,
    displayId: displayId(suite.prefix, c.seq),
    code: c.code,
    title: c.title,
    caseType: c.caseType,
    sectionPath: tree.pathOf(c.sectionId),
    priority: c.priority,
    tags: c.tags ?? [],
    estimateMinutes: c.estimateMinutes,
    references: c.references,
    template: c.template,
    precondition: c.precondition,
    procedure: c.procedure,
    expected: c.expected,
    steps: c.template === 'steps' ? flattenSteps(expandCaseSteps(c.steps, shared)) : [],
    caseRemark: c.remark,
    summaryGroup: c.summaryGroup,
    custom: (c.custom ?? {}) as Record<string, string>,
  };
}

/** Snapshot of an existing run case (re-runs reuse the snapshot the failure was found with). */
export function snapshotFromRunCase(rc: RunCase): RunCaseSnapshot {
  return {
    testCaseId: rc.testCaseId,
    caseVersion: rc.caseVersion,
    displayId: rc.displayId,
    code: rc.code,
    title: rc.title,
    caseType: rc.caseType,
    sectionPath: rc.sectionPath,
    priority: rc.priority,
    tags: rc.tags,
    estimateMinutes: rc.estimateMinutes,
    references: rc.references,
    template: rc.template,
    precondition: rc.precondition,
    procedure: rc.procedure,
    expected: rc.expected,
    steps: runStepsOf(rc),
    caseRemark: rc.caseRemark,
    summaryGroup: rc.summaryGroup,
    custom: (rc.custom ?? {}) as Record<string, string>,
  };
}

/**
 * Orders cases like the library tree: section pre-order, then sort order, then seq. Unsectioned
 * cases come first.
 */
export function sortInTreeOrder(rows: readonly TestCase[], tree: SectionTree): TestCase[] {
  const order = new Map(tree.ordered.map((id, i) => [id, i]));
  const rank = (sid: number | null) =>
    sid === null ? -1 : (order.get(sid) ?? Number.MAX_SAFE_INTEGER);
  return rows.toSorted(
    (a, b) => rank(a.sectionId) - rank(b.sectionId) || a.sortOrder - b.sortOrder || a.seq - b.seq,
  );
}

/**
 * Live library cases of a suite matching `sel`, in tree order. Unsectioned cases are only included
 * when no section filter is given. 422 BAD_SECTION / BAD_CASE for references outside the suite.
 */
export async function selectCases(
  db: Db,
  suite: Pick<Suite, 'id'>,
  sel: CaseSelection,
): Promise<{ rows: TestCase[]; tree: SectionTree }> {
  const tree = await loadSectionTree(db, suite.id);
  let allowed: Set<number> | null = null;
  if (sel.sectionIds && sel.sectionIds.length > 0) {
    allowed = new Set();
    for (const id of sel.sectionIds) {
      if (!tree.byId.has(id)) {
        throw unprocessable('BAD_SECTION', 'A selected section does not belong to this suite');
      }
      for (const sid of tree.subtreeIds(id)) allowed.add(sid);
    }
  }
  const where: Prisma.TestCaseWhereInput = {
    suiteId: suite.id,
    isDeleted: false,
    status: { in: [...sel.caseStatuses] },
  };
  if (sel.caseIds && sel.caseIds.length > 0) {
    const ids = [...new Set(sel.caseIds)];
    const found = await db.testCase.count({
      where: { suiteId: suite.id, isDeleted: false, id: { in: ids } },
    });
    if (found !== ids.length) {
      throw unprocessable('BAD_CASE', 'A selected test case does not belong to this suite');
    }
    where.id = { in: ids };
  }
  if (sel.priorities && sel.priorities.length > 0) where.priority = { in: sel.priorities };
  const rows = await db.testCase.findMany({ where });
  // Tags match case-insensitively (any of the wanted tags).
  const wanted = sel.tags?.length ? new Set(sel.tags.map((t) => t.toLowerCase())) : null;
  const picked = rows.filter(
    (c) =>
      (allowed === null || (c.sectionId !== null && allowed.has(c.sectionId))) &&
      (wanted === null || c.tags.some((t) => wanted.has(t.toLowerCase()))),
  );
  return { rows: sortInTreeOrder(picked, tree), tree };
}

/** Snapshots of the selected cases with sort orders `startAt`, `startAt + 1`, … */
export async function snapshotCases(
  db: Db,
  suite: Pick<Suite, 'id' | 'prefix'>,
  sel: CaseSelection,
  startAt = 1,
): Promise<RunCaseInsert[]> {
  const { rows, tree } = await selectCases(db, suite, sel);
  const shared = await loadSharedStepLookup(db, rows);
  return rows.map((c, i) => ({ ...snapshotOf(c, suite, tree, shared), sortOrder: startAt + i }));
}

function toCreateInput(runId: number, r: RunCaseInsert): Prisma.RunCaseCreateManyInput {
  return {
    ...r,
    runId,
    steps: r.steps as unknown as Prisma.InputJsonValue,
    custom: r.custom,
    assigneeId: r.assigneeId ?? null,
  };
}

/** Inserts run cases in chunks; returns the inserted ids in input order. */
export async function insertRunCases(
  tx: Db,
  runId: number,
  rows: readonly RunCaseInsert[],
): Promise<number[]> {
  const ids: number[] = [];
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const inserted = await tx.runCase.createManyAndReturn({
      data: rows.slice(i, i + INSERT_CHUNK).map((r) => toCreateInput(runId, r)),
      select: { id: true },
    });
    ids.push(...inserted.map((r) => r.id));
  }
  return ids;
}

/** Next free sort order at the end of a run. */
export async function nextRunCaseSortOrder(db: Db, runId: number): Promise<number> {
  const agg = await db.runCase.aggregate({ where: { runId }, _max: { sortOrder: true } });
  return (agg._max.sortOrder ?? 0) + 1;
}

/** Copies the snapshot (not the results) of every run case of `fromRunId` into `toRunId`. */
export async function copyRunSnapshot(tx: Db, fromRunId: number, toRunId: number): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO run_cases (run_id, test_case_id, case_version, display_id, code, title, case_type,
      section_path, priority, tags, estimate_minutes, refs, template, precondition, procedure,
      expected, steps, case_remark, summary_group, custom, sort_order, updated_at)
    SELECT ${toRunId}::int, test_case_id, case_version, display_id, code, title, case_type,
      section_path, priority, tags, estimate_minutes, refs, template, precondition, procedure,
      expected, steps, case_remark, summary_group, custom, sort_order, now()
      FROM run_cases
     WHERE run_id = ${fromRunId}
     ORDER BY sort_order, id`;
}

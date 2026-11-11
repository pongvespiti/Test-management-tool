/**
 * `createMissing` of the JUnit import: unmatched tests become library cases (one per suite name,
 * classname and name) in top-level sections named after their `<testsuite>`, appended to the run.
 */
import type { ProjectRole } from '@tmt/shared';
import type { RunCase, TestCase, TestRun } from '@tmt/database';
import type { Db } from '../../prisma/prisma.service.js';
import { createStatus, loadReviewPolicy } from '../library/case-rules.js';
import { allocateSeq, insertCase, nextCaseSortOrder } from '../library/library.queries.js';
import { loadSectionTree } from '../library/section-tree.js';
import { insertRunCases, nextRunCaseSortOrder, snapshotOf } from '../execution/snapshot.js';
import type { JunitTest } from './junit-parse.js';
import { groupMissing } from './junit-results.js';

const DEFAULT_SECTION = 'JUnit import';
const MAX_CODE = 100;

export interface MissingCasesInput {
  projectId: number;
  userId: number;
  /** Caller's effective project role (review rules for the created cases). */
  role: ProjectRole;
  fileName: string;
}

/** Created run cases (in order) with the tests mapped onto each, and the new library case ids. */
export interface MissingCasesResult {
  runCases: Map<number, JunitTest[]>;
  createdCaseIds: number[];
  rows: RunCase[];
}

export async function createMissingCases(
  tx: Db,
  run: Pick<TestRun, 'id' | 'suiteId'>,
  input: MissingCasesInput,
  missing: JunitTest[],
): Promise<MissingCasesResult> {
  const suite = await tx.suite.findUniqueOrThrow({ where: { id: run.suiteId } });
  // Review rules (single source: library/case-rules): below lead, `ready` → `draft`.
  const status = createStatus('ready', await loadReviewPolicy(tx, input.projectId, input.role));
  const groups = groupMissing(missing);

  // Top-level sections by name (case-insensitive), created when missing.
  const roots = (await loadSectionTree(tx, suite.id)).childrenOf.get(null) ?? [];
  const sectionByName = new Map<string, number>();
  for (const s of roots) {
    const key = s.name.trim().toLowerCase();
    if (!sectionByName.has(key)) sectionByName.set(key, s.id);
  }
  let nextTopOrder = Math.max(0, ...roots.map((s) => s.sortOrder)) + 1;
  const sectionFor = async (suiteName: string): Promise<number> => {
    const name = (suiteName.trim() || DEFAULT_SECTION).slice(0, 300);
    const existing = sectionByName.get(name.toLowerCase());
    if (existing !== undefined) return existing;
    const s = await tx.section.create({
      data: { suiteId: suite.id, parentId: null, name, sortOrder: nextTopOrder++ },
      select: { id: true },
    });
    sectionByName.set(name.toLowerCase(), s.id);
    return s.id;
  };

  const takenCodes = new Set(
    (
      await tx.testCase.findMany({
        where: { suiteId: suite.id, isDeleted: false, code: { not: null } },
        select: { code: true },
      })
    ).map((r) => r.code!),
  );
  const sortOrders = new Map<number, number>();
  const nextCaseOrder = async (sectionId: number) => {
    const next = sortOrders.get(sectionId) ?? (await nextCaseSortOrder(tx, suite.id, sectionId));
    sortOrders.set(sectionId, next + 1);
    return next;
  };

  let seq = await allocateSeq(tx, suite.id, groups.size);
  const created: { c: TestCase; tests: JunitTest[] }[] = [];
  for (const tests of groups.values()) {
    const t = tests[0]!;
    const sectionId = await sectionFor(t.suiteName);
    const code =
      t.name !== '' && t.name.length <= MAX_CODE && !takenCodes.has(t.name) ? t.name : null;
    if (code) takenCodes.add(code);
    const c = await insertCase(
      tx,
      suite,
      {
        sectionId,
        code,
        title: (t.name || t.classname || 'Unnamed test').slice(0, 500),
        caseType: 'Normal',
        status,
        priority: 'medium',
        tags: ['automated'],
        estimateMinutes: null,
        references: t.classname ? t.classname.slice(0, 500) : null,
        template: 'text',
        steps: [],
        custom: {},
      },
      input.userId,
      {
        seq: seq++,
        sortOrder: await nextCaseOrder(sectionId),
        source: { fileName: input.fileName },
      },
    );
    created.push({ c, tests });
  }

  const tree = await loadSectionTree(tx, suite.id);
  const start = await nextRunCaseSortOrder(tx, run.id);
  const ids = await insertRunCases(
    tx,
    run.id,
    created.map(({ c }, i) => ({ ...snapshotOf(c, suite, tree, new Map()), sortOrder: start + i })),
  );
  const rows = await tx.runCase.findMany({ where: { runId: run.id, id: { in: ids } } });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const runCases = new Map<number, JunitTest[]>();
  ids.forEach((id, i) => runCases.set(id, created[i]!.tests));
  return {
    runCases,
    createdCaseIds: created.map(({ c }) => c.id),
    rows: ids.map((id) => byId.get(id)!),
  };
}

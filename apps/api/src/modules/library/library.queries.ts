import type { Prisma, Suite, TestCase } from '@tmt/database';
import {
  normalizeReferences,
  normalizeText,
  type CreateCaseInput,
  type PlainStepDTO,
} from '@tmt/shared';
import { notFound } from '../../common/errors/app.exception.js';
import type { Db } from '../../prisma/prisma.service.js';
import { normalizeSteps } from './case-rules.js';
import {
  cleanCustom,
  fieldDefsOf,
  rawCaseSteps,
  versionData,
  type SharedStepLookup,
} from './library.mapper.js';

/** A suite of the project (404 SUITE_NOT_FOUND otherwise). */
export async function getSuite(db: Db, projectId: number, suiteId: number): Promise<Suite> {
  const suite = await db.suite.findFirst({ where: { id: suiteId, projectId } });
  if (!suite) throw notFound('Suite', 'SUITE_NOT_FOUND');
  return suite;
}

/** A live (not deleted) case of the project with its suite (404 CASE_NOT_FOUND otherwise). */
export async function getCaseInProject(
  db: Db,
  projectId: number,
  caseId: number,
): Promise<{ c: TestCase; suite: Suite }> {
  const row = await db.testCase.findFirst({
    where: { id: caseId, isDeleted: false, suite: { projectId } },
    include: { suite: true },
  });
  if (!row) throw notFound('Test case', 'CASE_NOT_FOUND');
  const { suite, ...c } = row;
  return { c, suite };
}

/** Loads the shared steps referenced by the given cases. */
export async function loadSharedStepLookup(
  db: Db,
  rows: readonly Pick<TestCase, 'steps'>[],
): Promise<SharedStepLookup> {
  const ids = new Set<number>();
  for (const r of rows) {
    for (const s of rawCaseSteps(r.steps)) if (s.kind === 'shared') ids.add(s.sharedStepId);
  }
  if (ids.size === 0) return new Map();
  const found = await db.sharedStep.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true, name: true, steps: true },
  });
  return new Map(
    found.map((f) => [
      f.id,
      { name: f.name, steps: Array.isArray(f.steps) ? (f.steps as unknown as PlainStepDTO[]) : [] },
    ]),
  );
}

/**
 * Reserves `n` consecutive case numbers of a suite (atomic increment of `suites.next_seq`) and
 * returns the first one. Call inside the transaction that inserts the cases.
 */
export async function allocateSeq(tx: Db, suiteId: number, n = 1): Promise<number> {
  const suite = await tx.suite.update({
    where: { id: suiteId },
    data: { nextSeq: { increment: n } },
    select: { nextSeq: true },
  });
  return suite.nextSeq - n;
}

/** Next free sort order at the end of a section (or of the unsectioned cases). */
export async function nextCaseSortOrder(
  db: Db,
  suiteId: number,
  sectionId: number | null,
): Promise<number> {
  const agg = await db.testCase.aggregate({
    where: { suiteId, sectionId },
    _max: { sortOrder: true },
  });
  return (agg._max.sortOrder ?? 0) + 1;
}

export interface InsertCaseExtra {
  /** Where an imported case came from (`{ fileName, sheet, row }`). */
  source?: Record<string, unknown> | null;
  sortOrder?: number;
  /** Pre-allocated case number (bulk inserts). */
  seq?: number;
}

/**
 * Inserts one library case with version 1 in `test_case_versions` (create, clone, import, JUnit).
 * `input.status` must already respect the review policy (see `createStatus`).
 */
export async function insertCase(
  tx: Db,
  suite: Suite,
  input: CreateCaseInput,
  userId: number,
  extra: InsertCaseExtra = {},
): Promise<TestCase> {
  const seq = extra.seq ?? (await allocateSeq(tx, suite.id));
  const sectionId = input.sectionId ?? null;
  const c = await tx.testCase.create({
    data: {
      suiteId: suite.id,
      sectionId,
      seq,
      code: input.code ?? null,
      title: input.title,
      caseType: input.caseType,
      status: input.status,
      priority: input.priority,
      tags: input.tags,
      estimateMinutes: input.estimateMinutes ?? null,
      references: normalizeReferences(input.references),
      template: input.template,
      steps: normalizeSteps(input.steps ?? []) as unknown as Prisma.InputJsonValue,
      precondition: normalizeText(input.precondition),
      procedure: normalizeText(input.procedure),
      expected: normalizeText(input.expected),
      remark: normalizeText(input.remark),
      summaryGroup: input.summaryGroup ?? null,
      custom: cleanCustom(fieldDefsOf(suite), input.custom ?? {}),
      sortOrder: extra.sortOrder ?? (await nextCaseSortOrder(tx, suite.id, sectionId)),
      source: (extra.source ?? undefined) as Prisma.InputJsonValue | undefined,
      createdById: userId,
      updatedById: userId,
    },
  });
  await tx.testCaseVersion.create({
    data: {
      testCaseId: c.id,
      version: 1,
      data: versionData(c) as Prisma.InputJsonValue,
      changedById: userId,
    },
  });
  return c;
}

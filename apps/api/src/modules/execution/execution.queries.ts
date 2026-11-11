/**
 * Read helpers of test plans, runs and run cases shared by the execution, defects, collaboration,
 * templates, reports and dashboard modules. All lookups are scoped to the caller's project.
 */
import { Prisma, type TestPlan, type TestRun, type RunCase } from '@tmt/database';
import {
  countsFromRows,
  type CaseRunHistoryItem,
  type NamedRef,
  type PlanDTO,
  type RunCaseDTO,
  type RunDTO,
  type RunRef,
  type StatusCounts,
} from '@tmt/shared';
import { conflict, notFound, unprocessable } from '../../common/errors/app.exception.js';
import { loadUserRefs } from '../../common/users/user-refs.js';
import type { Db } from '../../prisma/prisma.service.js';
import { toAttachmentDTO } from '../collab/attachments.mapper.js';
import {
  toCaseRunHistoryItem,
  toPlanDTO,
  toRunCaseDTO,
  toRunDTO,
  toRunSummaryDTO,
  type RunEstimate,
} from './execution.mapper.js';

export { envOf, runStepsOf, stepResultsOf } from './execution.mapper.js';

/** Options of transactions that copy or write many run cases (Prisma's default timeout is 5 s). */
export const BULK_TX = { maxWait: 10_000, timeout: 120_000 };

export async function getPlanInProject(
  db: Db,
  projectId: number,
  planId: number,
): Promise<TestPlan> {
  const plan = await db.testPlan.findFirst({ where: { id: planId, projectId } });
  if (!plan) throw notFound('Test plan', 'PLAN_NOT_FOUND');
  return plan;
}

export async function getRunInProject(
  db: Db,
  projectId: number,
  runId: number,
): Promise<{ run: TestRun; plan: TestPlan }> {
  const row = await db.testRun.findFirst({
    where: { id: runId, plan: { projectId } },
    include: { plan: true },
  });
  if (!row) throw notFound('Test run', 'RUN_NOT_FOUND');
  const { plan, ...run } = row;
  return { run, plan };
}

export async function getRunCaseInProject(
  db: Db,
  projectId: number,
  runCaseId: number,
): Promise<{ rc: RunCase; run: TestRun; plan: TestPlan }> {
  const row = await db.runCase.findFirst({
    where: { id: runCaseId, run: { plan: { projectId } } },
    include: { run: { include: { plan: true } } },
  });
  if (!row) throw notFound('Run case', 'RUN_CASE_NOT_FOUND');
  const {
    run: { plan, ...run },
    ...rc
  } = row;
  return { rc, run, plan };
}

/** Validates a release reference from a request body (422 BAD_RELEASE). */
export async function assertReleaseInProject(
  db: Db,
  projectId: number,
  releaseId: number | null | undefined,
): Promise<void> {
  if (releaseId === null || releaseId === undefined) return;
  const found = await db.release.count({ where: { id: releaseId, projectId } });
  if (!found) throw unprocessable('BAD_RELEASE', 'The release does not belong to this project');
}

/**
 * A run's build must belong to the plan's release (422 BAD_BUILD); a plan without a release takes
 * any build of the project.
 */
export async function assertBuildForPlan(
  db: Db,
  projectId: number,
  plan: Pick<TestPlan, 'releaseId'>,
  buildId: number | null | undefined,
): Promise<void> {
  if (buildId === null || buildId === undefined) return;
  const found = await db.build.count({
    where: {
      id: buildId,
      release: { projectId },
      ...(plan.releaseId !== null && { releaseId: plan.releaseId }),
    },
  });
  if (!found) {
    throw unprocessable('BAD_BUILD', "The build does not belong to the test plan's release");
  }
}

/** `{ id, name }` of the given builds. */
export async function buildRefs(
  db: Db,
  ids: (number | null | undefined)[],
): Promise<Map<number, NamedRef>> {
  const unique = [...new Set(ids.filter((v): v is number => typeof v === 'number'))];
  if (unique.length === 0) return new Map();
  const rows = await db.build.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true },
  });
  return new Map(rows.map((r) => [r.id, r]));
}

/** Completed plans are read-only until a lead reopens them (409 PLAN_LOCKED). */
export function assertPlanEditable(plan: Pick<TestPlan, 'status' | 'docNo'>): void {
  if (plan.status === 'completed') {
    throw conflict(
      'PLAN_LOCKED',
      `Test plan ${plan.docNo} is completed — reopen it to make changes`,
    );
  }
}

/**
 * Inside a transaction: locks the plan row (serialises with complete/reopen) and re-checks that it
 * is still editable, so a result can never land in a plan completed a moment earlier.
 */
export async function lockEditablePlan(tx: Db, planId: number): Promise<TestPlan> {
  await tx.$queryRaw`SELECT id FROM test_plans WHERE id = ${planId} FOR UPDATE`;
  const plan = await tx.testPlan.findUnique({ where: { id: planId } });
  if (!plan) throw notFound('Test plan', 'PLAN_NOT_FOUND');
  assertPlanEditable(plan);
  return plan;
}

/** Plans move from draft to in progress with their first recorded result. */
export async function markPlanInProgress(db: Db, planId: number): Promise<void> {
  await db.testPlan.updateMany({
    where: { id: planId, status: 'draft' },
    data: { status: 'in_progress' },
  });
}

/** Next free sort order at the end of a plan's runs. */
export async function nextRunSortOrder(db: Db, planId: number): Promise<number> {
  const agg = await db.testRun.aggregate({ where: { planId }, _max: { sortOrder: true } });
  return (agg._max.sortOrder ?? 0) + 1;
}

/** Result counts per run (every requested run is present, empty runs count 0). */
export async function countsByRun(db: Db, runIds: number[]): Promise<Map<number, StatusCounts>> {
  const map = new Map<number, StatusCounts>();
  if (runIds.length === 0) return map;
  const rows = await db.runCase.groupBy({
    by: ['runId', 'status'],
    where: { runId: { in: runIds } },
    _count: { _all: true },
  });
  const grouped = new Map<number, { status: string; count: number }[]>();
  for (const r of rows) {
    const list = grouped.get(r.runId) ?? [];
    list.push({ status: r.status, count: r._count._all });
    grouped.set(r.runId, list);
  }
  for (const id of runIds) map.set(id, countsFromRows(grouped.get(id) ?? []));
  return map;
}

/** Sum of case estimates per run; remaining = untested run cases only. */
export async function estimatesByRun(db: Db, runIds: number[]): Promise<Map<number, RunEstimate>> {
  const map = new Map<number, RunEstimate>();
  if (runIds.length === 0) return map;
  const rows = await db.$queryRaw<{ run_id: number; total: number; remaining: number }[]>`
    SELECT run_id,
           COALESCE(SUM(estimate_minutes), 0)::int AS total,
           COALESCE(SUM(estimate_minutes) FILTER (WHERE status = 'untested'), 0)::int AS remaining
      FROM run_cases
     WHERE run_id IN (${Prisma.join(runIds)})
     GROUP BY run_id`;
  for (const r of rows) {
    map.set(Number(r.run_id), {
      totalMinutes: Number(r.total),
      remainingMinutes: Number(r.remaining),
    });
  }
  return map;
}

/** `{ id, code }` of the given runs (source runs of re-runs). */
export async function runRefs(
  db: Db,
  runIds: (number | null | undefined)[],
): Promise<Map<number, RunRef>> {
  const ids = [...new Set(runIds.filter((v): v is number => typeof v === 'number'))];
  if (ids.length === 0) return new Map();
  const rows = await db.testRun.findMany({
    where: { id: { in: ids } },
    select: { id: true, code: true },
  });
  return new Map(rows.map((r) => [r.id, r]));
}

/** RunDTOs for the given run rows (same plan or not), order preserved. */
export async function buildRunDTOs(
  db: Db,
  rows: { run: TestRun; plan: TestPlan }[],
): Promise<RunDTO[]> {
  if (rows.length === 0) return [];
  const suiteRows = await db.suite.findMany({
    where: { id: { in: [...new Set(rows.map((r) => r.run.suiteId))] } },
    select: { id: true, name: true, prefix: true, fieldDefs: true },
  });
  const suites = new Map(suiteRows.map((s) => [s.id, s]));
  const runIds = rows.map((r) => r.run.id);
  const counts = await countsByRun(db, runIds);
  const estimates = await estimatesByRun(db, runIds);
  const sources = await runRefs(
    db,
    rows.map((r) => r.run.sourceRunId),
  );
  const users = await loadUserRefs(
    db,
    rows.map((r) => r.run.testerId),
  );
  const builds = await buildRefs(
    db,
    rows.map((r) => r.run.buildId),
  );
  return rows.map(({ run, plan }) =>
    toRunDTO(
      run,
      plan,
      suites.get(run.suiteId)!,
      counts.get(run.id)!,
      users,
      run.sourceRunId !== null ? (sources.get(run.sourceRunId) ?? null) : null,
      estimates.get(run.id),
      run.buildId !== null ? (builds.get(run.buildId) ?? null) : null,
    ),
  );
}

/** Run cases with defect/attachment counts, in execution order. */
export async function loadRunCaseDTOs(
  db: Db,
  where: { runId: number } | { ids: number[] },
): Promise<RunCaseDTO[]> {
  const rows = await db.runCase.findMany({
    where: 'ids' in where ? { id: { in: where.ids } } : { runId: where.runId },
    include: { _count: { select: { defectLinks: true } } },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  });
  if (rows.length === 0) return [];
  const files = await db.attachment.groupBy({
    by: ['entityId'],
    where: { entityType: 'run_case', entityId: { in: rows.map((r) => r.id) } },
    _count: { _all: true },
  });
  const fileCounts = new Map(files.map((f) => [f.entityId, f._count._all]));
  const users = await loadUserRefs(
    db,
    rows.flatMap((r) => [r.executedById, r.assigneeId]),
  );
  return rows.map(({ _count, ...rc }) =>
    toRunCaseDTO(rc, users, _count.defectLinks, fileCounts.get(rc.id) ?? 0),
  );
}

/** PlanDTOs with runs summary, counts, release, users and signed copy — order preserved. */
export async function buildPlanDTOs(db: Db, plans: TestPlan[]): Promise<PlanDTO[]> {
  if (plans.length === 0) return [];
  const runRows = await db.testRun.findMany({
    where: { planId: { in: plans.map((p) => p.id) } },
    include: { suite: { select: { name: true } } },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  });
  const counts = await countsByRun(
    db,
    runRows.map((r) => r.id),
  );
  const sources = await runRefs(
    db,
    runRows.map((r) => r.sourceRunId),
  );
  const releaseIds = [
    ...new Set(plans.map((p) => p.releaseId).filter((v): v is number => v !== null)),
  ];
  const releaseRows = releaseIds.length
    ? await db.release.findMany({
        where: { id: { in: releaseIds } },
        select: { id: true, name: true },
      })
    : [];
  const releases = new Map(releaseRows.map((r) => [r.id, r]));
  const signedIds = plans.map((p) => p.signedCopyId).filter((v): v is string => v !== null);
  const signedRows = signedIds.length
    ? await db.attachment.findMany({ where: { id: { in: signedIds } } })
    : [];
  const users = await loadUserRefs(db, [
    ...plans.flatMap((p) => [p.createdById, p.completedById]),
    ...signedRows.map((a) => a.createdById),
  ]);
  const signed = new Map(signedRows.map((a) => [a.id, toAttachmentDTO(a, users)]));
  return plans.map((p) =>
    toPlanDTO(p, {
      release: p.releaseId !== null ? (releases.get(p.releaseId) ?? null) : null,
      signedCopy: p.signedCopyId !== null ? (signed.get(p.signedCopyId) ?? null) : null,
      runs: runRows
        .filter((r) => r.planId === p.id)
        .map(({ suite, ...run }) =>
          toRunSummaryDTO(
            run,
            suite.name,
            counts.get(run.id)!,
            run.sourceRunId !== null ? (sources.get(run.sourceRunId) ?? null) : null,
          ),
        ),
      users,
    }),
  );
}

/**
 * The same library case in runs (newest execution first, never-executed last), optionally without
 * one run case — "other runs" of a run case and the case's run history.
 */
export async function caseRunHistory(
  db: Db,
  testCaseId: number,
  excludeRunCaseId?: number,
  limit = 50,
): Promise<CaseRunHistoryItem[]> {
  const rows = await db.runCase.findMany({
    where: {
      testCaseId,
      ...(excludeRunCaseId !== undefined && { id: { not: excludeRunCaseId } }),
    },
    select: {
      id: true,
      status: true,
      actualResult: true,
      executedById: true,
      executedAt: true,
      run: {
        select: {
          id: true,
          code: true,
          plan: {
            select: { id: true, docNo: true, title: true, release: { select: { name: true } } },
          },
        },
      },
    },
    orderBy: [{ executedAt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
    take: limit,
  });
  const users = await loadUserRefs(
    db,
    rows.map((r) => r.executedById),
  );
  return rows.map((r) => toCaseRunHistoryItem(r, users));
}

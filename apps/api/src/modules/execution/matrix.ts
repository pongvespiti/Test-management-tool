/**
 * "Summary by unit type" (spec §4): one row per run (configuration), one column per group
 * (summary group / section / case type). Also used by the plan report export.
 */
import type { RunCase, TestRun } from '@tmt/database';
import {
  emptyCounts,
  groupKeyOf,
  matrixCell,
  type MatrixDTO,
  type MatrixGroupBy,
  type StatusCounts,
} from '@tmt/shared';
import type { Db } from '../../prisma/prisma.service.js';
import { envOf } from './execution.mapper.js';

export type MatrixRun = Pick<TestRun, 'id' | 'code' | 'scenario' | 'environment'>;
export type MatrixRunCase = Pick<
  RunCase,
  'runId' | 'summaryGroup' | 'sectionPath' | 'caseType' | 'status' | 'sortOrder'
>;
/** The matrix plus the counts behind every cell (rows × groups). */
export type PlanMatrix = MatrixDTO & { counts: StatusCounts[][] };

/**
 * Builds the matrix from runs (in plan order) and their run cases (in `runId, sortOrder, id`
 * order). Groups appear in first-seen execution order: run order first, then case order.
 */
export function computePlanMatrix(
  runs: readonly MatrixRun[],
  runCases: readonly MatrixRunCase[],
  groupBy: MatrixGroupBy,
): PlanMatrix {
  if (runs.length === 0) return { groupBy, groups: [], rows: [], counts: [] };
  const runIndex = new Map(runs.map((r, i) => [r.id, i]));
  const ordered = runCases
    .filter((rc) => runIndex.has(rc.runId))
    .toSorted(
      (a, b) => runIndex.get(a.runId)! - runIndex.get(b.runId)! || a.sortOrder - b.sortOrder,
    );
  const groups: string[] = [];
  const seen = new Set<string>();
  const cells = new Map<string, StatusCounts>();
  for (const rc of ordered) {
    const key = groupKeyOf(groupBy, {
      summaryGroup: rc.summaryGroup,
      sectionPath: rc.sectionPath ?? [],
      caseType: rc.caseType,
    });
    if (!seen.has(key)) {
      seen.add(key);
      groups.push(key);
    }
    const cellKey = `${rc.runId}\u0000${key}`;
    const c = cells.get(cellKey) ?? emptyCounts();
    c[rc.status] += 1;
    cells.set(cellKey, c);
  }
  const counts = runs.map((r) =>
    groups.map((g) => cells.get(`${r.id}\u0000${g}`) ?? emptyCounts()),
  );
  return {
    groupBy,
    groups,
    rows: runs.map((r, i) => ({
      run: { id: r.id, code: r.code, scenario: r.scenario, environment: envOf(r) },
      cells: counts[i]!.map((c) => matrixCell(c)),
    })),
    counts,
  };
}

/** Loads the runs of a plan and their run cases and computes the matrix. */
export async function buildPlanMatrix(
  db: Db,
  planId: number,
  groupBy: MatrixGroupBy,
): Promise<PlanMatrix> {
  const runs = await db.testRun.findMany({
    where: { planId },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  });
  if (runs.length === 0) return computePlanMatrix([], [], groupBy);
  const runCases = await db.runCase.findMany({
    where: { runId: { in: runs.map((r) => r.id) } },
    select: {
      runId: true,
      summaryGroup: true,
      sectionPath: true,
      caseType: true,
      status: true,
      sortOrder: true,
    },
    orderBy: [{ runId: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
  });
  return computePlanMatrix(runs, runCases, groupBy);
}

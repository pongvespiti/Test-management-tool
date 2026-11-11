/**
 * "Waiting for retest": resolved defects with a fix build whose failed run cases have not been
 * tested on that build yet. The defects are found by the service; this file decides per case.
 */
import {
  defectKey,
  type NamedRef,
  type PlanStatus,
  type ResultStatus,
  type RetestCaseDTO,
  type RetestItemDTO,
  type DefectSeverity,
  type DefectStatus,
} from '@tmt/shared';
import type { Db } from '../../prisma/prisma.service.js';

/** Defects listed on the dashboard (the rest is only counted). */
export const RETEST_DEFECT_LIMIT = 10;

/** Failed results that a fix has to be verified against. */
const FAILED: readonly ResultStatus[] = ['ng', 'blocked'];

export interface RetestDefectRow {
  id: number;
  seq: number;
  title: string;
  status: DefectStatus;
  severity: DefectSeverity;
  externalKey: string | null;
  fixedInBuildId: number;
  links: Array<{
    runCase: {
      id: number;
      testCaseId: number | null;
      status: ResultStatus;
      displayId: string;
      title: string;
      run: { id: number; code: string; plan: { id: number; docNo: string; status: PlanStatus } };
    } | null;
  }>;
}

/** A run case of the same library case in a run on the fix build. */
export interface OnBuildRow {
  testCaseId: number | null;
  status: ResultStatus;
  run: { id: number; code: string; buildId: number | null };
}

/**
 * Failed cases of the defect that no run on its fix build has a result for. A case already in a
 * run on that build (not tested yet) is `scheduled`; a tested one (OK or failed again) is dropped.
 */
export function retestCasesOf(defect: RetestDefectRow, onBuild: OnBuildRow[]): RetestCaseDTO[] {
  const out: RetestCaseDTO[] = [];
  const seen = new Set<number>();
  for (const { runCase } of defect.links) {
    if (!runCase || !FAILED.includes(runCase.status) || seen.has(runCase.id)) continue;
    seen.add(runCase.id);
    const same = onBuild.filter(
      (o) =>
        runCase.testCaseId !== null &&
        o.testCaseId === runCase.testCaseId &&
        o.run.buildId === defect.fixedInBuildId,
    );
    if (same.some((o) => o.status !== 'untested')) continue;
    const open = same[0];
    out.push({
      runCaseId: runCase.id,
      displayId: runCase.displayId,
      title: runCase.title,
      runId: runCase.run.id,
      runCode: runCase.run.code,
      planId: runCase.run.plan.id,
      planDocNo: runCase.run.plan.docNo,
      planStatus: runCase.run.plan.status,
      scheduledRun: open ? { id: open.run.id, code: open.run.code } : null,
    });
  }
  return out;
}

/** Resolved defects of the builds that still await a retest (worst severity first). */
export async function retestQueue(
  db: Db,
  projectId: number,
  builds: NamedRef[],
): Promise<{ total: number; items: RetestItemDTO[] }> {
  if (builds.length === 0) return { total: 0, items: [] };
  const names = new Map(builds.map((b) => [b.id, b]));
  const defects = (await db.defect.findMany({
    where: { projectId, status: 'resolved', fixedInBuildId: { in: builds.map((b) => b.id) } },
    // Severity is a PostgreSQL enum: ascending = critical, major, minor, trivial.
    orderBy: [{ severity: 'asc' }, { resolvedAt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
    select: {
      id: true,
      seq: true,
      title: true,
      status: true,
      severity: true,
      externalKey: true,
      fixedInBuildId: true,
      links: {
        where: { runCaseId: { not: null } },
        select: {
          runCase: {
            select: {
              id: true,
              testCaseId: true,
              status: true,
              displayId: true,
              title: true,
              run: {
                select: {
                  id: true,
                  code: true,
                  plan: { select: { id: true, docNo: true, status: true } },
                },
              },
            },
          },
        },
      },
    },
  })) as unknown as RetestDefectRow[];

  const testCaseIds = new Set<number>();
  for (const d of defects) {
    for (const l of d.links) {
      if (l.runCase?.testCaseId != null && FAILED.includes(l.runCase.status)) {
        testCaseIds.add(l.runCase.testCaseId);
      }
    }
  }
  const onBuild: OnBuildRow[] = testCaseIds.size
    ? await db.runCase.findMany({
        where: {
          testCaseId: { in: [...testCaseIds] },
          run: { buildId: { in: builds.map((b) => b.id) } },
        },
        orderBy: { id: 'asc' },
        select: {
          testCaseId: true,
          status: true,
          run: { select: { id: true, code: true, buildId: true } },
        },
      })
    : [];

  const items: RetestItemDTO[] = [];
  for (const d of defects) {
    const cases = retestCasesOf(d, onBuild);
    if (cases.length === 0) continue;
    items.push({
      defect: {
        id: d.id,
        key: defectKey(d.seq),
        title: d.title,
        status: d.status,
        severity: d.severity,
        externalKey: d.externalKey,
      },
      fixedInBuild: names.get(d.fixedInBuildId)!,
      cases,
    });
  }
  return { total: items.length, items: items.slice(0, RETEST_DEFECT_LIMIT) };
}

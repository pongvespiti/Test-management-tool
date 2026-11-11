/**
 * Run report (api.md § v1.1 Execution): PractiTest-style JSON for the printable page and the Excel
 * workbook. Times are rendered in `REPORT_TIMEZONE`.
 */
import type { DefectSeverity, DefectStatus } from '@tmt/database';
import {
  defectKey,
  emptyCounts,
  passRateOf,
  progressOf,
  suggestJudgement,
  type RunCaseDTO,
  type RunReportCaseDTO,
  type RunReportDTO,
  type StatusCounts,
  type UserRef,
} from '@tmt/shared';
import { dateOnly, loadUserRefs, refOf } from '../../common/users/user-refs.js';
import type { Db } from '../../prisma/prisma.service.js';
import { envOf } from './execution.mapper.js';
import {
  buildRefs,
  estimatesByRun,
  getRunInProject,
  loadRunCaseDTOs,
  runRefs,
} from './execution.queries.js';
import { isoInZone, safeTimeZone } from './report-time.js';

type ReportDefect = RunReportDTO['defects'][number];
type CaseDefect = RunReportCaseDTO['defects'][number];

/** A defect link of one of the run's cases. */
export interface RunDefectLink {
  runCaseId: number | null;
  defect: {
    id: number;
    seq: number;
    title: string;
    status: DefectStatus;
    severity: DefectSeverity;
    externalKey: string | null;
    externalStatus: string | null;
  };
}

/** Defects per run case (no duplicates) and the distinct defects of the run, in link order. */
export function groupRunDefects(links: readonly RunDefectLink[]): {
  byRunCase: Map<number, CaseDefect[]>;
  distinct: ReportDefect[];
} {
  const byRunCase = new Map<number, CaseDefect[]>();
  const distinct = new Map<number, ReportDefect>();
  for (const { runCaseId, defect: d } of links) {
    const perCase: CaseDefect = {
      id: d.id,
      key: defectKey(d.seq),
      title: d.title,
      status: d.status,
      severity: d.severity,
      externalKey: d.externalKey,
    };
    if (!distinct.has(d.id)) distinct.set(d.id, { ...perCase, externalStatus: d.externalStatus });
    if (runCaseId === null) continue;
    const list = byRunCase.get(runCaseId) ?? [];
    if (!list.some((x) => x.id === d.id)) list.push(perCase);
    byRunCase.set(runCaseId, list);
  }
  return { byRunCase, distinct: [...distinct.values()] };
}

/** Counts, counts per top-level section (first-seen order) and the summed elapsed time. */
export function summarizeRunCases(
  rcs: readonly Pick<RunCaseDTO, 'status' | 'sectionPath' | 'elapsedSec'>[],
): {
  counts: StatusCounts;
  sections: RunReportDTO['sections'];
  actualDurationSec: number;
} {
  const counts = emptyCounts();
  const sections = new Map<string, { path: string[]; counts: StatusCounts }>();
  let actualDurationSec = 0;
  for (const rc of rcs) {
    counts[rc.status] += 1;
    actualDurationSec += rc.elapsedSec ?? 0;
    const path = rc.sectionPath.length > 0 ? [rc.sectionPath[0]!] : [];
    const key = path.join('\u0001');
    const entry = sections.get(key) ?? { path, counts: emptyCounts() };
    entry.counts[rc.status] += 1;
    sections.set(key, entry);
  }
  return { counts, sections: [...sections.values()], actualDurationSec };
}

/** Report line of a run case; the effective assignee is the explicit one, else the run's tester. */
export function toReportCase(
  rc: RunCaseDTO,
  tester: UserRef | null,
  defects: CaseDefect[],
  tz: string,
): RunReportCaseDTO {
  return {
    runCaseId: rc.id,
    displayId: rc.displayId,
    code: rc.code,
    title: rc.title,
    sectionPath: rc.sectionPath,
    caseType: rc.caseType,
    priority: rc.priority,
    status: rc.status,
    assignee: rc.assignee ?? tester,
    executedBy: rc.executedBy,
    executedAt: isoInZone(rc.executedAt, tz),
    elapsedSec: rc.elapsedSec,
    actualResult: rc.actualResult,
    resultRemark: rc.resultRemark,
    steps:
      rc.template === 'steps'
        ? rc.steps.map((s, i) => ({
            ...s,
            status: rc.stepResults?.[i]?.status ?? 'untested',
            actual: rc.stepResults?.[i]?.actual ?? '',
          }))
        : [],
    defects,
  };
}

export interface RunReportOptions {
  project: { id: number; key: string; name: string };
  runId: number;
  generatedBy: UserRef;
  timezone: string;
  now?: Date;
}

/** Builds the report of one run of the project (404 RUN_NOT_FOUND for other projects). */
export async function buildRunReport(db: Db, opts: RunReportOptions): Promise<RunReportDTO> {
  const tz = safeTimeZone(opts.timezone);
  const { run, plan } = await getRunInProject(db, opts.project.id, opts.runId);
  const suite = await db.suite.findUniqueOrThrow({
    where: { id: run.suiteId },
    select: { id: true, name: true, prefix: true },
  });
  const release =
    plan.releaseId !== null
      ? await db.release.findUnique({
          where: { id: plan.releaseId },
          select: { id: true, name: true },
        })
      : null;
  const rcs = await loadRunCaseDTOs(db, { runId: run.id });
  const tester = refOf(await loadUserRefs(db, [run.testerId]), run.testerId);
  const sourceRun =
    run.sourceRunId !== null
      ? ((await runRefs(db, [run.sourceRunId])).get(run.sourceRunId) ?? null)
      : null;
  const build =
    run.buildId !== null ? ((await buildRefs(db, [run.buildId])).get(run.buildId) ?? null) : null;
  const links = await db.defectLink.findMany({
    where: { runCase: { runId: run.id } },
    select: {
      runCaseId: true,
      defect: {
        select: {
          id: true,
          seq: true,
          title: true,
          status: true,
          severity: true,
          externalKey: true,
          externalStatus: true,
        },
      },
    },
    orderBy: { defect: { seq: 'asc' } },
  });
  const { byRunCase, distinct } = groupRunDefects(links);
  const { counts, sections, actualDurationSec } = summarizeRunCases(rcs);
  const bounds = await db.runCaseResult.aggregate({
    where: { runCase: { runId: run.id }, status: { not: 'untested' } },
    _min: { executedAt: true },
    _max: { executedAt: true },
  });
  const estimate = (await estimatesByRun(db, [run.id])).get(run.id) ?? {
    totalMinutes: 0,
    remainingMinutes: 0,
  };
  return {
    generatedAt: isoInZone(opts.now ?? new Date(), tz)!,
    generatedBy: opts.generatedBy,
    timezone: tz,
    project: opts.project,
    plan: {
      id: plan.id,
      docNo: plan.docNo,
      title: plan.title,
      status: plan.status,
      release: release ? { id: release.id, name: release.name } : null,
    },
    run: {
      id: run.id,
      code: run.code,
      scenario: run.scenario,
      build,
      suite,
      environment: envOf(run),
      tester,
      testedDate: dateOnly(run.testedDate),
      judgement: run.judgement,
      judgementNote: run.judgementNote,
      suggestedJudgement: suggestJudgement(counts),
      remark: run.remark,
      sourceRun,
      createdAt: isoInZone(run.createdAt, tz)!,
    },
    firstExecutedAt: isoInZone(bounds._min.executedAt, tz),
    lastExecutedAt: isoInZone(bounds._max.executedAt, tz),
    estimate,
    actualDurationSec,
    counts,
    passRate: passRateOf(counts),
    progress: progressOf(counts),
    sections,
    cases: rcs.map((rc) => toReportCase(rc, tester, byRunCase.get(rc.id) ?? [], tz)),
    defects: distinct,
  };
}

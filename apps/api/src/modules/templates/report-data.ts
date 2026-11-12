/**
 * Data of a plan's test report (spec §8, ADR-002) for `renderReport`: labels in export wording,
 * environment in suite-template order, summary groups from the plan matrix, step cases as
 * numbered text. Reads only run snapshots (ADR-003).
 */
import type { RunCase, TestPlan } from '@tmt/database';
import type { ReportCase, ReportData, ReportRun, ReportSession } from '@tmt/excel';
import {
  CASE_PRIORITY_LABELS,
  JUDGEMENT_LABELS,
  MATRIX_CELL_EXPORT_LABELS,
  PLAN_STATUS_LABELS,
  REQUIREMENT_SOURCE_LABELS,
  SESSION_STATUS_LABELS,
  RESULT_EXPORT_LABELS,
  defectKey,
  OPEN_DEFECT_STATUSES,
  slugKey,
  stepsToText,
  type EnvEntryDTO,
  type FieldDef,
} from '@tmt/shared';
import { dateOnly, loadUserRefs, refOf } from '../../common/users/user-refs.js';
import type { Db } from '../../prisma/prisma.service.js';
import { envOf, runStepsOf } from '../execution/execution.mapper.js';
import { buildRefs, countsByRun } from '../execution/execution.queries.js';
import { buildPlanMatrix } from '../execution/matrix.js';
import { dateInZone, safeTimeZone } from '../execution/report-time.js';
import { envTemplateOf, fieldDefsOf } from '../library/library.mapper.js';
import { needsReview } from '../requirements/requirements.service.js';
import { dimensionRows, requirementRows } from './report-extras.js';

/** Case result remark: the library remark and the tester's remark (both, when they differ). */
function remarkOf(rc: Pick<RunCase, 'caseRemark' | 'resultRemark'>): string | null {
  const parts = [rc.caseRemark, rc.resultRemark].filter(
    (v, i, all): v is string => Boolean(v) && all.indexOf(v) === i,
  );
  return parts.length ? parts.join('\n') : null;
}

/** One row of `${table:cases.*}` (1-based `no` within the run). */
export function reportCaseOf(rc: RunCase, no: number): ReportCase {
  const texts =
    rc.template === 'steps'
      ? stepsToText(runStepsOf(rc))
      : { procedure: rc.procedure ?? '', expected: rc.expected ?? '' };
  const item: ReportCase = {
    no,
    code: rc.code ?? rc.displayId,
    section: (rc.sectionPath ?? []).join(' / '),
    sectionPath: rc.sectionPath ?? [],
    title: rc.title,
    type: rc.caseType,
    precondition: rc.precondition,
    procedure: texts.procedure || null,
    expected: texts.expected || null,
    result: RESULT_EXPORT_LABELS[rc.status] ?? '',
    actual: rc.actualResult,
    remark: remarkOf(rc),
    priority: CASE_PRIORITY_LABELS[rc.priority] ?? rc.priority,
    tags: (rc.tags ?? []).join(', '),
    references: rc.references,
    estimate: rc.estimateMinutes,
  };
  for (const [key, value] of Object.entries((rc.custom ?? {}) as Record<string, string>)) {
    item[`cf_${key}`] = value;
  }
  return item;
}

/** Environment entries in the suite template's order, other labels after them. */
export function orderedEnv(entries: EnvEntryDTO[], template: string[]): EnvEntryDTO[] {
  const rank = new Map(template.map((l, i) => [l.toLowerCase(), i]));
  return entries
    .map((e, i) => ({ e, r: rank.get(e.label.toLowerCase()) ?? template.length + i }))
    .toSorted((a, b) => a.r - b.r)
    .map((x) => x.e);
}

export async function buildPlanReportData(
  db: Db,
  opts: { project: { name: string; key: string }; plan: TestPlan; timezone: string; now?: Date },
): Promise<ReportData> {
  const { plan } = opts;
  const tz = safeTimeZone(opts.timezone);
  const release =
    plan.releaseId !== null
      ? await db.release.findUnique({ where: { id: plan.releaseId }, select: { name: true } })
      : null;
  const runs = await db.testRun.findMany({
    where: { planId: plan.id },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  });
  const runIds = runs.map((r) => r.id);
  const suiteRows = runIds.length
    ? await db.suite.findMany({ where: { id: { in: [...new Set(runs.map((r) => r.suiteId))] } } })
    : [];
  const suiteById = new Map(suiteRows.map((s) => [s.id, s]));
  const builds = await buildRefs(
    db,
    runs.map((r) => r.buildId),
  );
  const users = await loadUserRefs(
    db,
    runs.map((r) => r.testerId),
  );
  const counts = await countsByRun(db, runIds);
  const matrix = await buildPlanMatrix(db, plan.id, 'summary');
  const cellsByRun = new Map(matrix.rows.map((row) => [row.run.id, row.cells]));
  const caseRows = runIds.length
    ? await db.runCase.findMany({
        where: { runId: { in: runIds } },
        orderBy: [{ runId: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
      })
    : [];

  const reportRuns: ReportRun[] = runs.map((run) => {
    const suite = suiteById.get(run.suiteId);
    const envList = orderedEnv(envOf(run), suite ? envTemplateOf(suite) : []);
    const env: Record<string, string> = {};
    for (const e of envList) env[slugKey(e.label)] = e.value;
    const groups: ReportRun['groups'] = {};
    const cells = cellsByRun.get(run.id) ?? [];
    matrix.groups.forEach((g, i) => {
      const cell = cells[i];
      groups[`g_${slugKey(g)}`] = cell ? MATRIX_CELL_EXPORT_LABELS[cell] : '';
    });
    return {
      code: run.code,
      scenario: run.scenario,
      build: (run.buildId !== null ? builds.get(run.buildId)?.name : null) ?? null,
      tester: refOf(users, run.testerId)?.displayName ?? null,
      testedDate: dateOnly(run.testedDate),
      judgement: run.judgement ? JUDGEMENT_LABELS[run.judgement] : null,
      judgementNote: run.judgementNote,
      remark: run.remark,
      envList,
      env,
      groups,
      counts: counts.get(run.id)!,
      cases: caseRows.filter((rc) => rc.runId === run.id).map((rc, i) => reportCaseOf(rc, i + 1)),
    };
  });

  return {
    today: dateInZone(opts.now ?? new Date(), tz),
    project: opts.project,
    release: release ? { name: release.name } : null,
    plan: {
      docNo: plan.docNo,
      title: plan.title,
      purpose: plan.purpose,
      testMethod: plan.testMethod,
      judgementCriteria: plan.judgementCriteria,
      rawDataPath: plan.rawDataPath,
      overallJudgement: plan.overallJudgement ? JUDGEMENT_LABELS[plan.overallJudgement] : null,
      judgementNote: plan.judgementNote,
      status: PLAN_STATUS_LABELS[plan.status] ?? plan.status,
    },
    groups: matrix.groups,
    runs: reportRuns,
    requirements: await requirementTable(db, plan.projectId, caseRows),
    dimensions: dimensionRows(reportRuns),
    sessions: await sessionTable(db, plan.projectId, plan.releaseId, tz),
  };
}

/** Requirements tested by the plan's case rows, with their results and open defects. */
async function requirementTable(db: Db, projectId: number, caseRows: RunCase[]) {
  if (caseRows.length === 0) return [];
  const [requirements, links, defectLinks] = await Promise.all([
    db.requirement.findMany({ where: { projectId } }),
    db.requirementCase.findMany({
      where: { requirement: { projectId } },
      select: { requirementId: true, testCaseId: true },
    }),
    db.defectLink.findMany({
      where: {
        runCaseId: { in: caseRows.map((rc) => rc.id) },
        defect: { status: { in: [...OPEN_DEFECT_STATUSES] } },
      },
      select: { runCaseId: true, defect: { select: { seq: true } } },
      orderBy: { defect: { seq: 'asc' } },
    }),
  ]);
  const linked = new Map<number, Set<number>>();
  for (const l of links) {
    const set = linked.get(l.requirementId) ?? new Set<number>();
    set.add(l.testCaseId);
    linked.set(l.requirementId, set);
  }
  const defectKeys = new Map<number, string[]>();
  for (const l of defectLinks) {
    if (l.runCaseId === null) continue;
    defectKeys.set(l.runCaseId, [...(defectKeys.get(l.runCaseId) ?? []), defectKey(l.defect.seq)]);
  }
  return requirementRows(
    requirements.map((r) => ({
      id: r.id,
      key: r.key,
      title: r.title,
      source: REQUIREMENT_SOURCE_LABELS[r.source] ?? r.source,
      externalStatus: r.externalStatus,
      needsReview: needsReview(r),
    })),
    linked,
    caseRows,
    defectKeys,
  );
}

/** Exploratory sessions of the plan's release (none without a release), oldest first. */
async function sessionTable(
  db: Db,
  projectId: number,
  releaseId: number | null,
  tz: string,
): Promise<ReportSession[]> {
  if (releaseId === null) return [];
  const sessions = await db.exploratorySession.findMany({
    where: { projectId, releaseId },
    orderBy: { seq: 'asc' },
    include: {
      owner: { select: { displayName: true } },
      build: { select: { name: true } },
      _count: { select: { notes: true, defects: true } },
    },
  });
  const day = (d: Date | null) => (d ? dateInZone(d, tz) : null);
  return sessions.map((s) => ({
    key: `EXP-${s.seq}`,
    title: s.title,
    status: SESSION_STATUS_LABELS[s.status] ?? s.status,
    owner: s.owner?.displayName ?? null,
    build: s.build?.name ?? null,
    timeBox: s.timeBoxMinutes,
    started: day(s.startedAt),
    ended: day(s.endedAt),
    notes: s._count.notes,
    defects: s._count.defects,
    references: s.references,
    summary: s.summary,
  }));
}

/**
 * Custom fields, environment labels and summary groups a template can refer to: of one suite, or
 * of every non-archived suite of the project (fields de-duplicated by key, labels by slug).
 */
export async function templateContext(
  db: Db,
  projectId: number,
  suiteId: number | null,
): Promise<{ fieldDefs: FieldDef[]; envLabels: string[]; groups: string[] }> {
  const rows = await db.suite.findMany({
    where: suiteId !== null ? { projectId, id: suiteId } : { projectId, isArchived: false },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  });
  const fieldDefs: FieldDef[] = [];
  const envLabels: string[] = [];
  const seenKeys = new Set<string>();
  const seenSlugs = new Set<string>();
  for (const s of rows) {
    for (const d of fieldDefsOf(s)) {
      if (!seenKeys.has(d.key)) {
        seenKeys.add(d.key);
        fieldDefs.push(d);
      }
    }
    for (const l of envTemplateOf(s)) {
      if (!seenSlugs.has(slugKey(l))) {
        seenSlugs.add(slugKey(l));
        envLabels.push(l);
      }
    }
  }
  const groups = rows.length
    ? (
        await db.testCase.findMany({
          where: {
            suiteId: { in: rows.map((s) => s.id) },
            isDeleted: false,
            summaryGroup: { not: null },
          },
          distinct: ['summaryGroup'],
          select: { summaryGroup: true },
          orderBy: { summaryGroup: 'asc' },
        })
      ).map((r) => r.summaryGroup!)
    : [];
  return { fieldDefs, envLabels, groups };
}

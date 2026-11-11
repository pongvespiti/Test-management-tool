import { Injectable } from '@nestjs/common';
import { Prisma } from '@tmt/database';
import {
  defectKey,
  envKey,
  displayId,
  countsFromRows,
  paramsToFilters,
  type CoverageRowDTO,
  type DefectReportDTO,
  type ReleaseComparisonRowDTO,
  type ReportDefectsQuery,
  type CompareDTO,
  type CompareSideDTO,
  type ReopenReportDTO,
  type ScheduleDTO,
  type ReportCompareQuery,
  type ReportSummaryQuery,
  type ReportTrendDTO,
  type ReportTrendQuery,
  type ResultStatus,
  type SummaryDTO,
  type TraceabilityDTO,
  type WorkloadRowDTO,
} from '@tmt/shared';
import { dimensionsOf } from '../dimensions/dimensions.service.js';
import { envOf } from '../execution/execution.mapper.js';
import { notFound } from '../../common/errors/app.exception.js';
import { dateOnly, loadUserRefs, refOf } from '../../common/users/user-refs.js';
import { AppConfig } from '../../config/app-config.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { assertReleaseInProject, getPlanInProject } from '../execution/execution.queries.js';
import {
  byName,
  coverageRows,
  releaseComparisonRows,
  summarizeDefects,
  trendReportOf,
  workloadRows,
  type WorkloadAggregate,
} from './report-compute.js';
import { compareResults, type SideResult } from './compare.js';
import { reopenReportOf, type ReopenDefect } from './reopens.js';
import { summaryOf, type SummaryRun } from './summary.js';
import { traceabilityOf } from './traceability.js';
import { addDays, dayRange, localDate, startOfLocalDay } from './report-dates.js';

/** Plans in scope: one plan (wins), the plans of a release, or the whole project. */
export interface ReportScope {
  projectId: number;
  planId?: number;
  releaseId?: number;
}

type TraceDefectStatus = TraceabilityDTO['rows'][number]['defects'][number]['status'];
type TraceDefectSeverity = TraceabilityDTO['rows'][number]['defects'][number]['severity'];

/** Library cases listed in the defect report. */
const TOP_CASES = 10;

/** Prisma filter of the plans in scope. */
export function planWhere(scope: ReportScope): Prisma.TestPlanWhereInput {
  if (scope.planId !== undefined) return { projectId: scope.projectId, id: scope.planId };
  if (scope.releaseId !== undefined) {
    return { projectId: scope.projectId, releaseId: scope.releaseId };
  }
  return { projectId: scope.projectId };
}

/** The same scope as SQL on the `test_plans p` alias. */
export function planScopeSql(scope: ReportScope): Prisma.Sql {
  const conds = [Prisma.sql`p.project_id = ${scope.projectId}`];
  if (scope.planId !== undefined) conds.push(Prisma.sql`p.id = ${scope.planId}`);
  else if (scope.releaseId !== undefined) conds.push(Prisma.sql`p.release_id = ${scope.releaseId}`);
  return Prisma.join(conds, ' AND ');
}

/**
 * Reports (api.md § Reports, ADR-009): computed on request from the results history, days in
 * REPORT_TIMEZONE. Aggregations that Prisma cannot group (by joined columns, filtered counts) are
 * plain SQL with bound parameters.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  /**
   * Validates the scope ids against the project: an unknown plan is 404 PLAN_NOT_FOUND, a release
   * of another project 422 BAD_RELEASE. `planId` wins over `releaseId`.
   */
  async resolveScope(
    projectId: number,
    q: { planId?: number; releaseId?: number },
  ): Promise<ReportScope> {
    const db = this.prisma.db;
    if (q.planId !== undefined) {
      await getPlanInProject(db, projectId, q.planId);
      return { projectId, planId: q.planId };
    }
    if (q.releaseId !== undefined) {
      await assertReleaseInProject(db, projectId, q.releaseId);
      return { projectId, releaseId: q.releaseId };
    }
    return { projectId };
  }

  /** Daily results, burndown and pass rate of the last `days` days (today included). */
  async trend(projectId: number, q: ReportTrendQuery, now = new Date()): Promise<ReportTrendDTO> {
    const db = this.prisma.db;
    const tz = this.config.reportTimezone;
    const plan = planWhere(await this.resolveScope(projectId, q));
    const runCases = await db.runCase.findMany({
      where: { run: { plan } },
      select: { id: true, run: { select: { createdAt: true } } },
    });
    const results = await db.runCaseResult.findMany({
      where: { runCase: { run: { plan } } },
      select: { runCaseId: true, status: true, executedAt: true },
      orderBy: [{ executedAt: 'asc' }, { id: 'asc' }],
    });
    return trendReportOf(
      runCases.map((rc) => ({ id: rc.id, runCreatedAt: rc.run.createdAt })),
      results,
      dayRange(localDate(now, tz), q.days),
      tz,
    );
  }

  /** Run cases of not-completed plans per effective assignee (assignee, else run tester). */
  async workload(
    projectId: number,
    q: { planId?: number; releaseId?: number },
    now = new Date(),
  ): Promise<WorkloadRowDTO[]> {
    const db = this.prisma.db;
    const tz = this.config.reportTimezone;
    const scope = await this.resolveScope(projectId, q);
    const since = startOfLocalDay(addDays(localDate(now, tz), -6), tz);
    // The instant goes in as ISO text: a bound Date would be read in the session time zone.
    const rows = await db.$queryRaw<WorkloadAggregate[]>`
      SELECT coalesce(rc.assignee_id, r.tester_id) AS "userId",
             count(*)::int AS "runCases",
             (count(*) FILTER (WHERE rc.status = 'untested'))::int AS "untested",
             (count(*) FILTER (WHERE rc.status = 'ng'))::int AS "ng",
             coalesce(sum(rc.estimate_minutes) FILTER (WHERE rc.status = 'untested'), 0)::int
               AS "remainingMinutes",
             (count(*) FILTER (WHERE rc.status <> 'untested'
               AND rc.executed_at >= ${since.toISOString()}::timestamptz))::int AS "executedRecently"
      FROM run_cases rc
      JOIN test_runs r ON r.id = rc.run_id
      JOIN test_plans p ON p.id = r.plan_id
      WHERE ${planScopeSql(scope)} AND p.status <> 'completed'
      GROUP BY 1`;
    const users = await loadUserRefs(
      db,
      rows.map((r) => r.userId),
    );
    return workloadRows(rows, users);
  }

  /** Defects by status/severity, open trend, open per assignee and the most affected cases. */
  async defects(
    projectId: number,
    q: ReportDefectsQuery,
    now = new Date(),
  ): Promise<DefectReportDTO> {
    const db = this.prisma.db;
    const tz = this.config.reportTimezone;
    await assertReleaseInProject(db, projectId, q.releaseId);
    const rows = await db.defect.findMany({
      where: { projectId, ...(q.releaseId !== undefined && { releaseId: q.releaseId }) },
      select: {
        status: true,
        severity: true,
        assigneeId: true,
        createdAt: true,
        resolvedAt: true,
        closedAt: true,
      },
    });
    const { openByAssignee, ...summary } = summarizeDefects(
      rows,
      dayRange(localDate(now, tz), q.days),
      tz,
    );
    const users = await loadUserRefs(db, openByAssignee.keys());
    const byAssignee = [...openByAssignee]
      .map(([id, open]) => ({ user: refOf(users, id), open }))
      .toSorted((a, b) => b.open - a.open || byName(a.user, b.user));
    const release =
      q.releaseId !== undefined ? Prisma.sql`AND d.release_id = ${q.releaseId}` : Prisma.empty;
    const top = await db.$queryRaw<
      { testCaseId: number; seq: number; title: string; prefix: string; defectCount: number }[]
    >`
      SELECT tc.id AS "testCaseId", tc.seq, tc.title, s.prefix,
             count(DISTINCT dl.defect_id)::int AS "defectCount"
      FROM defect_links dl
      JOIN defects d ON d.id = dl.defect_id
      JOIN test_cases tc ON tc.id = dl.test_case_id
      JOIN suites s ON s.id = tc.suite_id
      WHERE d.project_id = ${projectId} ${release} AND NOT tc.is_deleted
      GROUP BY tc.id, tc.seq, tc.title, s.prefix
      ORDER BY "defectCount" DESC, tc.id ASC
      LIMIT ${TOP_CASES}`;
    return {
      ...summary,
      byAssignee,
      topCases: top.map((c) => ({
        testCaseId: c.testCaseId,
        displayId: displayId(c.prefix, c.seq),
        title: c.title,
        defectCount: c.defectCount,
      })),
    };
  }

  /** Release comparison, newest release first (start date, undated last). */
  async releases(projectId: number): Promise<ReleaseComparisonRowDTO[]> {
    const db = this.prisma.db;
    const releases = await db.release.findMany({
      where: { projectId },
      orderBy: [{ startDate: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
    });
    if (releases.length === 0) return [];
    const inReleases = { projectId, releaseId: { not: null } };
    const plans = await db.testPlan.groupBy({
      by: ['releaseId', 'overallJudgement'],
      where: inReleases,
      _count: { _all: true },
    });
    const defects = await db.defect.groupBy({
      by: ['releaseId', 'status'],
      where: inReleases,
      _count: { _all: true },
    });
    const runs = await db.$queryRaw<{ releaseId: number; n: number }[]>`
      SELECT p.release_id AS "releaseId", count(*)::int AS n
      FROM test_runs r
      JOIN test_plans p ON p.id = r.plan_id
      WHERE p.project_id = ${projectId} AND p.release_id IS NOT NULL
      GROUP BY p.release_id`;
    const runCases = await db.$queryRaw<{ releaseId: number; status: string; n: number }[]>`
      SELECT p.release_id AS "releaseId", rc.status::text AS status, count(*)::int AS n
      FROM run_cases rc
      JOIN test_runs r ON r.id = rc.run_id
      JOIN test_plans p ON p.id = r.plan_id
      WHERE p.project_id = ${projectId} AND p.release_id IS NOT NULL
      GROUP BY p.release_id, rc.status`;
    return releaseComparisonRows(releases, {
      plans: plans.map((p) => ({
        releaseId: p.releaseId!,
        judgement: p.overallJudgement,
        n: p._count._all,
      })),
      runs,
      runCases,
      defects: defects.map((d) => ({
        releaseId: d.releaseId!,
        status: d.status,
        n: d._count._all,
      })),
    });
  }

  /** Coverage per non-archived suite from the latest run case of every library case in scope. */
  async coverage(projectId: number, releaseId?: number): Promise<CoverageRowDTO[]> {
    const db = this.prisma.db;
    await assertReleaseInProject(db, projectId, releaseId);
    const suites = await db.suite.findMany({
      where: { projectId, isArchived: false },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }],
      select: { id: true, name: true, prefix: true },
    });
    if (suites.length === 0) return [];
    const cases = await db.testCase.findMany({
      where: {
        suiteId: { in: suites.map((s) => s.id) },
        isDeleted: false,
        status: { not: 'deprecated' },
      },
      select: { id: true, suiteId: true, priority: true },
    });
    const release =
      releaseId !== undefined ? Prisma.sql`AND p.release_id = ${releaseId}` : Prisma.empty;
    // Latest run case (newest run) of each library case within the scope.
    const latest = await db.$queryRaw<{ testCaseId: number; status: string }[]>`
      SELECT DISTINCT ON (rc.test_case_id) rc.test_case_id AS "testCaseId", rc.status::text AS status
      FROM run_cases rc
      JOIN test_runs r ON r.id = rc.run_id
      JOIN test_plans p ON p.id = r.plan_id
      WHERE p.project_id = ${projectId} AND rc.test_case_id IS NOT NULL ${release}
      ORDER BY rc.test_case_id, r.created_at DESC, r.id DESC, rc.id DESC`;
    return coverageRows(suites, cases, new Map(latest.map((r) => [r.testCaseId, r.status])));
  }

  /**
   * Traceability: library cases grouped by the references in their `refs` text, with the latest
   * result in scope and the defects linked to the cases.
   */
  async traceability(projectId: number, releaseId?: number): Promise<TraceabilityDTO> {
    const db = this.prisma.db;
    await assertReleaseInProject(db, projectId, releaseId);
    const cases = await db.testCase.findMany({
      where: {
        suite: { projectId, isArchived: false },
        isDeleted: false,
        status: { not: 'deprecated' },
      },
      orderBy: [{ suite: { sortOrder: 'asc' } }, { suiteId: 'asc' }, { seq: 'asc' }],
      select: {
        id: true,
        seq: true,
        title: true,
        references: true,
        suite: { select: { id: true, name: true, prefix: true } },
      },
    });
    const requirementRows = await db.requirement.findMany({
      where: { projectId },
      select: {
        id: true,
        key: true,
        title: true,
        source: true,
        externalUrl: true,
        externalStatus: true,
        cases: { select: { testCaseId: true } },
      },
    });
    if (cases.length === 0 && requirementRows.length === 0)
      return { rows: [], casesWithoutReference: 0, totalCases: 0 };
    const release =
      releaseId !== undefined ? Prisma.sql`AND p.release_id = ${releaseId}` : Prisma.empty;
    const latest = await db.$queryRaw<{ testCaseId: number; status: ResultStatus }[]>`
      SELECT DISTINCT ON (rc.test_case_id) rc.test_case_id AS "testCaseId", rc.status::text AS status
      FROM run_cases rc
      JOIN test_runs r ON r.id = rc.run_id
      JOIN test_plans p ON p.id = r.plan_id
      WHERE p.project_id = ${projectId} AND rc.test_case_id IS NOT NULL ${release}
      ORDER BY rc.test_case_id, r.created_at DESC, r.id DESC, rc.id DESC`;
    const defectRelease =
      releaseId !== undefined ? Prisma.sql`AND d.release_id = ${releaseId}` : Prisma.empty;
    const defects = await db.$queryRaw<
      {
        testCaseId: number;
        id: number;
        seq: number;
        title: string;
        status: TraceDefectStatus;
        severity: TraceDefectSeverity;
      }[]
    >`
      SELECT DISTINCT dl.test_case_id AS "testCaseId", d.id, d.seq, d.title,
             d.status::text AS status, d.severity::text AS severity
      FROM defect_links dl
      JOIN defects d ON d.id = dl.defect_id
      WHERE d.project_id = ${projectId} AND dl.test_case_id IS NOT NULL ${defectRelease}`;
    return traceabilityOf(
      cases.map((c) => ({
        id: c.id,
        seq: c.seq,
        title: c.title,
        refs: c.references,
        suite: c.suite,
      })),
      new Map(latest.map((r) => [r.testCaseId, r.status])),
      defects,
      defectKey,
      requirementRows.map((r) => ({
        id: r.id,
        key: r.key,
        title: r.title,
        source: r.source,
        externalUrl: r.externalUrl,
        externalStatus: r.externalStatus,
        linkedCaseIds: new Set(r.cases.map((c) => c.testCaseId)),
      })),
    );
  }

  /**
   * Result counts of the runs in scope, filtered and grouped by environment dimensions (Platform,
   * OS ver, Unit model …) and the built-ins topic / release / build. One run is one environment, so
   * every run case counts once, in the cell of its run.
   */
  async summary(projectId: number, q: ReportSummaryQuery): Promise<SummaryDTO> {
    const db = this.prisma.db;
    const plan = planWhere(await this.resolveScope(projectId, q));
    const [runs, grouped, project] = await Promise.all([
      db.testRun.findMany({
        where: { plan },
        orderBy: { id: 'asc' },
        select: {
          id: true,
          planId: true,
          code: true,
          environment: true,
          suite: { select: { topic: true } },
          plan: { select: { release: { select: { name: true } } } },
          build: { select: { name: true } },
        },
      }),
      db.runCase.groupBy({
        by: ['runId', 'status'],
        where: { run: { plan } },
        _count: { _all: true },
      }),
      db.project.findUniqueOrThrow({ where: { id: projectId }, select: { envDimensions: true } }),
    ]);
    const countsByRun = new Map<number, { status: string; count: number }[]>();
    for (const g of grouped) {
      const list = countsByRun.get(g.runId) ?? [];
      list.push({ status: g.status, count: g._count._all });
      countsByRun.set(g.runId, list);
    }
    const rows: SummaryRun[] = runs.map((r) => ({
      id: r.id,
      planId: r.planId,
      code: r.code,
      environment: envOf(r),
      topic: r.suite.topic,
      release: r.plan.release?.name ?? null,
      build: r.build?.name ?? null,
      counts: countsFromRows(countsByRun.get(r.id) ?? []),
    }));
    return summaryOf(rows, {
      rows: q.rows ?? null,
      cols: q.cols ?? null,
      filters: paramsToFilters(q.f),
      labelOrder: dimensionsOf(project.envDimensions).map((d) => d.label),
    });
  }

  /**
   * How often defects were reopened, counted from the status changes in the activity log, per
   * release, build (found in), platform and topic (of the first run case a defect is linked to).
   */
  async reopens(projectId: number, releaseId?: number): Promise<ReopenReportDTO> {
    const db = this.prisma.db;
    await assertReleaseInProject(db, projectId, releaseId);
    const rows = await db.defect.findMany({
      where: { projectId, ...(releaseId !== undefined && { releaseId }) },
      orderBy: { seq: 'asc' },
      select: {
        id: true,
        seq: true,
        title: true,
        status: true,
        severity: true,
        release: { select: { name: true } },
        foundInBuild: { select: { name: true } },
        links: {
          where: { runCaseId: { not: null } },
          orderBy: { id: 'asc' },
          take: 1,
          select: {
            runCase: {
              select: {
                run: { select: { environment: true, suite: { select: { topic: true } } } },
              },
            },
          },
        },
      },
    });
    const events = await db.$queryRaw<{ defectId: number; at: Date }[]>`
      SELECT entity_id AS "defectId", created_at AS "at"
      FROM activity_log
      WHERE project_id = ${projectId} AND entity_type = 'defect' AND action = 'transitioned'
        AND data->>'to' = 'reopened' AND entity_id IS NOT NULL`;
    const defects: ReopenDefect[] = rows.map((d) => {
      const run = d.links[0]?.runCase?.run;
      const platform = run
        ? envOf(run)
            .find((e) => envKey(e.label) === envKey('Platform'))
            ?.value.trim()
        : undefined;
      return {
        id: d.id,
        key: defectKey(d.seq),
        title: d.title,
        status: d.status,
        severity: d.severity,
        release: d.release?.name ?? null,
        build: d.foundInBuild?.name ?? null,
        platform: platform || null,
        topic: run?.suite.topic ?? null,
      };
    });
    return reopenReportOf(defects, events);
  }

  /** Runs (newest first) and builds (newest first) that can be compared. */
  async compareSides(projectId: number): Promise<CompareSideDTO[]> {
    const db = this.prisma.db;
    const [runs, builds] = await Promise.all([
      db.testRun.findMany({
        where: { plan: { projectId } },
        orderBy: { id: 'desc' },
        select: {
          id: true,
          code: true,
          environment: true,
          suite: { select: { name: true } },
          plan: { select: { docNo: true, release: { select: { name: true } } } },
        },
      }),
      db.build.findMany({
        where: { release: { projectId } },
        orderBy: { id: 'desc' },
        select: {
          id: true,
          name: true,
          release: { select: { name: true } },
          _count: { select: { runs: true } },
        },
      }),
    ]);
    return [
      ...runs.map((r) => ({
        value: `run:${r.id}`,
        kind: 'run' as const,
        id: r.id,
        label: `${r.code} · ${r.suite.name}`,
        detail: [
          r.plan.docNo,
          r.plan.release?.name,
          ...envOf(r)
            .map((e) => e.value.trim())
            .filter(Boolean),
        ]
          .filter(Boolean)
          .join(' · '),
      })),
      ...builds.map((b) => ({
        value: `build:${b.id}`,
        kind: 'build' as const,
        id: b.id,
        label: `${b.release.name} / ${b.name}`,
        detail: `${b._count.runs} ${b._count.runs === 1 ? 'run' : 'runs'}`,
      })),
    ];
  }

  /**
   * Results of one case per library case on two sides — a run, or the latest result of each case
   * over the runs of a build — and what changed from the base to the target.
   */
  async compare(projectId: number, q: ReportCompareQuery): Promise<CompareDTO> {
    const sides = await this.compareSides(projectId);
    const find = (value: string) => {
      const side = sides.find((s) => s.value === value);
      if (!side)
        throw notFound(
          value.startsWith('run:') ? 'Run' : 'Build',
          value.startsWith('run:') ? 'RUN_NOT_FOUND' : 'BUILD_NOT_FOUND',
        );
      return side;
    };
    const base = find(q.base);
    const target = find(q.target);
    const [baseResults, targetResults] = await Promise.all([
      this.sideResults(base),
      this.sideResults(target),
    ]);
    return { base, target, ...compareResults(baseResults, targetResults) };
  }

  private sideResults(side: CompareSideDTO): Promise<SideResult[]> {
    const db = this.prisma.db;
    if (side.kind === 'run') {
      return db.$queryRaw<SideResult[]>`
        SELECT rc.test_case_id AS "testCaseId", rc.display_id AS "displayId", rc.title,
               s.name AS suite, rc.status::text AS status
        FROM run_cases rc
        JOIN test_runs r ON r.id = rc.run_id
        JOIN suites s ON s.id = r.suite_id
        WHERE r.id = ${side.id} AND rc.test_case_id IS NOT NULL`;
    }
    return db.$queryRaw<SideResult[]>`
      SELECT DISTINCT ON (rc.test_case_id) rc.test_case_id AS "testCaseId",
             rc.display_id AS "displayId", rc.title, s.name AS suite, rc.status::text AS status
      FROM run_cases rc
      JOIN test_runs r ON r.id = rc.run_id
      JOIN suites s ON s.id = r.suite_id
      WHERE r.build_id = ${side.id} AND rc.test_case_id IS NOT NULL
      ORDER BY rc.test_case_id, r.created_at DESC, r.id DESC, rc.id DESC`;
  }

  /** Runs of the release (or the project) with their planned window, topic and tester. */
  async schedule(projectId: number, releaseId?: number): Promise<ScheduleDTO> {
    const db = this.prisma.db;
    await assertReleaseInProject(db, projectId, releaseId);
    const plan = planWhere({ projectId, releaseId });
    const [release, runs, grouped] = await Promise.all([
      releaseId === undefined
        ? null
        : db.release.findUniqueOrThrow({
            where: { id: releaseId },
            select: { id: true, name: true, startDate: true, endDate: true },
          }),
      db.testRun.findMany({
        where: { plan },
        orderBy: [{ planId: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          planId: true,
          code: true,
          dueDate: true,
          testerId: true,
          suite: { select: { name: true, topic: true } },
          plan: { select: { docNo: true, title: true, startDate: true, dueDate: true } },
        },
      }),
      db.runCase.groupBy({
        by: ['runId', 'status'],
        where: { run: { plan } },
        _count: { _all: true },
      }),
    ]);
    const users = await loadUserRefs(
      db,
      runs.map((r) => r.testerId),
    );
    const byRun = new Map<number, { status: string; count: number }[]>();
    for (const g of grouped) {
      const list = byRun.get(g.runId) ?? [];
      list.push({ status: g.status, count: g._count._all });
      byRun.set(g.runId, list);
    }
    return {
      release: release && {
        id: release.id,
        name: release.name,
        startDate: dateOnly(release.startDate),
        endDate: dateOnly(release.endDate),
      },
      items: runs.map((r) => ({
        runId: r.id,
        planId: r.planId,
        planDocNo: r.plan.docNo,
        planTitle: r.plan.title,
        code: r.code,
        suite: r.suite.name,
        topic: r.suite.topic,
        tester: refOf(users, r.testerId),
        start: dateOnly(r.plan.startDate),
        due: dateOnly(r.dueDate ?? r.plan.dueDate),
        counts: countsFromRows(byRun.get(r.id) ?? []),
      })),
    };
  }
}

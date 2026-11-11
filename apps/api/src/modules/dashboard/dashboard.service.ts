import { Injectable } from '@nestjs/common';
import { Prisma, type Release } from '@tmt/database';
import {
  addCounts,
  DEFECT_SEVERITIES,
  emptyCounts,
  OPEN_DEFECT_STATUSES,
  type BuildSummaryDTO,
  type DashboardDTO,
  type DefectSeverity,
  type PlanStatus,
} from '@tmt/shared';
import { unprocessable } from '../../common/errors/app.exception.js';
import { dateOnly, loadUserRefs } from '../../common/users/user-refs.js';
import { AppConfig } from '../../config/app-config.js';
import { PrismaService, type Db } from '../../prisma/prisma.service.js';
import { buildDefectListItems, defectRefsByRunCase } from '../defects/defects.queries.js';
import { buildPlanDTOs, countsByRun } from '../execution/execution.queries.js';
import { toReleaseDTO } from '../projects/projects.mapper.js';
import { toAttentionItem } from './dashboard.mapper.js';
import { PACE_DAYS, readinessOf } from './readiness.js';
import { retestQueue } from './retest.js';
import { addDays, localDate, startOfLocalDay } from '../reports/report-dates.js';

const ATTENTION_LIMIT = 10;
const OPEN_DEFECT_LIMIT = 10;

/** Picks the dashboard release: the requested one (422 BAD_RELEASE), else newest active, else newest. */
export function pickRelease(releases: Release[], releaseId: number | undefined): Release | null {
  if (releaseId !== undefined) {
    const found = releases.find((r) => r.id === releaseId);
    if (!found) throw unprocessable('BAD_RELEASE', 'The release does not belong to this project');
    return found;
  }
  return releases.find((r) => r.status === 'active') ?? releases[0] ?? null;
}

/** Open defects of the project; with a release: assigned to it or found in one of its plans. */
export function openDefectsWhere(
  projectId: number,
  release: Pick<Release, 'id'> | null,
): Prisma.DefectWhereInput {
  return {
    projectId,
    status: { in: [...OPEN_DEFECT_STATUSES] },
    ...(release && {
      OR: [
        { releaseId: release.id },
        { links: { some: { runCase: { run: { plan: { releaseId: release.id } } } } } },
      ],
    }),
  };
}

/** Results and open defects of every build of the release (newest build first). */
async function buildSummaries(db: Db, release: Release | null): Promise<BuildSummaryDTO[]> {
  if (!release) return [];
  const builds = await db.build.findMany({
    where: { releaseId: release.id },
    orderBy: [{ builtDate: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
    select: { id: true, name: true },
  });
  if (builds.length === 0) return [];
  const buildIds = builds.map((b) => b.id);
  const runs = await db.testRun.findMany({
    where: { buildId: { in: buildIds } },
    select: { id: true, buildId: true },
  });
  const counts = await countsByRun(
    db,
    runs.map((r) => r.id),
  );
  const open = await db.defect.groupBy({
    by: ['foundInBuildId'],
    where: { foundInBuildId: { in: buildIds }, status: { in: [...OPEN_DEFECT_STATUSES] } },
    _count: { _all: true },
  });
  const openByBuild = new Map(open.map((o) => [o.foundInBuildId, o._count._all]));
  return builds.map((build) => {
    const own = runs.filter((r) => r.buildId === build.id);
    return {
      build,
      runCount: own.length,
      counts: own.reduce(
        (sum, r) => addCounts(sum, counts.get(r.id) ?? emptyCounts()),
        emptyCounts(),
      ),
      openDefects: openByBuild.get(build.id) ?? 0,
    };
  });
}

/** Project dashboard of one release (all plans when the project has no releases). */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  /** Untested work left in the not-completed plans and how much was tested in the last 7 days. */
  private async readiness(
    planIds: number[],
    release: Release | null,
    now: Date,
  ): Promise<DashboardDTO['readiness']> {
    const tz = this.config.reportTimezone;
    const today = localDate(now, tz);
    const since = startOfLocalDay(addDays(today, -(PACE_DAYS - 1)), tz);
    const [row] = planIds.length
      ? await this.prisma.db.$queryRaw<
          Array<{ total: number; remaining: number; minutes: number; recent: number }>
        >`
          SELECT count(*)::int AS "total",
                 (count(*) FILTER (WHERE rc.status = 'untested'))::int AS "remaining",
                 coalesce(sum(rc.estimate_minutes) FILTER (WHERE rc.status = 'untested'), 0)::int
                   AS "minutes",
                 (count(*) FILTER (WHERE rc.status <> 'untested'
                   AND rc.executed_at >= ${since.toISOString()}::timestamptz))::int AS "recent"
          FROM run_cases rc
          JOIN test_runs r ON r.id = rc.run_id
          WHERE r.plan_id IN (${Prisma.join(planIds)})`
      : [];
    return readinessOf({
      total: row?.total ?? 0,
      remaining: row?.remaining ?? 0,
      remainingMinutes: row?.minutes ?? 0,
      executedLast7Days: row?.recent ?? 0,
      endDate: dateOnly(release?.endDate),
      today,
    });
  }

  async get(projectId: number, releaseId?: number, now = new Date()): Promise<DashboardDTO> {
    const db = this.prisma.db;
    const releases = await db.release.findMany({
      where: { projectId },
      orderBy: [{ startDate: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
    });
    const release = pickRelease(releases, releaseId);

    const planRows = await db.testPlan.findMany({
      where: { projectId, ...(release && { releaseId: release.id }) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    const plans = await buildPlanDTOs(db, planRows);
    const plansByStatus: Record<PlanStatus, number> = { draft: 0, in_progress: 0, completed: 0 };
    let counts = emptyCounts();
    for (const p of plans) {
      plansByStatus[p.status] += 1;
      counts = addCounts(counts, p.counts);
    }

    const openWhere = openDefectsWhere(projectId, release);
    const bySeverity = Object.fromEntries(DEFECT_SEVERITIES.map((s) => [s, 0])) as Record<
      DefectSeverity,
      number
    >;
    let openTotal = 0;
    for (const r of await db.defect.groupBy({
      by: ['severity'],
      where: openWhere,
      _count: { _all: true },
    })) {
      bySeverity[r.severity] = r._count._all;
      openTotal += r._count._all;
    }
    // Severity is a PostgreSQL enum: ascending = critical, major, minor, trivial.
    const openRows = await db.defect.findMany({
      where: openWhere,
      orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }, { id: 'desc' }],
      take: OPEN_DEFECT_LIMIT,
    });

    // Needs attention: the latest NG / OK-with-condition results in those plans.
    const attentionRows = planRows.length
      ? await db.runCase.findMany({
          where: {
            run: { planId: { in: planRows.map((p) => p.id) } },
            status: { in: ['ng', 'ok_cond'] },
          },
          include: {
            run: { select: { id: true, code: true, plan: { select: { id: true, docNo: true } } } },
          },
          orderBy: [{ executedAt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
          take: ATTENTION_LIMIT,
        })
      : [];
    const users = await loadUserRefs(
      db,
      attentionRows.map((r) => r.executedById),
    );
    const linked = await defectRefsByRunCase(
      db,
      attentionRows.map((r) => r.id),
    );

    const builds = await buildSummaries(db, release);
    return {
      release: release ? toReleaseDTO(release) : null,
      releases: releases.map(toReleaseDTO),
      builds,
      readiness: await this.readiness(
        planRows.filter((p) => p.status !== 'completed').map((p) => p.id),
        release,
        now,
      ),
      retest: await retestQueue(
        db,
        projectId,
        builds.map((b) => b.build),
      ),
      kpis: {
        planCount: plans.length,
        plansByStatus,
        counts,
        openDefects: openTotal,
        openDefectsBySeverity: bySeverity,
      },
      plans,
      attention: attentionRows.map((r) => toAttentionItem(r, users, linked.get(r.id)?.[0] ?? null)),
      openDefects: await buildDefectListItems(db, openRows),
    };
  }
}

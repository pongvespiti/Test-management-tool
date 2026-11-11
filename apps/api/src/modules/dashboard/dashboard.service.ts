import { Injectable } from '@nestjs/common';
import type { Prisma, Release } from '@tmt/database';
import {
  addCounts,
  DEFECT_SEVERITIES,
  emptyCounts,
  OPEN_DEFECT_STATUSES,
  type DashboardDTO,
  type DefectSeverity,
  type PlanStatus,
} from '@tmt/shared';
import { unprocessable } from '../../common/errors/app.exception.js';
import { loadUserRefs } from '../../common/users/user-refs.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { buildDefectListItems, defectRefsByRunCase } from '../defects/defects.queries.js';
import { buildPlanDTOs } from '../execution/execution.queries.js';
import { toReleaseDTO } from '../projects/projects.mapper.js';
import { toAttentionItem } from './dashboard.mapper.js';

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

/** Project dashboard of one release (all plans when the project has no releases). */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async get(projectId: number, releaseId?: number): Promise<DashboardDTO> {
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

    return {
      release: release ? toReleaseDTO(release) : null,
      releases: releases.map(toReleaseDTO),
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

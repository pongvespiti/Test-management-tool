import { Injectable } from '@nestjs/common';
import {
  can,
  defectKey,
  type MyWorkDTO,
  type MyWorkItemDTO,
  type MyWorkQuery,
  type NamedRef,
  type ResultStatus,
  type UserRef,
} from '@tmt/shared';
import { forbidden, unprocessable } from '../../common/errors/app.exception.js';
import type { AuthUser, ProjectContext } from '../../common/types/auth.js';
import { toUserRef } from '../../common/users/user-refs.js';
import { AppConfig } from '../../config/app-config.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { addDays, localDate, startOfLocalDay } from '../reports/report-dates.js';
import {
  compareWaiting,
  daysBetween,
  MY_WORK_ITEM_LIMIT,
  periodOf,
  summarizeMyResults,
  type MyResultRow,
} from './my-work.compute.js';

const WAITING = ['untested', 'ng', 'blocked'] as const;

interface ResultAggregateRow {
  runCaseId: number;
  status: ResultStatus;
  elapsedSec: number | null;
  executedAt: Date;
  releaseId: number | null;
  buildId: number | null;
}

/** What is waiting for a person (default: the signed-in user), and what they did in a day / week. */
@Injectable()
export class MyWorkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  async get(
    ctx: ProjectContext,
    me: AuthUser,
    q: MyWorkQuery,
    now = new Date(),
  ): Promise<MyWorkDTO> {
    const projectId = ctx.id;
    const tz = this.config.reportTimezone;
    const { from, to } = periodOf(q.range, q.date ?? localDate(now, tz));
    const days = daysBetween(from, to);
    const user = await this.person(ctx, me, q.userId);
    const [assigned, summary] = await Promise.all([
      this.assigned(projectId, user.id),
      this.summary(projectId, user.id, from, to, days, tz),
    ]);
    return {
      user,
      timezone: tz,
      range: q.range,
      from,
      to,
      assigned,
      summary,
    };
  }

  /** The signed-in user, or the project member asked for (managers and leads; 422 BAD_USER when not a member). */
  private async person(ctx: ProjectContext, me: AuthUser, userId?: number): Promise<UserRef> {
    if (userId === undefined || userId === me.id) return toUserRef(me);
    if (!can(ctx.role, 'viewTeam')) {
      throw forbidden('Other people’s work is for managers and leads');
    }
    const projectId = ctx.id;
    const member = await this.prisma.db.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
      select: { user: { select: { id: true, username: true, displayName: true } } },
    });
    if (!member) throw unprocessable('BAD_USER', 'The person is not a member of this project');
    return toUserRef(member.user);
  }

  /** Run cases of not-completed plans that are mine: assigned to me, else the run's tester is me. */
  private async assigned(projectId: number, userId: number): Promise<MyWorkDTO['assigned']> {
    const db = this.prisma.db;
    const mine = {
      status: { in: [...WAITING] },
      run: { plan: { projectId, status: { not: 'completed' as const } } },
      OR: [{ assigneeId: userId }, { assigneeId: null, run: { testerId: userId } }],
    };
    const byStatus = await db.runCase.groupBy({
      by: ['status'],
      where: mine,
      _count: { _all: true },
      _sum: { estimateMinutes: true },
    });
    const counts = { untested: 0, ng: 0, blocked: 0 };
    let remainingEstimateMinutes = 0;
    for (const row of byStatus) {
      if (row.status === 'untested' || row.status === 'ng' || row.status === 'blocked') {
        counts[row.status] = row._count._all;
      }
      if (row.status === 'untested') remainingEstimateMinutes = row._sum.estimateMinutes ?? 0;
    }
    const total = counts.untested + counts.ng + counts.blocked;

    // NG / blocked first: they are few, so each status is capped on its own before the merge.
    const rows = (
      await Promise.all(
        WAITING.map((status) =>
          db.runCase.findMany({
            where: { ...mine, status },
            include: {
              run: {
                select: {
                  id: true,
                  code: true,
                  buildId: true,
                  plan: { select: { id: true, docNo: true, releaseId: true } },
                },
              },
            },
            orderBy: [{ priority: 'asc' }, { id: 'asc' }],
            take: MY_WORK_ITEM_LIMIT,
          }),
        ),
      )
    )
      .flat()
      .sort((a, b) =>
        compareWaiting(
          { status: a.status as 'ng', priority: a.priority, runCaseId: a.id },
          { status: b.status as 'ng', priority: b.priority, runCaseId: b.id },
        ),
      )
      .slice(0, MY_WORK_ITEM_LIMIT);

    const releases = await this.names(
      'release',
      rows.map((r) => r.run.plan.releaseId),
    );
    const builds = await this.names(
      'build',
      rows.map((r) => r.run.buildId),
    );
    const items: MyWorkItemDTO[] = rows.map((r) => ({
      runCaseId: r.id,
      displayId: r.displayId,
      code: r.code,
      title: r.title,
      status: r.status as MyWorkItemDTO['status'],
      priority: r.priority,
      estimateMinutes: r.estimateMinutes,
      runId: r.run.id,
      runCode: r.run.code,
      planId: r.run.plan.id,
      planDocNo: r.run.plan.docNo,
      release: releases.get(r.run.plan.releaseId ?? -1) ?? null,
      build: builds.get(r.run.buildId ?? -1) ?? null,
    }));
    return { ...counts, total, remainingEstimateMinutes, items, truncated: total > items.length };
  }

  private async summary(
    projectId: number,
    userId: number,
    from: string,
    to: string,
    days: string[],
    tz: string,
  ): Promise<MyWorkDTO['summary']> {
    const db = this.prisma.db;
    const start = startOfLocalDay(from, tz);
    const end = startOfLocalDay(addDays(to, 1), tz);
    // The instants go in as ISO text: a bound Date would be read in the session time zone.
    const raw = await db.$queryRaw<ResultAggregateRow[]>`
      SELECT rcr.run_case_id AS "runCaseId", rcr.status AS "status",
             rcr.elapsed_sec AS "elapsedSec", rcr.executed_at AS "executedAt",
             p.release_id AS "releaseId", r.build_id AS "buildId"
      FROM run_case_results rcr
      JOIN run_cases rc ON rc.id = rcr.run_case_id
      JOIN test_runs r ON r.id = rc.run_id
      JOIN test_plans p ON p.id = r.plan_id
      WHERE p.project_id = ${projectId}
        AND rcr.executed_by_id = ${userId}
        AND rcr.status <> 'untested'
        AND rcr.executed_at >= ${start.toISOString()}::timestamptz
        AND rcr.executed_at < ${end.toISOString()}::timestamptz
      ORDER BY rcr.executed_at, rcr.id`;
    const rows: MyResultRow[] = raw.map((r) => ({
      runCaseId: r.runCaseId,
      status: r.status,
      elapsedSec: r.elapsedSec,
      day: localDate(r.executedAt, tz),
      releaseId: r.releaseId,
      buildId: r.buildId,
    }));
    const result = summarizeMyResults(rows, days);

    const releases = await this.names(
      'release',
      result.groups.map((g) => g.releaseId),
    );
    const builds = await this.names(
      'build',
      result.groups.map((g) => g.buildId),
    );
    const defects = await db.defect.findMany({
      where: { projectId, reporterId: userId, createdAt: { gte: start, lt: end } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, seq: true, title: true, status: true, severity: true },
    });
    return {
      executed: result.executed,
      counts: result.counts,
      elapsedSec: result.elapsedSec,
      days: result.days,
      groups: result.groups.map((g) => ({
        release: releases.get(g.releaseId ?? -1) ?? null,
        build: builds.get(g.buildId ?? -1) ?? null,
        executed: g.executed,
        counts: g.counts,
        elapsedSec: g.elapsedSec,
      })),
      defects: defects.map((d) => ({
        id: d.id,
        key: defectKey(d.seq),
        title: d.title,
        status: d.status,
        severity: d.severity,
      })),
    };
  }

  /** `{id, name}` of releases / builds, batch-loaded (null ids ignored). */
  private async names(
    kind: 'release' | 'build',
    ids: Array<number | null>,
  ): Promise<Map<number, NamedRef>> {
    const unique = [...new Set(ids.filter((v): v is number => v !== null))];
    if (unique.length === 0) return new Map();
    const db = this.prisma.db;
    const rows =
      kind === 'release'
        ? await db.release.findMany({
            where: { id: { in: unique } },
            select: { id: true, name: true },
          })
        : await db.build.findMany({
            where: { id: { in: unique } },
            select: { id: true, name: true },
          });
    return new Map(rows.map((r) => [r.id, { id: r.id, name: r.name }]));
  }
}

import { Injectable } from '@nestjs/common';
import {
  can,
  emptyCounts,
  totalOf,
  type AssignSuitesInput,
  type AssignSuitesResultDTO,
  type NamedRef,
  type ResultStatus,
  type StatusCounts,
  type TopicGroupDTO,
  type TopicRunDTO,
  type TopicsDTO,
  type TopicsQuery,
  type TopicSuiteDTO,
} from '@tmt/shared';
import { forbidden, unprocessable } from '../../common/errors/app.exception.js';
import type { AuthUser, ProjectContext } from '../../common/types/auth.js';
import { dateOnly, loadUserRefs, parseDateOnly, toUserRef } from '../../common/users/user-refs.js';
import { AppConfig } from '../../config/app-config.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ActivityService } from '../activity/activity.service.js';
import { pickRelease } from '../dashboard/dashboard.service.js';
import { assertAssignee } from '../execution/run-changes.service.js';
import { localDate } from '../reports/report-dates.js';
import { earliest, isOverdue, stateOf, sumCounts } from './topics.compute.js';

interface RunAggregate {
  counts: StatusCounts;
  minutes: number;
}

/** Work by topic: progress of the runs of a release, and handing suites out to people. */
@Injectable()
export class TopicsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly activity: ActivityService,
  ) {}

  async get(
    ctx: ProjectContext,
    me: AuthUser,
    q: TopicsQuery,
    now = new Date(),
  ): Promise<TopicsDTO> {
    // Everyone sees their own list; the whole team and other people are for managers and leads.
    if ((q.userId === undefined || q.userId !== me.id) && !can(ctx.role, 'viewTeam')) {
      throw forbidden('The team view needs the manager role in this project');
    }
    const db = this.prisma.db;
    const tz = this.config.reportTimezone;
    const today = localDate(now, tz);

    const releases = await db.release.findMany({
      where: { projectId: ctx.id },
      orderBy: [{ startDate: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
    });
    const release = pickRelease(releases, q.releaseId);
    const releaseRefs: NamedRef[] = releases.map((r) => ({ id: r.id, name: r.name }));

    let user: TopicsDTO['user'] = null;
    if (q.userId !== undefined) {
      if (q.userId === me.id) user = toUserRef(me);
      else {
        const member = await db.projectMember.findUnique({
          where: { projectId_userId: { projectId: ctx.id, userId: q.userId } },
          select: { user: { select: { id: true, username: true, displayName: true } } },
        });
        if (!member) throw unprocessable('BAD_USER', 'The person is not a member of this project');
        user = toUserRef(member.user);
      }
    }
    const userId = user?.id;
    // A person's cases: assigned to them, else in a run they test.
    const mine =
      userId === undefined
        ? {}
        : {
            OR: [{ assigneeId: userId }, { assigneeId: null, run: { testerId: userId } }],
          };

    const runs = await db.testRun.findMany({
      where: {
        plan: { projectId: ctx.id, ...(release && { releaseId: release.id }) },
        ...(userId !== undefined && {
          OR: [{ testerId: userId }, { runCases: { some: { assigneeId: userId } } }],
        }),
      },
      include: {
        plan: { select: { id: true, docNo: true, status: true } },
        suite: { select: { id: true, name: true, prefix: true, topic: true, sortOrder: true } },
        build: { select: { id: true, name: true } },
      },
      orderBy: [
        { suite: { sortOrder: 'asc' } },
        { suiteId: 'asc' },
        { sortOrder: 'asc' },
        { id: 'asc' },
      ],
    });

    const aggregates = new Map<number, RunAggregate>();
    if (runs.length > 0) {
      const rows = await db.runCase.groupBy({
        by: ['runId', 'status'],
        where: { runId: { in: runs.map((r) => r.id) }, ...mine },
        _count: { _all: true },
        _sum: { estimateMinutes: true },
      });
      for (const row of rows) {
        const agg = aggregates.get(row.runId) ?? { counts: emptyCounts(), minutes: 0 };
        agg.counts[row.status as ResultStatus] = row._count._all;
        if (row.status === 'untested') agg.minutes = row._sum.estimateMinutes ?? 0;
        aggregates.set(row.runId, agg);
      }
    }
    const testers = await loadUserRefs(
      db,
      runs.map((r) => r.testerId),
    );

    const runDtos = new Map<number, TopicRunDTO[]>();
    for (const run of runs) {
      const agg = aggregates.get(run.id) ?? { counts: emptyCounts(), minutes: 0 };
      const total = totalOf(agg.counts);
      if (userId !== undefined && total === 0) continue;
      const state = stateOf(agg.counts);
      const due = dateOnly(run.dueDate);
      const dto: TopicRunDTO = {
        id: run.id,
        code: run.code,
        scenario: run.scenario,
        planId: run.plan.id,
        planDocNo: run.plan.docNo,
        planStatus: run.plan.status,
        tester: run.testerId === null ? null : (testers.get(run.testerId) ?? null),
        build: run.build,
        dueDate: due,
        overdue: isOverdue(due, today, state),
        counts: agg.counts,
        total,
        remainingEstimateMinutes: agg.minutes,
        state,
      };
      runDtos.set(run.suiteId, [...(runDtos.get(run.suiteId) ?? []), dto]);
    }

    const groups = new Map<string, TopicGroupDTO>();
    for (const run of runs) {
      const list = runDtos.get(run.suiteId);
      if (!list || groups.get(topicOf(run.suite))?.suites.some((s) => s.suite.id === run.suiteId)) {
        continue;
      }
      const counts = sumCounts(list.map((r) => r.counts));
      const state = stateOf(counts);
      const due = earliest(list.filter((r) => r.state !== 'done').map((r) => r.dueDate));
      const suite: TopicSuiteDTO = {
        suite: { id: run.suite.id, name: run.suite.name, prefix: run.suite.prefix },
        runs: list,
        counts,
        total: totalOf(counts),
        state,
        dueDate: due,
        overdue: list.some((r) => r.overdue),
      };
      const topic = topicOf(run.suite);
      const group = groups.get(topic) ?? {
        topic,
        suites: [],
        counts: emptyCounts(),
        total: 0,
        state: 'not_started' as const,
      };
      group.suites.push(suite);
      group.counts = sumCounts(group.suites.map((s) => s.counts));
      group.total = totalOf(group.counts);
      group.state = stateOf(group.counts);
      groups.set(topic, group);
    }

    let suitesWithoutRuns: TopicsDTO['suitesWithoutRuns'] = [];
    if (userId === undefined) {
      const withRuns = new Set(runs.map((r) => r.suiteId));
      const suites = await db.suite.findMany({
        where: { projectId: ctx.id, isArchived: false },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        select: { id: true, name: true, topic: true },
      });
      suitesWithoutRuns = suites
        .filter((s) => !withRuns.has(s.id))
        .map((s) => ({ id: s.id, name: s.name, topic: topicOf(s) }));
    }

    return {
      release: release ? { id: release.id, name: release.name } : null,
      releases: releaseRefs,
      user,
      timezone: tz,
      topics: [...groups.values()],
      suitesWithoutRuns,
    };
  }

  /** Hands the runs of the suites in a release to one person (and sets / clears their due date). */
  async assign(
    ctx: ProjectContext,
    me: AuthUser,
    input: AssignSuitesInput,
  ): Promise<AssignSuitesResultDTO> {
    const db = this.prisma.db;
    const release = await db.release.findFirst({
      where: { id: input.releaseId, projectId: ctx.id },
      select: { id: true, name: true },
    });
    if (!release) throw unprocessable('BAD_RELEASE', 'The release does not belong to this project');
    const suiteIds = [...new Set(input.suiteIds)];
    const suites = await db.suite.findMany({
      where: { id: { in: suiteIds }, projectId: ctx.id },
      select: { id: true, name: true },
    });
    if (suites.length !== suiteIds.length) {
      throw unprocessable('BAD_SUITE', 'A suite does not belong to this project');
    }
    if (input.testerId !== null) await assertAssignee(db, ctx.id, input.testerId);

    const runs = await db.testRun.findMany({
      where: { suiteId: { in: suiteIds }, plan: { projectId: ctx.id, releaseId: release.id } },
      select: {
        id: true,
        code: true,
        suiteId: true,
        plan: { select: { docNo: true, status: true } },
      },
    });
    const open = runs.filter((r) => r.plan.status !== 'completed');
    const withRuns = new Set(runs.map((r) => r.suiteId));
    const person =
      input.testerId === null
        ? null
        : await db.user.findUnique({
            where: { id: input.testerId },
            select: { displayName: true },
          });

    await db.$transaction(async (tx) => {
      if (open.length === 0) return;
      await tx.testRun.updateMany({
        where: { id: { in: open.map((r) => r.id) } },
        data: {
          testerId: input.testerId,
          ...(input.dueDate !== undefined && { dueDate: parseDateOnly(input.dueDate) }),
        },
      });
      for (const run of open) {
        await this.activity.log(tx, {
          projectId: ctx.id,
          userId: me.id,
          entityType: 'run',
          entityId: run.id,
          action: 'assigned',
          summary:
            person === null
              ? `Took run ${run.code} in ${run.plan.docNo} away from its tester`
              : `Gave run ${run.code} in ${run.plan.docNo} to ${person.displayName}`,
          data: { testerId: input.testerId, releaseId: release.id },
        });
      }
    });
    return {
      updatedRuns: open.length,
      lockedRuns: runs.length - open.length,
      suitesWithoutRuns: suiteIds.filter((id) => !withRuns.has(id)),
    };
  }
}

function topicOf(suite: { name: string; topic: string | null }): string {
  return suite.topic?.trim() || suite.name;
}

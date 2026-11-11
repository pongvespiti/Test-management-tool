/**
 * Changes to the case list of a run (api.md § v1.1 Execution): add cases, remove run cases,
 * re-run (new run from a source run's results) and assignment.
 */
import { Injectable } from '@nestjs/common';
import type { RunCase } from '@tmt/database';
import {
  RESULT_LABELS,
  roleAtLeast,
  type AddRunCasesInput,
  type AssignRunCasesInput,
  type RemoveRunCasesInput,
  type RerunInput,
  type RunDTO,
} from '@tmt/shared';
import { forbidden, unprocessable } from '../../common/errors/app.exception.js';
import { isUniqueViolation } from '../../common/errors/prisma-errors.js';
import type { AuthUser, ProjectContext } from '../../common/types/auth.js';
import { assertActiveUser } from '../../common/users/user-refs.js';
import { PrismaService, type Db } from '../../prisma/prisma.service.js';
import { ActivityService } from '../activity/activity.service.js';
import { purgeCollab } from '../collab/attachments.queries.js';
import { envTemplateOf } from '../library/library.mapper.js';
import { loadSharedStepLookup } from '../library/library.queries.js';
import { loadSectionTree } from '../library/section-tree.js';
import { StorageService } from '../storage/storage.service.js';
import { envInput, envOf } from './execution.mapper.js';
import {
  assertBuildForPlan,
  assertPlanEditable,
  BULK_TX,
  buildRunDTOs,
  getRunInProject,
  lockEditablePlan,
  nextRunSortOrder,
} from './execution.queries.js';
import { RUN_CODE_KEY, runCodeTaken, touchPlan } from './runs.service.js';
import {
  insertRunCases,
  nextRunCaseSortOrder,
  selectCases,
  snapshotFromRunCase,
  snapshotOf,
  type RunCaseSnapshot,
} from './snapshot.js';

/** All given run case ids must belong to the run (422 BAD_RUN_CASE); returns their rows. */
export async function runCasesOfRun(
  db: Db,
  runId: number,
  ids: number[],
): Promise<Pick<RunCase, 'id' | 'status' | 'displayId'>[]> {
  const unique = [...new Set(ids)];
  const rows = await db.runCase.findMany({
    where: { runId, id: { in: unique } },
    select: { id: true, status: true, displayId: true },
  });
  if (rows.length !== unique.length) {
    const found = new Set(rows.map((r) => r.id));
    throw unprocessable('BAD_RUN_CASE', 'Some run cases do not belong to this run', {
      runCaseIds: unique.filter((id) => !found.has(id)),
    });
  }
  return rows;
}

/** An assignee must be an active tester or lead of the project, or an administrator. */
export async function assertAssignee(db: Db, projectId: number, userId: number): Promise<void> {
  const u = await db.user.findUnique({
    where: { id: userId },
    select: {
      isActive: true,
      isAdmin: true,
      memberships: { where: { projectId }, select: { role: true } },
    },
  });
  const role = u?.memberships[0]?.role;
  if (!u || !u.isActive || !(u.isAdmin || role === 'tester' || role === 'lead')) {
    throw unprocessable(
      'UNKNOWN_USER',
      'The assignee must be an active tester or lead of this project',
    );
  }
}

@Injectable()
export class RunChangesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly storage: StorageService,
  ) {}

  /** Appends library cases (tree order) that are not in the run yet. */
  async addCases(
    ctx: ProjectContext,
    me: AuthUser,
    runId: number,
    input: AddRunCasesInput,
  ): Promise<{ added: number }> {
    const db = this.prisma.db;
    const { run, plan } = await getRunInProject(db, ctx.id, runId);
    assertPlanEditable(plan);
    const suite = await db.suite.findUniqueOrThrow({ where: { id: run.suiteId } });
    const { rows, tree } = await selectCases(db, suite, input);
    const added = await db.$transaction(async (tx) => {
      await lockEditablePlan(tx, plan.id);
      const present = await tx.runCase.findMany({
        where: { runId: run.id },
        select: { testCaseId: true },
      });
      const have = new Set(present.map((p) => p.testCaseId));
      const fresh = rows.filter((c) => !have.has(c.id));
      if (fresh.length === 0) return 0;
      const shared = await loadSharedStepLookup(tx, fresh);
      const start = await nextRunCaseSortOrder(tx, run.id);
      await insertRunCases(
        tx,
        run.id,
        fresh.map((c, i) => ({ ...snapshotOf(c, suite, tree, shared), sortOrder: start + i })),
      );
      await tx.testRun.update({ where: { id: run.id }, data: { updatedAt: new Date() } });
      await this.activity.log(tx, {
        projectId: ctx.id,
        userId: me.id,
        entityType: 'run',
        entityId: run.id,
        action: 'cases_added',
        summary: `Added ${fresh.length} case(s) to run ${run.code} in ${plan.docNo}`,
        data: { testCaseIds: fresh.map((c) => c.id) },
      });
      return fresh.length;
    }, BULK_TX);
    return { added };
  }

  /** Removes run cases; executed ones only by a lead (403 EXECUTED_RUN_CASES, nothing removed). */
  async removeCases(
    ctx: ProjectContext,
    me: AuthUser,
    runId: number,
    input: RemoveRunCasesInput,
  ): Promise<{ removed: number }> {
    const db = this.prisma.db;
    const { run, plan } = await getRunInProject(db, ctx.id, runId);
    assertPlanEditable(plan);
    const rows = await runCasesOfRun(db, run.id, input.runCaseIds);
    const executed = rows.filter((r) => r.status !== 'untested');
    if (executed.length > 0 && !roleAtLeast(ctx.role, 'lead')) {
      throw forbidden(
        `${executed.length} of the run cases already have results — only a lead can remove them`,
        'EXECUTED_RUN_CASES',
      );
    }
    const ids = rows.map((r) => r.id);
    const result = await db.$transaction(async (tx) => {
      await lockEditablePlan(tx, plan.id);
      const removedFiles = await purgeCollab(tx, 'run_case', ids);
      const deleted = await tx.runCase.deleteMany({ where: { runId: run.id, id: { in: ids } } });
      await tx.testRun.update({ where: { id: run.id }, data: { updatedAt: new Date() } });
      await this.activity.log(tx, {
        projectId: ctx.id,
        userId: me.id,
        entityType: 'run',
        entityId: run.id,
        action: 'cases_removed',
        summary: `Removed ${deleted.count} case(s) from run ${run.code} in ${plan.docNo}`,
        data: {
          runCaseIds: ids,
          displayIds: rows.map((r) => r.displayId),
          executed: executed.length,
        },
      });
      return { removedFiles, removed: deleted.count };
    }, BULK_TX);
    await this.storage.removeMany(result.removedFiles);
    return { removed: result.removed };
  }

  /** New run in the same plan with the source run's cases whose result is in `statuses`. */
  async rerun(
    ctx: ProjectContext,
    me: AuthUser,
    runId: number,
    input: RerunInput,
  ): Promise<RunDTO> {
    const db = this.prisma.db;
    const { run: source, plan } = await getRunInProject(db, ctx.id, runId);
    assertPlanEditable(plan);
    await assertActiveUser(db, input.testerId);
    await assertBuildForPlan(db, ctx.id, plan, input.buildId);
    const picked = await db.runCase.findMany({
      where: { runId: source.id, status: { in: input.statuses } },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    if (picked.length === 0) {
      throw unprocessable(
        'NO_CASES',
        `No run case of ${source.code} has one of the results ${input.statuses.map((s) => RESULT_LABELS[s]).join(', ')}`,
      );
    }
    const suite = await db.suite.findUniqueOrThrow({ where: { id: source.suiteId } });
    let snapshots: RunCaseSnapshot[] = picked.map(snapshotFromRunCase);
    if (input.refreshFromLibrary) {
      const caseIds = [
        ...new Set(picked.map((p) => p.testCaseId).filter((v): v is number => v !== null)),
      ];
      const live = caseIds.length
        ? await db.testCase.findMany({
            where: { id: { in: caseIds }, suiteId: suite.id, isDeleted: false },
          })
        : [];
      const byId = new Map(live.map((c) => [c.id, c]));
      const tree = await loadSectionTree(db, suite.id);
      const shared = await loadSharedStepLookup(db, live);
      snapshots = picked.map((rc) => {
        const c = rc.testCaseId !== null ? byId.get(rc.testCaseId) : undefined;
        // Deleted library cases keep the old snapshot.
        return c ? snapshotOf(c, suite, tree, shared) : snapshotFromRunCase(rc);
      });
    }
    const environment =
      input.environment ??
      (input.copyEnvironment
        ? envOf(source)
        : envTemplateOf(suite).map((label) => ({ label, value: '' })));
    try {
      const created = await db.$transaction(async (tx) => {
        await lockEditablePlan(tx, plan.id);
        const r = await tx.testRun.create({
          data: {
            planId: plan.id,
            suiteId: source.suiteId,
            code: input.code,
            scenario: input.scenario !== undefined ? input.scenario : source.scenario,
            environment: envInput(environment),
            testerId: input.testerId !== undefined ? input.testerId : source.testerId,
            buildId: input.buildId !== undefined ? input.buildId : source.buildId,
            sortOrder: await nextRunSortOrder(tx, plan.id),
            sourceRunId: source.id,
            createdById: me.id,
          },
        });
        await insertRunCases(
          tx,
          r.id,
          snapshots.map((s, i) => ({
            ...s,
            sortOrder: i + 1,
            assigneeId: input.keepAssignees ? picked[i]!.assigneeId : null,
          })),
        );
        await touchPlan(tx, plan.id);
        await this.activity.log(tx, {
          projectId: ctx.id,
          userId: me.id,
          entityType: 'run',
          entityId: r.id,
          action: 'rerun_created',
          summary: `Re-run of ${source.code} as ${r.code} in ${plan.docNo} with ${snapshots.length} case(s)`,
          data: {
            sourceRunId: source.id,
            statuses: input.statuses,
            refreshFromLibrary: input.refreshFromLibrary,
          },
        });
        return r;
      }, BULK_TX);
      return (await buildRunDTOs(db, [{ run: created, plan }]))[0]!;
    } catch (e) {
      if (isUniqueViolation(e, RUN_CODE_KEY)) throw runCodeTaken(input.code);
      throw e;
    }
  }

  /** Assigns run cases (null = back to the run's tester). */
  async assign(
    ctx: ProjectContext,
    me: AuthUser,
    runId: number,
    input: AssignRunCasesInput,
  ): Promise<{ affected: number }> {
    const db = this.prisma.db;
    const { run, plan } = await getRunInProject(db, ctx.id, runId);
    assertPlanEditable(plan);
    if (input.assigneeId !== null) await assertAssignee(db, ctx.id, input.assigneeId);
    const rows = await runCasesOfRun(db, run.id, input.runCaseIds);
    const ids = rows.map((r) => r.id);
    const affected = await db.$transaction(async (tx) => {
      await lockEditablePlan(tx, plan.id);
      const updated = await tx.runCase.updateMany({
        where: { runId: run.id, id: { in: ids } },
        data: { assigneeId: input.assigneeId },
      });
      await this.activity.log(tx, {
        projectId: ctx.id,
        userId: me.id,
        entityType: 'run',
        entityId: run.id,
        action: 'cases_assigned',
        summary:
          input.assigneeId === null
            ? `Unassigned ${updated.count} case(s) in run ${run.code}`
            : `Assigned ${updated.count} case(s) in run ${run.code}`,
        data: { assigneeId: input.assigneeId, runCaseIds: ids },
      });
      return updated.count;
    });
    return { affected };
  }
}

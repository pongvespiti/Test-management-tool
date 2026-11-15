import { textMessage } from '@tmt/shared';
import { Injectable } from '@nestjs/common';
import type { TestPlan, TestRun } from '@tmt/database';
import type { CreateRunInput, DuplicateRunInput, RunDTO, UpdateRunInput } from '@tmt/shared';
import { conflict, unprocessable } from '../../common/errors/app.exception.js';
import { isUniqueViolation } from '../../common/errors/prisma-errors.js';
import type { AuthUser, ProjectContext } from '../../common/types/auth.js';
import { assertActiveUser, parseDateOnly } from '../../common/users/user-refs.js';
import { PrismaService, type Db } from '../../prisma/prisma.service.js';
import { ActivityService } from '../activity/activity.service.js';
import { DimensionsService } from '../dimensions/dimensions.service.js';
import { purgeCollab } from '../collab/attachments.queries.js';
import { envTemplateOf } from '../library/library.mapper.js';
import { StorageService } from '../storage/storage.service.js';
import { envInput, envOf } from './execution.mapper.js';
import {
  assertBuildForPlan,
  assertPlanEditable,
  BULK_TX,
  buildRunDTOs,
  getPlanInProject,
  getRunInProject,
  lockEditablePlan,
  nextRunSortOrder,
} from './execution.queries.js';
import { copyRunSnapshot, insertRunCases, snapshotCases } from './snapshot.js';
import { notifyUsers } from '../notifications/notify.js';

/** Unique index of `(plan_id, code)`. */
export const RUN_CODE_KEY = 'test_runs_plan_id_code_key';

export function runCodeTaken(code: string) {
  return conflict('RUN_CODE_TAKEN', `Run code ${code} is already used in this test plan`);
}

/** Bumps the plan's `updated_at` (its runs changed). */
export async function touchPlan(tx: Db, planId: number): Promise<void> {
  await tx.testPlan.update({ where: { id: planId }, data: { updatedAt: new Date() } });
}

/** Test runs of a plan: create from a library selection, update, delete, duplicate. */
@Injectable()
export class RunsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly storage: StorageService,
    private readonly dimensions: DimensionsService,
  ) {}

  async listForPlan(projectId: number, planId: number): Promise<RunDTO[]> {
    const db = this.prisma.db;
    const plan = await getPlanInProject(db, projectId, planId);
    const runs = await db.testRun.findMany({
      where: { planId: plan.id },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    return buildRunDTOs(
      db,
      runs.map((run) => ({ run, plan })),
    );
  }

  async get(projectId: number, runId: number): Promise<RunDTO> {
    const { run, plan } = await getRunInProject(this.prisma.db, projectId, runId);
    return this.dto(run, plan);
  }

  /** New run with snapshots of the selected library cases (environment from the suite template). */
  async create(
    ctx: ProjectContext,
    me: AuthUser,
    planId: number,
    input: CreateRunInput,
  ): Promise<RunDTO> {
    const db = this.prisma.db;
    const plan = await getPlanInProject(db, ctx.id, planId);
    assertPlanEditable(plan);
    const suite = await db.suite.findFirst({ where: { id: input.suiteId, projectId: ctx.id } });
    if (!suite) throw unprocessable('BAD_SUITE', 'The suite does not belong to this project');
    await assertActiveUser(db, input.testerId);
    await assertBuildForPlan(db, ctx.id, plan, input.buildId);
    const snapshot = await snapshotCases(db, suite, input);
    if (snapshot.length === 0) {
      throw unprocessable('NO_CASES', 'No test cases match the selected filters');
    }
    const environment =
      input.environment.length > 0
        ? input.environment
        : envTemplateOf(suite).map((label) => ({ label, value: '' }));
    try {
      const run = await db.$transaction(async (tx) => {
        await lockEditablePlan(tx, plan.id);
        const listed = await this.dimensions.canonicalize(tx, ctx.id, environment);
        const r = await tx.testRun.create({
          data: {
            planId: plan.id,
            suiteId: suite.id,
            code: input.code,
            scenario: input.scenario ?? null,
            environment: envInput(listed),
            testerId: input.testerId ?? null,
            buildId: input.buildId ?? null,
            testedDate: parseDateOnly(input.testedDate) ?? null,
            dueDate: parseDateOnly(input.dueDate) ?? null,
            sortOrder: await nextRunSortOrder(tx, plan.id),
            createdById: me.id,
          },
        });
        await insertRunCases(tx, r.id, snapshot);
        await touchPlan(tx, plan.id);
        await this.activity.log(tx, {
          projectId: ctx.id,
          userId: me.id,
          entityType: 'run',
          entityId: r.id,
          action: 'created',
          summary: `Created run ${r.code} in ${plan.docNo} with ${snapshot.length} cases from ${suite.name}`,
        });
        await notifyUsers(
          tx,
          [
            {
              userId: r.testerId,
              projectId: ctx.id,
              kind: 'assigned',
              message: {
                title: { key: 'run_assigned', vars: { code: r.code, suite: suite.name } },
                body: textMessage(plan.docNo),
              },
              link: `/projects/${ctx.id}/runs/${r.id}`,
            },
          ],
          me.id,
        );
        return r;
      }, BULK_TX);
      return await this.dto(run, plan);
    } catch (e) {
      if (isUniqueViolation(e, RUN_CODE_KEY)) throw runCodeTaken(input.code);
      throw e;
    }
  }

  async update(
    ctx: ProjectContext,
    me: AuthUser,
    runId: number,
    input: UpdateRunInput,
  ): Promise<RunDTO> {
    const db = this.prisma.db;
    const { run, plan } = await getRunInProject(db, ctx.id, runId);
    assertPlanEditable(plan);
    await assertActiveUser(db, input.testerId);
    await assertBuildForPlan(db, ctx.id, plan, input.buildId);
    try {
      const updated = await db.$transaction(async (tx) => {
        await lockEditablePlan(tx, plan.id);
        const environment =
          input.environment !== undefined
            ? envInput(await this.dimensions.canonicalize(tx, ctx.id, input.environment))
            : undefined;
        const r = await tx.testRun.update({
          where: { id: run.id },
          data: {
            ...(input.code !== undefined && { code: input.code }),
            ...(input.scenario !== undefined && { scenario: input.scenario }),
            ...(environment !== undefined && { environment }),
            ...(input.testerId !== undefined && { testerId: input.testerId }),
            ...(input.buildId !== undefined && { buildId: input.buildId }),
            ...(input.testedDate !== undefined && {
              testedDate: parseDateOnly(input.testedDate),
            }),
            ...(input.dueDate !== undefined && { dueDate: parseDateOnly(input.dueDate) }),
            ...(input.judgement !== undefined && { judgement: input.judgement }),
            ...(input.judgementNote !== undefined && { judgementNote: input.judgementNote }),
            ...(input.remark !== undefined && { remark: input.remark }),
            ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
          },
        });
        await this.activity.log(tx, {
          projectId: ctx.id,
          userId: me.id,
          entityType: 'run',
          entityId: run.id,
          action: 'updated',
          summary: `Updated run ${r.code} in ${plan.docNo}`,
          data: input,
        });
        if (input.testerId !== undefined && input.testerId !== run.testerId) {
          await notifyUsers(
            tx,
            [
              {
                userId: r.testerId,
                projectId: ctx.id,
                kind: 'assigned',
                message: {
                  title: { key: 'run_assigned_plain', vars: { code: r.code } },
                  body: textMessage(plan.docNo),
                },
                link: `/projects/${ctx.id}/runs/${r.id}`,
              },
            ],
            me.id,
          );
        }
        return r;
      });
      return await this.dto(updated, plan);
    } catch (e) {
      if (isUniqueViolation(e, RUN_CODE_KEY)) throw runCodeTaken(input.code ?? run.code);
      throw e;
    }
  }

  /** Deletes the run with its run cases, their comments and attachments (files included). */
  async remove(ctx: ProjectContext, me: AuthUser, runId: number): Promise<void> {
    const db = this.prisma.db;
    const { run, plan } = await getRunInProject(db, ctx.id, runId);
    assertPlanEditable(plan);
    const keys = await db.$transaction(async (tx) => {
      await lockEditablePlan(tx, plan.id);
      const runCases = await tx.runCase.findMany({
        where: { runId: run.id },
        select: { id: true },
      });
      const removed = await purgeCollab(
        tx,
        'run_case',
        runCases.map((r) => r.id),
      );
      await tx.testRun.delete({ where: { id: run.id } });
      await touchPlan(tx, plan.id);
      await this.activity.log(tx, {
        projectId: ctx.id,
        userId: me.id,
        entityType: 'run',
        entityId: run.id,
        action: 'deleted',
        summary: `Deleted run ${run.code} from ${plan.docNo}`,
      });
      return removed;
    }, BULK_TX);
    await this.storage.removeMany(keys);
  }

  /** Same case snapshot (steps included), fresh untested results. */
  async duplicate(
    ctx: ProjectContext,
    me: AuthUser,
    runId: number,
    input: DuplicateRunInput,
  ): Promise<RunDTO> {
    const db = this.prisma.db;
    const { run, plan } = await getRunInProject(db, ctx.id, runId);
    assertPlanEditable(plan);
    await assertActiveUser(db, input.testerId);
    await assertBuildForPlan(db, ctx.id, plan, input.buildId);
    try {
      const created = await db.$transaction(async (tx) => {
        await lockEditablePlan(tx, plan.id);
        const listed = await this.dimensions.canonicalize(
          tx,
          ctx.id,
          input.environment ?? envOf(run),
        );
        const r = await tx.testRun.create({
          data: {
            planId: plan.id,
            suiteId: run.suiteId,
            code: input.code,
            scenario: input.scenario !== undefined ? input.scenario : run.scenario,
            environment: envInput(listed),
            testerId: input.testerId !== undefined ? input.testerId : run.testerId,
            buildId: input.buildId !== undefined ? input.buildId : run.buildId,
            sortOrder: await nextRunSortOrder(tx, plan.id),
            createdById: me.id,
          },
        });
        await copyRunSnapshot(tx, run.id, r.id);
        await touchPlan(tx, plan.id);
        await this.activity.log(tx, {
          projectId: ctx.id,
          userId: me.id,
          entityType: 'run',
          entityId: r.id,
          action: 'created',
          summary: `Duplicated run ${run.code} as ${r.code} in ${plan.docNo}`,
          data: { sourceRunId: run.id },
        });
        return r;
      }, BULK_TX);
      return await this.dto(created, plan);
    } catch (e) {
      if (isUniqueViolation(e, RUN_CODE_KEY)) throw runCodeTaken(input.code);
      throw e;
    }
  }

  private async dto(run: TestRun, plan: TestPlan): Promise<RunDTO> {
    return (await buildRunDTOs(this.prisma.db, [{ run, plan }]))[0]!;
  }
}

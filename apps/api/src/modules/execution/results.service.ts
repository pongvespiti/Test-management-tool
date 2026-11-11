import { Injectable } from '@nestjs/common';
import type { RunCase } from '@tmt/database';
import {
  normalizeText,
  RESULT_LABELS,
  type BulkResultInput,
  type ResultSource,
  type RunCaseDetailDTO,
  type RunCaseDTO,
  type SetResultInput,
  type StepResultDTO,
} from '@tmt/shared';
import { unprocessable } from '../../common/errors/app.exception.js';
import type { AuthUser, ProjectContext } from '../../common/types/auth.js';
import { loadUserRefs } from '../../common/users/user-refs.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ActivityService } from '../activity/activity.service.js';
import { toAttachmentDTO } from '../collab/attachments.mapper.js';
import { attachmentsOf } from '../collab/attachments.queries.js';
import { defectRefsByRunCase } from '../defects/defects.queries.js';
import {
  runStepsOf,
  stepResultsInput,
  stepResultsOf,
  toResultHistoryDTO,
} from './execution.mapper.js';
import {
  assertPlanEditable,
  BULK_TX,
  caseRunHistory,
  getRunCaseInProject,
  getRunInProject,
  loadRunCaseDTOs,
  lockEditablePlan,
  markPlanInProgress,
} from './execution.queries.js';

const HISTORY_CHUNK = 500;
/** Other runs of the same library case shown on a run case. */
const OTHER_RUNS_LIMIT = 20;

export interface ResultValues {
  actualResult: string | null;
  remark: string | null;
  elapsedSec: number | null;
  stepResults: StepResultDTO[] | null;
}

/**
 * Values stored with a new result: omitted fields keep their current value, null or '' clears
 * them; an empty step result list clears the step results.
 */
export function nextResultValues(
  current: Pick<RunCase, 'actualResult' | 'resultRemark' | 'elapsedSec' | 'stepResults'>,
  input: SetResultInput,
): ResultValues {
  return {
    actualResult:
      input.actualResult === undefined ? current.actualResult : normalizeText(input.actualResult),
    remark: input.remark === undefined ? current.resultRemark : normalizeText(input.remark),
    elapsedSec: input.elapsedSec === undefined ? current.elapsedSec : input.elapsedSec,
    stepResults:
      input.stepResults === undefined
        ? stepResultsOf(current.stepResults)
        : input.stepResults === null || input.stepResults.length === 0
          ? null
          : input.stepResults.map((s) => ({
              status: s.status,
              actual: normalizeText(s.actual) ?? '',
            })),
  };
}

/** Run cases of a run, their detail and results (single and bulk). */
@Injectable()
export class ResultsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  async listRunCases(projectId: number, runId: number): Promise<RunCaseDTO[]> {
    const { run } = await getRunInProject(this.prisma.db, projectId, runId);
    return loadRunCaseDTOs(this.prisma.db, { runId: run.id });
  }

  /** Run case with its result history, attachments, defects and the case's other runs. */
  async detail(projectId: number, runCaseId: number): Promise<RunCaseDetailDTO> {
    const db = this.prisma.db;
    const { rc } = await getRunCaseInProject(db, projectId, runCaseId);
    const [base] = await loadRunCaseDTOs(db, { ids: [rc.id] });
    const history = await db.runCaseResult.findMany({
      where: { runCaseId: rc.id },
      orderBy: [{ executedAt: 'desc' }, { id: 'desc' }],
    });
    const files = await attachmentsOf(db, projectId, 'run_case', [rc.id]);
    const users = await loadUserRefs(db, [
      ...history.map((h) => h.executedById),
      ...files.map((f) => f.createdById),
    ]);
    const defects = await defectRefsByRunCase(db, [rc.id]);
    const otherRuns =
      rc.testCaseId !== null
        ? await caseRunHistory(db, rc.testCaseId, rc.id, OTHER_RUNS_LIMIT)
        : [];
    return {
      ...base!,
      history: history.map((h) => toResultHistoryDTO(h, users)),
      attachments: files.map((f) => toAttachmentDTO(f, users)),
      defects: defects.get(rc.id) ?? [],
      otherRuns,
    };
  }

  /** Records a result (and its history row); step results must match the snapshot steps. */
  async setResult(
    ctx: ProjectContext,
    me: AuthUser,
    runCaseId: number,
    input: SetResultInput,
    source: Extract<ResultSource, 'ui' | 'api'>,
  ): Promise<RunCaseDTO> {
    const db = this.prisma.db;
    const { rc, run, plan } = await getRunCaseInProject(db, ctx.id, runCaseId);
    assertPlanEditable(plan);
    // Step results are index-aligned with the snapshot steps (immutable after the snapshot).
    const stepCount = runStepsOf(rc).length;
    if (input.stepResults && input.stepResults.length !== stepCount) {
      throw unprocessable(
        'STEP_COUNT_MISMATCH',
        `This run case has ${stepCount} step(s) but ${input.stepResults.length} step result(s) were sent`,
        { expected: stepCount, received: input.stepResults.length },
      );
    }
    await db.$transaction(async (tx) => {
      await lockEditablePlan(tx, plan.id);
      await tx.$queryRaw`SELECT id FROM run_cases WHERE id = ${rc.id} FOR UPDATE`;
      const current = (await tx.runCase.findUnique({ where: { id: rc.id } })) ?? rc;
      const next = nextResultValues(current, input);
      const now = new Date();
      const executed = input.status !== 'untested';
      await tx.runCase.update({
        where: { id: rc.id },
        data: {
          status: input.status,
          actualResult: next.actualResult,
          resultRemark: next.remark,
          elapsedSec: next.elapsedSec,
          stepResults: stepResultsInput(next.stepResults),
          executedById: executed ? me.id : null,
          executedAt: executed ? now : null,
        },
      });
      await tx.runCaseResult.create({
        data: {
          runCaseId: rc.id,
          status: input.status,
          actualResult: next.actualResult,
          remark: next.remark,
          stepResults: stepResultsInput(next.stepResults),
          source,
          executedById: me.id,
          executedAt: now,
          elapsedSec: next.elapsedSec,
        },
      });
      if (executed) await markPlanInProgress(tx, plan.id);
      await this.activity.log(tx, {
        projectId: ctx.id,
        userId: me.id,
        entityType: 'run_case',
        entityId: rc.id,
        action: 'result_set',
        summary: `${rc.displayId} → ${RESULT_LABELS[input.status]} in run ${run.code}`,
        data: { status: input.status, previous: current.status },
      });
    });
    const [dto] = await loadRunCaseDTOs(db, { ids: [rc.id] });
    return dto!;
  }

  /** Sets one result on many run cases of the run (ids of other runs are ignored). */
  async bulk(
    ctx: ProjectContext,
    me: AuthUser,
    runId: number,
    input: BulkResultInput,
  ): Promise<{ affected: number }> {
    const db = this.prisma.db;
    const { run, plan } = await getRunInProject(db, ctx.id, runId);
    assertPlanEditable(plan);
    const affected = await db.$transaction(async (tx) => {
      await lockEditablePlan(tx, plan.id);
      const now = new Date();
      const updated = await tx.runCase.updateManyAndReturn({
        where: { runId: run.id, id: { in: input.runCaseIds } },
        data: { status: input.status, executedById: me.id, executedAt: now },
        select: {
          id: true,
          actualResult: true,
          resultRemark: true,
          elapsedSec: true,
          stepResults: true,
        },
      });
      if (updated.length === 0) return 0;
      for (let i = 0; i < updated.length; i += HISTORY_CHUNK) {
        await tx.runCaseResult.createMany({
          data: updated.slice(i, i + HISTORY_CHUNK).map((u) => ({
            runCaseId: u.id,
            status: input.status,
            actualResult: u.actualResult,
            remark: u.resultRemark,
            stepResults: stepResultsInput(stepResultsOf(u.stepResults)),
            source: 'bulk' as const,
            executedById: me.id,
            executedAt: now,
            elapsedSec: u.elapsedSec,
          })),
        });
      }
      await markPlanInProgress(tx, plan.id);
      await this.activity.log(tx, {
        projectId: ctx.id,
        userId: me.id,
        entityType: 'run',
        entityId: run.id,
        action: 'results_bulk',
        summary: `Set ${updated.length} result(s) to ${RESULT_LABELS[input.status]} in run ${run.code}`,
        data: { status: input.status, runCaseIds: updated.map((u) => u.id) },
      });
      return updated.length;
    }, BULK_TX);
    return { affected };
  }
}

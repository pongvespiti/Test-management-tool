/** Prisma rows of plans, runs, run cases and results → response DTOs (pure functions). */
import {
  Prisma,
  type RunCase,
  type RunCaseResult,
  type Suite,
  type TestPlan,
  type TestRun,
} from '@tmt/database';
import {
  addCounts,
  emptyCounts,
  suggestJudgement,
  type AttachmentDTO,
  type CaseRunHistoryItem,
  type EnvEntryDTO,
  type NamedRef,
  type PlanDTO,
  type ResultHistoryDTO,
  type ResultStatus,
  type RunCaseDTO,
  type RunDTO,
  type RunRef,
  type RunStepDTO,
  type RunSummaryDTO,
  type StatusCounts,
  type StepResultDTO,
  type UserRef,
} from '@tmt/shared';
import { dateOnly, iso, refOf } from '../../common/users/user-refs.js';
import { fieldDefsOf } from '../library/library.mapper.js';

/** Sum of case estimates of a run; remaining = untested run cases only. */
export type RunEstimate = RunDTO['estimate'];

/** Suite fields shown in a RunDTO. */
export type RunSuite = Pick<Suite, 'id' | 'name' | 'prefix' | 'fieldDefs'>;

/** Environment entries of a run (`[{ label, value }]`). */
export function envOf(run: Pick<TestRun, 'environment'>): EnvEntryDTO[] {
  return Array.isArray(run.environment) ? (run.environment as unknown as EnvEntryDTO[]) : [];
}

/** Environment entries as a JSON column value. */
export function envInput(env: readonly EnvEntryDTO[]): Prisma.InputJsonValue {
  return env.map((e) => ({ label: e.label, value: e.value }));
}

/** Snapshot steps of a run case. */
export function runStepsOf(rc: Pick<RunCase, 'steps'>): RunStepDTO[] {
  return Array.isArray(rc.steps) ? (rc.steps as unknown as RunStepDTO[]) : [];
}

/** Per-step results of a run case, or null when none were recorded. */
export function stepResultsOf(v: unknown): StepResultDTO[] | null {
  return Array.isArray(v) ? (v as StepResultDTO[]) : null;
}

/** Step results as a nullable JSON column value (`null` → SQL NULL). */
export function stepResultsInput(
  v: StepResultDTO[] | null,
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return v === null ? Prisma.DbNull : (v as unknown as Prisma.InputJsonValue);
}

export function toRunDTO(
  run: TestRun,
  plan: Pick<TestPlan, 'docNo' | 'title' | 'status'>,
  suite: RunSuite,
  counts: StatusCounts,
  users: Map<number, UserRef>,
  sourceRun: RunRef | null = null,
  estimate: RunEstimate = { totalMinutes: 0, remainingMinutes: 0 },
): RunDTO {
  return {
    id: run.id,
    planId: run.planId,
    planDocNo: plan.docNo,
    planTitle: plan.title,
    planStatus: plan.status,
    suite: {
      id: suite.id,
      name: suite.name,
      prefix: suite.prefix,
      fieldDefs: fieldDefsOf(suite),
    },
    code: run.code,
    scenario: run.scenario,
    environment: envOf(run),
    tester: refOf(users, run.testerId),
    testedDate: dateOnly(run.testedDate),
    judgement: run.judgement,
    judgementNote: run.judgementNote,
    remark: run.remark,
    sortOrder: run.sortOrder,
    counts,
    suggestedJudgement: suggestJudgement(counts),
    sourceRun,
    estimate,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
  };
}

export function toRunCaseDTO(
  rc: RunCase,
  users: Map<number, UserRef>,
  defectCount = 0,
  attachmentCount = 0,
): RunCaseDTO {
  return {
    id: rc.id,
    runId: rc.runId,
    testCaseId: rc.testCaseId,
    displayId: rc.displayId,
    code: rc.code,
    title: rc.title,
    caseType: rc.caseType,
    sectionPath: rc.sectionPath ?? [],
    priority: rc.priority,
    tags: rc.tags ?? [],
    estimateMinutes: rc.estimateMinutes,
    references: rc.references,
    template: rc.template,
    precondition: rc.precondition,
    procedure: rc.procedure,
    expected: rc.expected,
    steps: runStepsOf(rc),
    caseRemark: rc.caseRemark,
    summaryGroup: rc.summaryGroup,
    custom: (rc.custom ?? {}) as Record<string, string>,
    sortOrder: rc.sortOrder,
    assignee: refOf(users, rc.assigneeId),
    status: rc.status,
    actualResult: rc.actualResult,
    resultRemark: rc.resultRemark,
    executedBy: refOf(users, rc.executedById),
    executedAt: iso(rc.executedAt),
    elapsedSec: rc.elapsedSec,
    stepResults: stepResultsOf(rc.stepResults),
    defectCount,
    attachmentCount,
  };
}

export function toResultHistoryDTO(
  h: RunCaseResult,
  users: Map<number, UserRef>,
): ResultHistoryDTO {
  return {
    id: h.id,
    status: h.status,
    actualResult: h.actualResult,
    remark: h.remark,
    elapsedSec: h.elapsedSec,
    stepResults: stepResultsOf(h.stepResults),
    source: h.source,
    executedBy: refOf(users, h.executedById),
    executedAt: h.executedAt.toISOString(),
  };
}

/** Run line of a PlanDTO. */
export function toRunSummaryDTO(
  run: TestRun,
  suiteName: string,
  counts: StatusCounts,
  sourceRun: RunRef | null,
): RunSummaryDTO {
  return {
    id: run.id,
    code: run.code,
    scenario: run.scenario,
    suiteName,
    environment: envOf(run),
    counts,
    judgement: run.judgement,
    sourceRun,
  };
}

/** PlanDTO from the plan row and its loaded parts; counts are the sum over its runs. */
export function toPlanDTO(
  p: TestPlan,
  parts: {
    release: NamedRef | null;
    signedCopy: AttachmentDTO | null;
    runs: RunSummaryDTO[];
    users: Map<number, UserRef>;
  },
): PlanDTO {
  const total = parts.runs.reduce((sum, r) => addCounts(sum, r.counts), emptyCounts());
  return {
    id: p.id,
    projectId: p.projectId,
    release: parts.release,
    docNo: p.docNo,
    title: p.title,
    purpose: p.purpose,
    testMethod: p.testMethod,
    judgementCriteria: p.judgementCriteria,
    rawDataPath: p.rawDataPath,
    overallJudgement: p.overallJudgement,
    judgementNote: p.judgementNote,
    suggestedJudgement: suggestJudgement(total),
    status: p.status,
    completedAt: iso(p.completedAt),
    completedBy: refOf(parts.users, p.completedById),
    templateId: p.templateId,
    signedCopy: parts.signedCopy,
    counts: total,
    runs: parts.runs,
    createdBy: refOf(parts.users, p.createdById),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

/** A run case of the same library case, with its run, plan and release. */
export interface CaseRunHistoryRow {
  id: number;
  status: ResultStatus;
  actualResult: string | null;
  executedById: number | null;
  executedAt: Date | null;
  run: {
    id: number;
    code: string;
    plan: { id: number; docNo: string; title: string; release: { name: string } | null };
  };
}

export function toCaseRunHistoryItem(
  r: CaseRunHistoryRow,
  users: Map<number, UserRef>,
): CaseRunHistoryItem {
  return {
    runCaseId: r.id,
    runId: r.run.id,
    runCode: r.run.code,
    planId: r.run.plan.id,
    planDocNo: r.run.plan.docNo,
    planTitle: r.run.plan.title,
    releaseName: r.run.plan.release?.name ?? null,
    status: r.status,
    actualResult: r.actualResult,
    executedBy: refOf(users, r.executedById),
    executedAt: iso(r.executedAt),
  };
}

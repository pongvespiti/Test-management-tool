/**
 * Pure rules of defects: the list filter, the workflow timestamps and the prefill of defects
 * reported from a run case (no database access — unit tested in defect-rules.spec.ts).
 */
import type { Prisma, RunCase, TestPlan, TestRun } from '@tmt/database';
import type { CreateDefectInput, DefectStatus, ListDefectsQuery } from '@tmt/shared';
import { escapeLike } from '../../common/http/pagination.js';
import { envOf } from '../execution/execution.queries.js';

/** `BUG-12`, `bug12` or `12` → search by defect number. */
const KEY_SEARCH = /^(?:bug-?)?(\d{1,9})$/i;

/** Prisma filter of `GET …/defects` (`listDefectsQuerySchema`), always scoped to the project. */
export function defectListWhere(projectId: number, q: ListDefectsQuery): Prisma.DefectWhereInput {
  const where: Prisma.DefectWhereInput = { projectId };
  if (q.status?.length) where.status = { in: q.status };
  if (q.severity?.length) where.severity = { in: q.severity };
  if (q.releaseId !== undefined) where.releaseId = q.releaseId;
  if (q.assigneeId !== undefined) where.assigneeId = q.assigneeId;
  const and: Prisma.DefectWhereInput[] = [];
  if (q.runId !== undefined) and.push({ links: { some: { runCase: { runId: q.runId } } } });
  if (q.planId !== undefined) {
    and.push({ links: { some: { runCase: { run: { planId: q.planId } } } } });
  }
  if (q.q) {
    // Prisma's `contains` passes the term into ILIKE unescaped: `%` and `_` must stay literal.
    const pattern = escapeLike(q.q);
    const key = KEY_SEARCH.exec(q.q.trim());
    and.push({
      OR: [
        { title: { contains: pattern, mode: 'insensitive' } },
        { externalKey: { contains: pattern, mode: 'insensitive' } },
        ...(key ? [{ seq: Number(key[1]) }] : []),
      ],
    });
  }
  if (and.length) where.AND = and;
  return where;
}

/** Resolved/closed timestamps that follow a workflow move to `to`. */
export function transitionPatch(
  to: DefectStatus,
  now: Date,
): { resolvedAt?: Date | null; closedAt?: Date | null } {
  switch (to) {
    case 'resolved':
      return { resolvedAt: now, closedAt: null };
    case 'closed':
    case 'rejected':
      return { closedAt: now };
    case 'reopened':
      return { resolvedAt: null, closedAt: null };
    default:
      return { closedAt: null };
  }
}

/** `FW: 1.1.6` lines of the filled environment entries of a run (null when none is filled). */
export function runEnvironmentText(run: Pick<TestRun, 'environment'>): string | null {
  return (
    envOf(run)
      .filter((e) => e.value.trim() !== '')
      .map((e) => `${e.label}: ${e.value}`)
      .join('\n') || null
  );
}

/** The run case a defect is reported from, with its run and plan. */
export interface DefectSource {
  rc: RunCase;
  run: TestRun;
  plan: TestPlan;
}

/** The value sent in the request, else the prefill (`null` and `''` count as sent). */
function pick<T>(sent: T | undefined, prefill: T | null): T | null {
  return sent !== undefined ? sent : prefill;
}

/**
 * Row of a new defect. Defects raised from a result default to that result's procedure,
 * expectation, actual result, environment and plan release; fields sent explicitly (also `null`
 * or `''`) win over the prefill.
 */
export function newDefectData(
  projectId: number,
  seq: number,
  reporterId: number,
  body: CreateDefectInput,
  source: DefectSource | null,
): Prisma.DefectUncheckedCreateInput {
  const rc = source?.rc ?? null;
  return {
    projectId,
    seq,
    title: body.title,
    description: body.description ?? null,
    steps: pick(body.steps, rc?.procedure ?? null),
    expected: pick(body.expected, rc?.expected ?? null),
    actual: pick(body.actual, rc?.actualResult ?? null),
    severity: body.severity,
    priority: body.priority,
    assigneeId: body.assigneeId ?? null,
    reporterId,
    releaseId: pick(body.releaseId, source?.plan.releaseId ?? null),
    foundIn: body.foundIn ?? null,
    fixedIn: body.fixedIn ?? null,
    environment: pick(body.environment, source ? runEnvironmentText(source.run) : null),
    externalKey: body.externalKey ?? null,
  };
}

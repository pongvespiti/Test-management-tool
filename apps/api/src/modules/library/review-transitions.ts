/**
 * Review transitions and change history shared by the review endpoints, bulk actions, shared-step
 * inlining and imports: version rows, batched activity entries and review comments.
 */
import type { Prisma, TestCase } from '@tmt/database';
import { displayId, type ReviewDecision } from '@tmt/shared';
import type { Db } from '../../prisma/prisma.service.js';
import { versionData } from './library.mapper.js';

/** Rows per multi-row insert (keeps statements far below PostgreSQL's parameter limit). */
const CHUNK = 500;
/** Same cap as ActivityService. */
const MAX_SUMMARY = 1000;

function chunked<T>(rows: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += CHUNK) out.push(rows.slice(i, i + CHUNK));
  return out;
}

/** Stores one `test_case_versions` row per changed case (with the case's current version). */
export async function insertVersions(
  db: Db,
  rows: readonly TestCase[],
  userId: number,
): Promise<void> {
  for (const part of chunked(rows)) {
    await db.testCaseVersion.createMany({
      data: part.map((r) => ({
        testCaseId: r.id,
        version: r.version,
        data: versionData(r) as Prisma.InputJsonValue,
        changedById: userId,
      })),
    });
  }
}

export interface ActivityItem {
  entityType: string;
  entityId: number | null;
  action: string;
  summary: string;
  data?: Record<string, unknown> | null;
}

/**
 * Appends activity entries of one project and user with one statement per chunk, inside the
 * transaction of the change (bulk transitions can touch up to 1000 cases at once, so the
 * one-row-per-call `ActivityService.log` is not used here).
 */
export async function logActivities(
  db: Db,
  projectId: number,
  userId: number,
  entries: readonly ActivityItem[],
): Promise<void> {
  for (const part of chunked(entries)) {
    await db.activityLog.createMany({
      data: part.map((e) => ({
        projectId,
        userId,
        entityType: e.entityType,
        entityId: e.entityId,
        action: e.action,
        summary: e.summary.slice(0, MAX_SUMMARY),
        data: (e.data ?? undefined) as Prisma.InputJsonValue | undefined,
      })),
    });
  }
}

/** Adds the same comment (a review note) to each case. */
async function reviewComments(
  db: Db,
  projectId: number,
  userId: number,
  rows: readonly TestCase[],
  body: string,
): Promise<void> {
  for (const part of chunked(rows)) {
    await db.comment.createMany({
      data: part.map((r) => ({
        projectId,
        entityType: 'test_case' as const,
        entityId: r.id,
        body,
        authorId: userId,
      })),
    });
  }
}

export interface TransitionContext {
  projectId: number;
  userId: number;
  /** Suite prefix per suite id (display ids in activity summaries). */
  prefixOf: (suiteId: number) => string;
}

function label(t: TransitionContext, r: TestCase): string {
  return `${displayId(t.prefixOf(r.suiteId), r.seq)} ${r.title}`;
}

const byId = (a: TestCase, b: TestCase) => a.id - b.id;

/**
 * Sends live draft/ready cases to review (others are skipped). Writes a version per case, activity
 * `review_requested` and, with a note, a comment on each case. Returns the updated rows.
 */
export async function submitForReview(
  tx: Db,
  t: TransitionContext,
  ids: readonly number[],
  opts: { reviewerId: number | null; note: string | null },
): Promise<TestCase[]> {
  if (ids.length === 0) return [];
  const rows = await tx.testCase.updateManyAndReturn({
    where: { id: { in: [...ids] }, status: { in: ['draft', 'ready'] }, isDeleted: false },
    data: {
      status: 'in_review',
      reviewerId: opts.reviewerId,
      reviewRequestedById: t.userId,
      reviewRequestedAt: new Date(),
      reviewedById: null,
      reviewedAt: null,
      reviewNote: opts.note,
      version: { increment: 1 },
      updatedById: t.userId,
    },
  });
  if (rows.length === 0) return rows;
  rows.sort(byId);
  await insertVersions(tx, rows, t.userId);
  await logActivities(
    tx,
    t.projectId,
    t.userId,
    rows.map((r) => ({
      entityType: 'test_case',
      entityId: r.id,
      action: 'review_requested',
      summary: `Requested review of ${label(t, r)}`,
      data: { reviewerId: opts.reviewerId, note: opts.note },
    })),
  );
  if (opts.note) {
    await reviewComments(tx, t.projectId, t.userId, rows, `Review requested: ${opts.note}`);
  }
  return rows;
}

/**
 * Lead decision on cases in review (others are skipped): approve → ready, request_changes → draft.
 * Writes a version per case, activity `review_approved` / `review_changes_requested` and, with a
 * note, a comment on each case. Returns the updated rows.
 */
export async function decideReview(
  tx: Db,
  t: TransitionContext,
  ids: readonly number[],
  opts: { decision: ReviewDecision; note: string | null },
): Promise<TestCase[]> {
  if (ids.length === 0) return [];
  const approve = opts.decision === 'approve';
  const rows = await tx.testCase.updateManyAndReturn({
    where: { id: { in: [...ids] }, status: 'in_review', isDeleted: false },
    data: {
      status: approve ? 'ready' : 'draft',
      reviewedById: t.userId,
      reviewedAt: new Date(),
      reviewNote: opts.note,
      version: { increment: 1 },
      updatedById: t.userId,
    },
  });
  if (rows.length === 0) return rows;
  rows.sort(byId);
  await insertVersions(tx, rows, t.userId);
  const note = opts.note ? `: ${opts.note.replace(/\s+/g, ' ').slice(0, 200)}` : '';
  await logActivities(
    tx,
    t.projectId,
    t.userId,
    rows.map((r) => ({
      entityType: 'test_case',
      entityId: r.id,
      action: approve ? 'review_approved' : 'review_changes_requested',
      summary: approve ? `Approved ${label(t, r)}` : `Requested changes on ${label(t, r)}${note}`,
      data: { decision: opts.decision, note: opts.note },
    })),
  );
  if (opts.note) {
    const body = `${approve ? 'Approved' : 'Changes requested'}: ${opts.note}`;
    await reviewComments(tx, t.projectId, t.userId, rows, body);
  }
  return rows;
}

/**
 * Business rules shared by case create/update/bulk, imports, JUnit and the review endpoints:
 * review policy, status transitions, step normalisation and shared-step references.
 */
import type { TestCase } from '@tmt/database';
import {
  normalizeText,
  roleAtLeast,
  type CaseStatus,
  type CaseStepInput,
  type ProjectRole,
} from '@tmt/shared';
import { forbidden, unprocessable } from '../../common/errors/app.exception.js';
import type { Db } from '../../prisma/prisma.service.js';
import { rawCaseSteps } from './library.mapper.js';
import type { SectionTree } from './section-tree.js';

/** A section given for a case (create, update, bulk move) must belong to the case's suite. */
export function assertSectionInSuite(
  tree: SectionTree,
  sectionId: number | null | undefined,
): void {
  if (sectionId !== null && sectionId !== undefined && !tree.byId.has(sectionId)) {
    throw unprocessable('BAD_SECTION', 'The section does not belong to this suite');
  }
}

// ---------------------------------------------------------------- review policy

export interface ReviewPolicy {
  /** Project setting `requireCaseReview`. */
  required: boolean;
  /** The caller is a lead of the project (admins act as lead). */
  isLead: boolean;
}

export async function loadReviewPolicy(
  db: Db,
  projectId: number,
  role: ProjectRole,
): Promise<ReviewPolicy> {
  const p = await db.project.findUnique({
    where: { id: projectId },
    select: { requireCaseReview: true },
  });
  return { required: Boolean(p?.requireCaseReview), isLead: roleAtLeast(role, 'lead') };
}

/** True when the caller may not make cases `ready` directly (review required, caller below lead). */
export function reviewEnforced(p: ReviewPolicy): boolean {
  return p.required && !p.isLead;
}

export function useReviewEndpoint() {
  return unprocessable(
    'USE_REVIEW_ENDPOINT',
    'Cases go to review through the submit-review action, not by setting the status',
  );
}

export function reviewRequired() {
  return forbidden(
    'This project requires a review — submit the case for review; only a lead can make it ready',
    'REVIEW_REQUIRED',
  );
}

/**
 * Status stored when a case is created (create, clone, import, JUnit): `in_review` is refused and
 * `ready` silently becomes `draft` when the project requires review and the caller is below lead.
 */
export function createStatus(requested: CaseStatus, p: ReviewPolicy): CaseStatus {
  if (requested === 'in_review') throw useReviewEndpoint();
  return requested === 'ready' && reviewEnforced(p) ? 'draft' : requested;
}

/**
 * Validates an explicit status change on update/bulk (`current` = null for bulk): `in_review` only
 * through the review endpoints (422 USE_REVIEW_ENDPOINT), `ready` only for leads when the project
 * requires review (403 REVIEW_REQUIRED). Re-sending the current status is not a change.
 */
export function assertStatusChange(
  current: CaseStatus | null,
  requested: CaseStatus,
  p: ReviewPolicy,
): void {
  if (requested === current) return;
  if (requested === 'in_review') throw useReviewEndpoint();
  if (requested === 'ready' && reviewEnforced(p)) throw reviewRequired();
}

// ---------------------------------------------------------------- steps

/** Canonical stored form of case steps: known keys only, texts normalised like other case texts. */
export function normalizeSteps(steps: readonly CaseStepInput[]): CaseStepInput[] {
  return steps.map((s): CaseStepInput =>
    s.kind === 'shared'
      ? { kind: 'shared', sharedStepId: s.sharedStepId }
      : {
          kind: 'step',
          action: normalizeText(s.action) ?? '',
          expected: normalizeText(s.expected ?? '') ?? '',
        },
  );
}

/** Every `{ kind: 'shared' }` step must reference a shared step of this project (422 BAD_SHARED_STEP). */
export async function assertSharedSteps(
  db: Db,
  projectId: number,
  steps: readonly CaseStepInput[],
): Promise<void> {
  const ids = [...new Set(steps.flatMap((s) => (s.kind === 'shared' ? [s.sharedStepId] : [])))];
  if (ids.length === 0) return;
  const found = await db.sharedStep.findMany({
    where: { projectId, id: { in: ids } },
    select: { id: true },
  });
  const ok = new Set(found.map((f) => f.id));
  const missing = ids.filter((id) => !ok.has(id));
  if (missing.length > 0) {
    throw unprocessable(
      'BAD_SHARED_STEP',
      `Shared step ${missing.join(', ')} does not exist in this project`,
      { sharedStepIds: missing },
    );
  }
}

// ---------------------------------------------------------------- reviewable content

export interface ReviewableChange {
  title?: string;
  precondition?: string | null;
  procedure?: string | null;
  expected?: string | null;
  template?: string;
  /** Already normalised (see {@link normalizeSteps}). */
  steps?: CaseStepInput[];
  /** Already cleaned against the suite's field definitions. */
  custom?: Record<string, string>;
}

function sameRecord(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const ka = Object.keys(a).filter((k) => a[k] !== undefined);
  const kb = Object.keys(b).filter((k) => b[k] !== undefined);
  return ka.length === kb.length && ka.every((k) => a[k] === b[k]);
}

/**
 * True when a reviewable field (title, precondition, procedure, expected, template, steps, custom)
 * really changes. Text values must already be normalised the way they are stored.
 */
export function reviewableChanged(c: TestCase, next: ReviewableChange): boolean {
  if (next.title !== undefined && next.title !== c.title) return true;
  if (next.precondition !== undefined && next.precondition !== c.precondition) return true;
  if (next.procedure !== undefined && next.procedure !== c.procedure) return true;
  if (next.expected !== undefined && next.expected !== c.expected) return true;
  if (next.template !== undefined && next.template !== c.template) return true;
  if (
    next.steps !== undefined &&
    JSON.stringify(next.steps) !== JSON.stringify(normalizeSteps(rawCaseSteps(c.steps)))
  ) {
    return true;
  }
  return (
    next.custom !== undefined &&
    !sameRecord(next.custom, (c.custom ?? {}) as Record<string, unknown>)
  );
}

/** A reviewer must be an active lead of the project or an administrator (422 BAD_REVIEWER). */
export async function assertReviewer(
  db: Db,
  projectId: number,
  reviewerId: number | null | undefined,
): Promise<void> {
  if (reviewerId === null || reviewerId === undefined) return;
  const u = await db.user.findUnique({
    where: { id: reviewerId },
    select: {
      isAdmin: true,
      isActive: true,
      memberships: { where: { projectId }, select: { role: true } },
    },
  });
  const role = u?.memberships[0]?.role;
  if (!u || !u.isActive || !(role === 'lead' || u.isAdmin)) {
    throw unprocessable('BAD_REVIEWER', 'The reviewer must be a lead of this project');
  }
}

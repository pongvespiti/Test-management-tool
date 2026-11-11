import { Injectable } from '@nestjs/common';
import { Prisma } from '@tmt/database';
import type { ReviewDecisionInput, SubmitReviewInput, TagCountDTO, TestCaseDTO } from '@tmt/shared';
import { conflict, unprocessable } from '../../common/errors/app.exception.js';
import type { AuthUser, ProjectContext } from '../../common/types/auth.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { assertReviewer } from './case-rules.js';
import { toCaseDTOs } from './cases.queries.js';
import { getCaseInProject } from './library.queries.js';
import { decideReview, submitForReview } from './review-transitions.js';

/** Most cases the review queue returns. */
const REVIEW_QUEUE_LIMIT = 500;
/** Most tags the tag list returns. */
const TAG_LIMIT = 500;

function invalidState(status: string) {
  return conflict(
    'INVALID_REVIEW_STATE',
    status === 'in_review'
      ? 'The case is already in review'
      : `A case that is ${status.replace('_', ' ')} cannot take this review action`,
    { status },
  );
}

/** Review workflow of single cases, the review queue and the project's tags. */
@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  /** draft/ready → in_review (409 INVALID_REVIEW_STATE otherwise; reviewer must be a lead). */
  async submit(
    ctx: ProjectContext,
    me: AuthUser,
    caseId: number,
    input: SubmitReviewInput,
  ): Promise<TestCaseDTO> {
    const db = this.prisma.db;
    const { c, suite } = await getCaseInProject(db, ctx.id, caseId);
    await assertReviewer(db, ctx.id, input.reviewerId);
    if (c.status !== 'draft' && c.status !== 'ready') throw invalidState(c.status);
    const [updated] = await db.$transaction(async (tx) => {
      const rows = await submitForReview(
        tx,
        { projectId: ctx.id, userId: me.id, prefixOf: () => suite.prefix },
        [c.id],
        { reviewerId: input.reviewerId ?? null, note: input.note ?? null },
      );
      if (rows.length === 0) throw invalidState('in_review');
      return rows;
    });
    const [dto] = await toCaseDTOs(db, [updated!]);
    return dto!;
  }

  /** Lead decision on a case in review: approve → ready, request_changes (note required) → draft. */
  async decide(
    ctx: ProjectContext,
    me: AuthUser,
    caseId: number,
    input: ReviewDecisionInput,
  ): Promise<TestCaseDTO> {
    const db = this.prisma.db;
    const { c, suite } = await getCaseInProject(db, ctx.id, caseId);
    const note = input.note ?? null;
    if (input.decision === 'request_changes' && !note) {
      throw unprocessable('NOTE_REQUIRED', 'Say what needs to change when requesting changes');
    }
    if (c.status !== 'in_review') throw invalidState(c.status);
    const [updated] = await db.$transaction(async (tx) => {
      const rows = await decideReview(
        tx,
        { projectId: ctx.id, userId: me.id, prefixOf: () => suite.prefix },
        [c.id],
        { decision: input.decision, note },
      );
      if (rows.length === 0) throw invalidState('reviewed');
      return rows;
    });
    const [dto] = await toCaseDTOs(db, [updated!]);
    return dto!;
  }

  /** Cases in review, oldest request first; `mine` = assigned to me or to nobody. */
  async queue(projectId: number, me: AuthUser, mine: boolean): Promise<TestCaseDTO[]> {
    const rows = await this.prisma.db.testCase.findMany({
      where: {
        status: 'in_review',
        isDeleted: false,
        suite: { projectId },
        ...(mine && { OR: [{ reviewerId: me.id }, { reviewerId: null }] }),
      },
      orderBy: [{ reviewRequestedAt: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
      take: REVIEW_QUEUE_LIMIT,
    });
    return toCaseDTOs(this.prisma.db, rows);
  }

  /**
   * Tags of live cases with the number of cases using them, most used first. Tags are unique per
   * case (case-insensitive), so count(*) counts cases; the most used spelling represents tags that
   * differ only in case.
   */
  async tags(projectId: number): Promise<TagCountDTO[]> {
    return this.prisma.db.$queryRaw<TagCountDTO[]>(Prisma.sql`
      SELECT mode() WITHIN GROUP (ORDER BY t.tag) AS tag, count(*)::int AS count
      FROM test_cases tc
      JOIN suites su ON su.id = tc.suite_id
      CROSS JOIN LATERAL unnest(tc.tags) AS t(tag)
      WHERE su.project_id = ${projectId} AND NOT tc.is_deleted
      GROUP BY lower(t.tag)
      ORDER BY count(*) DESC, lower(t.tag) ASC
      LIMIT ${TAG_LIMIT}`);
  }
}

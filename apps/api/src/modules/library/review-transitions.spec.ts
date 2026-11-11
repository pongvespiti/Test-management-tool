import { describe, expect, it } from '@jest/globals';
import { caseRow } from '../../../test/unit/fixtures.js';
import { createPrismaMock } from '../../../test/unit/prisma-mock.js';
import {
  decideReview,
  insertVersions,
  logActivities,
  submitForReview,
} from './review-transitions.js';

const t = { projectId: 10, userId: 7, prefixOf: () => 'MBS' };

describe('history helpers', () => {
  it('writes one version row per case, in chunks of 500', async () => {
    const { db } = createPrismaMock();
    const rows = Array.from({ length: 501 }, (_, i) => caseRow({ id: i + 1, version: 3 }));
    await insertVersions(db, rows, 7);
    expect(db.testCaseVersion.createMany).toHaveBeenCalledTimes(2);
    const first = db.testCaseVersion.createMany.mock.calls[0]![0]!.data as Record<
      string,
      unknown
    >[];
    expect(first).toHaveLength(500);
    expect(first[0]).toMatchObject({ testCaseId: 1, version: 3, changedById: 7 });
    expect(first[0]!.data).toMatchObject({ title: 'Power ON from app', status: 'ready' });
  });

  it('logs activity entries in one statement with truncated summaries', async () => {
    const { db } = createPrismaMock();
    await logActivities(db, 10, 7, [
      { entityType: 'test_case', entityId: 1, action: 'x', summary: 's'.repeat(1500) },
      { entityType: 'test_case', entityId: 2, action: 'y', summary: 'ok', data: { a: 1 } },
    ]);
    const data = db.activityLog.createMany.mock.calls[0]![0]!.data as Record<string, unknown>[];
    expect(data.map((d) => [d.entityId, d.action, String(d.summary).length, d.data])).toEqual([
      [1, 'x', 1000, undefined],
      [2, 'y', 2, { a: 1 }],
    ]);
    expect(data[0]).toMatchObject({ projectId: 10, userId: 7 });
  });
});

describe('submitForReview', () => {
  it('moves live draft/ready cases to review with version, activity and note comment', async () => {
    const { db } = createPrismaMock();
    db.testCase.updateManyAndReturn.mockResolvedValue([
      caseRow({ id: 9, seq: 2, title: 'B', status: 'in_review', version: 2 }),
      caseRow({ id: 4, seq: 1, title: 'A', status: 'in_review', version: 2 }),
    ]);
    const rows = await submitForReview(db, t, [4, 9], { reviewerId: 5, note: 'Check' });
    expect(rows.map((r) => r.id)).toEqual([4, 9]);
    const args = db.testCase.updateManyAndReturn.mock.calls[0]![0]!;
    expect(args.where).toEqual({
      id: { in: [4, 9] },
      status: { in: ['draft', 'ready'] },
      isDeleted: false,
    });
    expect(args.data).toMatchObject({
      status: 'in_review',
      reviewerId: 5,
      reviewRequestedById: 7,
      reviewedById: null,
      reviewNote: 'Check',
      version: { increment: 1 },
      updatedById: 7,
    });
    expect(db.testCaseVersion.createMany).toHaveBeenCalledTimes(1);
    const activity = db.activityLog.createMany.mock.calls[0]![0]!.data as Record<string, unknown>[];
    expect(activity[0]).toMatchObject({
      action: 'review_requested',
      summary: 'Requested review of MBS-001 A',
      data: { reviewerId: 5, note: 'Check' },
    });
    const comments = db.comment.createMany.mock.calls[0]![0]!.data as Record<string, unknown>[];
    expect(comments).toEqual([
      {
        projectId: 10,
        entityType: 'test_case',
        entityId: 4,
        body: 'Review requested: Check',
        authorId: 7,
      },
      {
        projectId: 10,
        entityType: 'test_case',
        entityId: 9,
        body: 'Review requested: Check',
        authorId: 7,
      },
    ]);
  });

  it('does nothing without ids or matching cases', async () => {
    const { db } = createPrismaMock();
    await expect(submitForReview(db, t, [], { reviewerId: null, note: null })).resolves.toEqual([]);
    expect(db.testCase.updateManyAndReturn).not.toHaveBeenCalled();
    db.testCase.updateManyAndReturn.mockResolvedValue([]);
    await submitForReview(db, t, [1], { reviewerId: null, note: null });
    expect(db.testCaseVersion.createMany).not.toHaveBeenCalled();
    expect(db.comment.createMany).not.toHaveBeenCalled();
  });
});

describe('decideReview', () => {
  it('approves cases in review without a comment when there is no note', async () => {
    const { db } = createPrismaMock();
    db.testCase.updateManyAndReturn.mockResolvedValue([caseRow({ id: 4, status: 'ready' })]);
    await decideReview(db, t, [4], { decision: 'approve', note: null });
    const args = db.testCase.updateManyAndReturn.mock.calls[0]![0]!;
    expect(args.where).toEqual({ id: { in: [4] }, status: 'in_review', isDeleted: false });
    expect(args.data).toMatchObject({ status: 'ready', reviewedById: 7, reviewNote: null });
    const activity = db.activityLog.createMany.mock.calls[0]![0]!.data as Record<string, unknown>[];
    expect(activity[0]).toMatchObject({
      action: 'review_approved',
      summary: 'Approved MBS-036 Power ON from app',
    });
    expect(db.comment.createMany).not.toHaveBeenCalled();
  });

  it('sends cases back to draft with the note in summary and comment', async () => {
    const { db } = createPrismaMock();
    db.testCase.updateManyAndReturn.mockResolvedValue([caseRow({ id: 4, status: 'draft' })]);
    await decideReview(db, t, [4], { decision: 'request_changes', note: 'Fix\n step 2' });
    expect(db.testCase.updateManyAndReturn.mock.calls[0]![0]!.data).toMatchObject({
      status: 'draft',
    });
    const activity = db.activityLog.createMany.mock.calls[0]![0]!.data as Record<string, unknown>[];
    expect(activity[0]).toMatchObject({
      action: 'review_changes_requested',
      summary: 'Requested changes on MBS-036 Power ON from app: Fix step 2',
    });
    const comments = db.comment.createMany.mock.calls[0]![0]!.data as Record<string, unknown>[];
    expect(comments[0]!.body).toBe('Changes requested: Fix\n step 2');
  });
});

import { beforeEach, describe, expect, it } from '@jest/globals';
import type { Prisma } from '@tmt/database';
import { authUser, caseRow, projectCtx, suiteRow, userRow } from '../../../test/unit/fixtures.js';
import { createPrismaMock, type PrismaMock } from '../../../test/unit/prisma-mock.js';
import { ReviewsService } from './reviews.service.js';

describe('ReviewsService', () => {
  const me = authUser({ id: 1 });
  const ctx = projectCtx({ role: 'tester' });
  let mock: PrismaMock;
  let service: ReviewsService;

  beforeEach(() => {
    mock = createPrismaMock();
    service = new ReviewsService(mock.prisma);
    mock.db.suite.findMany.mockResolvedValue([{ id: 2, prefix: 'MBS' }] as never);
    mock.db.section.findMany.mockResolvedValue([]);
    mock.db.user.findMany.mockResolvedValue([userRow()]);
  });

  const inProject = (status: 'draft' | 'ready' | 'in_review' | 'deprecated') =>
    mock.db.testCase.findFirst.mockResolvedValue({
      ...caseRow({ status }),
      suite: suiteRow(),
    } as never);

  it('submits draft/ready cases and refuses other states', async () => {
    inProject('deprecated');
    await expect(service.submit(ctx, me, 100, {})).rejects.toMatchObject({
      code: 'INVALID_REVIEW_STATE',
      message: 'A case that is deprecated cannot take this review action',
      details: { status: 'deprecated' },
    });
    inProject('draft');
    mock.db.testCase.updateManyAndReturn.mockResolvedValue([
      caseRow({ status: 'in_review', reviewRequestedById: 1 }),
    ]);
    const dto = await service.submit(ctx, me, 100, { note: 'Please' });
    expect(dto).toMatchObject({ status: 'in_review', review: { requestedBy: { id: 1 } } });
    expect(mock.db.comment.createMany).toHaveBeenCalled();
  });

  it('reports a concurrent submit as already in review', async () => {
    inProject('ready');
    mock.db.testCase.updateManyAndReturn.mockResolvedValue([]);
    await expect(service.submit(ctx, me, 100, {})).rejects.toMatchObject({
      code: 'INVALID_REVIEW_STATE',
      message: 'The case is already in review',
    });
  });

  it('needs a note to request changes and a case in review', async () => {
    inProject('in_review');
    await expect(
      service.decide(ctx, me, 100, { decision: 'request_changes' }),
    ).rejects.toMatchObject({ code: 'NOTE_REQUIRED' });
    inProject('ready');
    await expect(service.decide(ctx, me, 100, { decision: 'approve' })).rejects.toMatchObject({
      code: 'INVALID_REVIEW_STATE',
    });
    inProject('in_review');
    mock.db.testCase.updateManyAndReturn.mockResolvedValue([caseRow({ status: 'draft' })]);
    const dto = await service.decide(ctx, me, 100, { decision: 'request_changes', note: 'Fix' });
    expect(dto.status).toBe('draft');
  });

  it('lists the queue oldest first; mine = assigned to me or unassigned', async () => {
    mock.db.testCase.findMany.mockResolvedValue([caseRow({ status: 'in_review' })]);
    await service.queue(10, me, true);
    const args = mock.db.testCase.findMany.mock.calls[0]![0]!;
    expect(args.where).toEqual({
      status: 'in_review',
      isDeleted: false,
      suite: { projectId: 10 },
      OR: [{ reviewerId: 1 }, { reviewerId: null }],
    });
    expect(args.orderBy).toEqual([
      { reviewRequestedAt: { sort: 'asc', nulls: 'last' } },
      { id: 'asc' },
    ]);
    expect(args.take).toBe(500);
    await service.queue(10, me, false);
    expect(mock.db.testCase.findMany.mock.calls[1]![0]!.where).not.toHaveProperty('OR');
  });

  it('counts tags of live cases of the project', async () => {
    mock.db.$queryRaw.mockResolvedValue([{ tag: 'Wifi', count: 3 }] as never);
    await expect(service.tags(10)).resolves.toEqual([{ tag: 'Wifi', count: 3 }]);
    const sql = mock.db.$queryRaw.mock.calls[0]![0] as unknown as Prisma.Sql;
    expect(sql.text).toContain('GROUP BY lower(t.tag)');
    expect(sql.values).toEqual([10, 500]);
  });
});

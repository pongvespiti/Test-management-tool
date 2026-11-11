import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  authUser,
  caseRow,
  projectCtx,
  projectRow,
  suiteRow,
} from '../../../test/unit/fixtures.js';
import { createPrismaMock, type PrismaMock } from '../../../test/unit/prisma-mock.js';
import type { ActivityService } from '../activity/activity.service.js';
import { CaseBulkService, withoutTags, withTags } from './case-bulk.service.js';

describe('tag helpers', () => {
  it('adds tags case-insensitively, keeping existing spellings, at most 30', () => {
    expect(withTags(['Keep'], ['keep', 'Nightly'])).toEqual(['Keep', 'Nightly']);
    const many = Array.from({ length: 29 }, (_, i) => `t${i}`);
    expect(withTags(many, ['a', 'b'])).toHaveLength(30);
    expect(withoutTags(['Keep', 'Nightly'], ['NIGHTLY', 'absent'])).toEqual(['Keep']);
  });
});

describe('CaseBulkService', () => {
  const me = authUser({ id: 1 });
  const tester = projectCtx({ role: 'tester' });
  const lead = projectCtx({ role: 'lead' });
  const scope = { suiteId: 2, id: { in: [100, 101] }, isDeleted: false };
  let mock: PrismaMock;
  let activity: { log: jest.Mock<ActivityService['log']> };
  let service: CaseBulkService;

  beforeEach(() => {
    mock = createPrismaMock();
    activity = { log: jest.fn<ActivityService['log']>().mockResolvedValue(undefined) };
    service = new CaseBulkService(mock.prisma, activity as unknown as ActivityService);
    mock.db.suite.findFirst.mockResolvedValue(suiteRow());
  });

  it('needs the lead role to delete or approve', async () => {
    await expect(
      service.run(tester, me, 2, { action: 'delete', ids: [100] }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', message: 'This action needs the lead role' });
    await expect(
      service.run(tester, me, 2, { action: 'approve', ids: [100] }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(mock.db.$transaction).not.toHaveBeenCalled();
  });

  it('checks moves, status changes and reviewers before writing', async () => {
    mock.db.section.findMany.mockResolvedValue([]);
    await expect(
      service.run(tester, me, 2, { action: 'move', ids: [100], sectionId: 9 }),
    ).rejects.toMatchObject({ code: 'BAD_SECTION' });
    mock.db.project.findUnique.mockResolvedValue(projectRow({ requireCaseReview: true }));
    await expect(
      service.run(tester, me, 2, { action: 'setStatus', ids: [100], status: 'ready' }),
    ).rejects.toMatchObject({ code: 'REVIEW_REQUIRED' });
    mock.db.user.findUnique.mockResolvedValue(null);
    await expect(
      service.run(tester, me, 2, { action: 'submitReview', ids: [100], reviewerId: 5 }),
    ).rejects.toMatchObject({ code: 'BAD_REVIEWER' });
  });

  it('sets the priority of cases that differ and logs the bulk action', async () => {
    mock.db.testCase.updateManyAndReturn.mockResolvedValue([caseRow({ id: 100, version: 2 })]);
    await expect(
      service.run(tester, me, 2, { action: 'setPriority', ids: [100, 101, 100], priority: 'high' }),
    ).resolves.toEqual({ affected: 1 });
    expect(mock.db.testCase.updateManyAndReturn).toHaveBeenCalledWith({
      where: { ...scope, priority: { not: 'high' } },
      data: { priority: 'high', version: { increment: 1 }, updatedById: 1 },
    });
    expect(mock.db.testCaseVersion.createMany).toHaveBeenCalledTimes(1);
    expect(activity.log.mock.calls[0]![1]).toEqual({
      projectId: 10,
      userId: 1,
      entityType: 'suite',
      entityId: 2,
      action: 'bulk_setPriority',
      summary: 'Bulk setPriority on 1 cases in Modbus system test',
      data: { ids: [100] },
    });
  });

  it('updates only cases whose tags change, under row locks', async () => {
    mock.db.$queryRaw.mockResolvedValue([
      { id: 100, tags: ['Keep'] },
      { id: 101, tags: ['Keep', 'nightly'] },
    ] as never);
    mock.db.testCase.update.mockResolvedValue(caseRow({ id: 100 }));
    await expect(
      service.run(tester, me, 2, { action: 'addTags', ids: [100, 101], tags: ['Nightly'] }),
    ).resolves.toEqual({ affected: 1 });
    const [strings] = mock.db.$queryRaw.mock.calls[0]! as unknown as [string[]];
    expect(strings.join('?')).toContain('FOR UPDATE');
    expect(mock.db.testCase.update).toHaveBeenCalledWith({
      where: { id: 100 },
      data: { tags: ['Keep', 'Nightly'], version: { increment: 1 }, updatedById: 1 },
    });
  });

  it('soft-deletes without new versions and moves with versions', async () => {
    mock.db.testCase.updateManyAndReturn.mockResolvedValue([caseRow()]);
    await service.run(lead, me, 2, { action: 'delete', ids: [100, 101] });
    expect(mock.db.testCase.updateManyAndReturn.mock.calls[0]![0]).toEqual({
      where: scope,
      data: { isDeleted: true, updatedById: 1 },
    });
    expect(mock.db.testCaseVersion.createMany).not.toHaveBeenCalled();
    mock.db.section.findMany.mockResolvedValue([]);
    await service.run(tester, me, 2, { action: 'move', ids: [100, 101], sectionId: null });
    expect(mock.db.testCase.updateManyAndReturn.mock.calls[1]![0]!.data).toEqual({
      sectionId: null,
      version: { increment: 1 },
      updatedById: 1,
    });
    expect(mock.db.testCaseVersion.createMany).toHaveBeenCalledTimes(1);
  });

  it('submits and approves the cases of the suite through the review transitions', async () => {
    mock.db.testCase.findMany.mockResolvedValue([{ id: 100 }] as never);
    mock.db.testCase.updateManyAndReturn.mockResolvedValue([]);
    await service.run(tester, me, 2, { action: 'submitReview', ids: [100, 101] });
    expect(mock.db.testCase.findMany.mock.calls[0]![0]!.where).toEqual(scope);
    expect(mock.db.testCase.updateManyAndReturn.mock.calls[0]![0]!.data).toMatchObject({
      status: 'in_review',
      reviewerId: null,
    });
    await service.run(lead, me, 2, { action: 'approve', ids: [100, 101] });
    expect(mock.db.testCase.updateManyAndReturn.mock.calls[1]![0]!.data).toMatchObject({
      status: 'ready',
      reviewedById: 1,
    });
  });
});

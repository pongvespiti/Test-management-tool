import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Comment } from '@tmt/database';
import { authUser, defectRow, projectCtx, userRow } from '../../../test/unit/fixtures.js';
import { createPrismaMock, type PrismaMock } from '../../../test/unit/prisma-mock.js';
import type { ActivityService } from '../activity/activity.service.js';
import type { StorageService } from '../storage/storage.service.js';
import { CommentsService } from './comments.service.js';

const T0 = new Date('2026-01-15T08:00:00.000Z');

function commentRow(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 4,
    projectId: 10,
    entityType: 'defect',
    entityId: 30,
    body: 'Looks flaky',
    authorId: 2,
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

describe('CommentsService', () => {
  let mock: PrismaMock;
  let activity: { log: jest.Mock<ActivityService['log']> };
  let storage: { removeMany: jest.Mock<StorageService['removeMany']> };
  let service: CommentsService;

  beforeEach(() => {
    mock = createPrismaMock();
    activity = { log: jest.fn<ActivityService['log']>().mockResolvedValue(undefined) };
    storage = { removeMany: jest.fn<StorageService['removeMany']>().mockResolvedValue(undefined) };
    service = new CommentsService(
      mock.prisma,
      activity as unknown as ActivityService,
      storage as unknown as StorageService,
    );
  });

  it('lists the comments of an entity oldest first with their authors', async () => {
    mock.db.comment.findMany.mockResolvedValue([commentRow()]);
    mock.db.user.findMany.mockResolvedValue([userRow({ id: 2, username: 'tester' })]);
    const list = await service.list(10, 'run_case', 50);
    expect(list).toEqual([
      expect.objectContaining({
        id: 4,
        body: 'Looks flaky',
        author: { id: 2, username: 'tester', displayName: 'Alice' },
        createdAt: T0.toISOString(),
      }),
    ]);
    expect(mock.db.comment.findMany.mock.calls[0]![0]).toEqual({
      where: { projectId: 10, entityType: 'run_case', entityId: 50 },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  });

  it('comments on an entity of the project and quotes it in the activity entry', async () => {
    mock.db.defect.findFirst.mockResolvedValue(defectRow({ seq: 3 }));
    mock.db.comment.create.mockResolvedValue(commentRow({ authorId: 1 }));
    mock.db.user.findMany.mockResolvedValue([userRow({ id: 1 })]);
    const body = `Seen\n\n  again ${'x'.repeat(200)}`;
    const dto = await service.create(projectCtx(), authUser({ id: 1 }), {
      entityType: 'defect',
      entityId: 30,
      body,
    });
    expect(dto.author?.id).toBe(1);
    expect(mock.db.comment.create).toHaveBeenCalledWith({
      data: { projectId: 10, entityType: 'defect', entityId: 30, body, authorId: 1 },
    });
    const entry = activity.log.mock.calls[0]![1];
    expect(entry).toMatchObject({ action: 'commented', entityType: 'defect', entityId: 30 });
    expect(entry.summary).toBe(`Commented on BUG-3: Seen again ${'x'.repeat(109)}`);
  });

  it('does not comment on entities outside the project', async () => {
    mock.db.testPlan.findFirst.mockResolvedValue(null);
    await expect(
      service.create(projectCtx(), authUser(), { entityType: 'plan', entityId: 9, body: 'x' }),
    ).rejects.toMatchObject({ code: 'PLAN_NOT_FOUND' });
    expect(mock.db.comment.create).not.toHaveBeenCalled();
  });

  describe('remove', () => {
    it('lets only the author or a lead delete', async () => {
      mock.db.comment.findFirst.mockResolvedValue(null);
      await expect(service.remove(projectCtx(), authUser(), 4)).rejects.toMatchObject({
        code: 'COMMENT_NOT_FOUND',
      });
      mock.db.comment.findFirst.mockResolvedValue(commentRow({ authorId: 2 }));
      await expect(
        service.remove(projectCtx({ role: 'tester' }), authUser({ id: 3 }), 4),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: 'Only the author or a project lead can delete this comment',
      });
      expect(mock.db.comment.delete).not.toHaveBeenCalled();
    });

    it('deletes the comment with its files and logs it on the commented entity', async () => {
      mock.db.comment.findFirst.mockResolvedValue(commentRow({ authorId: 2 }));
      mock.db.attachment.findMany.mockResolvedValue([{ storageKey: 'files/a' }] as never);
      await service.remove(projectCtx({ role: 'viewer' }), authUser({ id: 2 }), 4);
      expect(mock.db.attachment.deleteMany).toHaveBeenCalledWith({
        where: { entityType: 'comment', entityId: { in: [4] } },
      });
      expect(mock.db.comment.delete).toHaveBeenCalledWith({ where: { id: 4 } });
      expect(activity.log.mock.calls[0]![1]).toMatchObject({
        entityType: 'defect',
        entityId: 30,
        action: 'comment_deleted',
        summary: 'Deleted a comment',
      });
      expect(storage.removeMany).toHaveBeenCalledWith(['files/a']);

      await service.remove(projectCtx({ role: 'lead' }), authUser({ id: 9 }), 4);
      expect(mock.db.comment.delete).toHaveBeenCalledTimes(2);
    });
  });
});

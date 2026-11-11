import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Prisma } from '@tmt/database';
import { authUser, projectCtx, projectRow, unitConfig } from '../../../test/unit/fixtures.js';
import { createPrismaMock, type PrismaMock } from '../../../test/unit/prisma-mock.js';
import type { ActivityService } from '../activity/activity.service.js';
import { ProjectsService } from './projects.service.js';

describe('ProjectsService', () => {
  const me = authUser({ id: 1 });
  let mock: PrismaMock;
  let activity: { log: jest.Mock<ActivityService['log']> };
  let service: ProjectsService;

  beforeEach(() => {
    mock = createPrismaMock();
    activity = { log: jest.fn<ActivityService['log']>().mockResolvedValue(undefined) };
    service = new ProjectsService(
      mock.prisma,
      unitConfig({ DEFAULT_DOC_NO_PATTERN: 'DOC-{YYYY}-{SEQ}' }),
      activity as unknown as ActivityService,
    );
  });

  describe('listFor', () => {
    it('shows every project to administrators, as lead', async () => {
      mock.db.project.findMany.mockResolvedValue([projectRow(), projectRow({ id: 11, key: 'AB' })]);
      const list = await service.listFor(authUser({ isAdmin: true }));
      expect(list.map((p) => [p.key, p.myRole])).toEqual([
        ['ACS', 'lead'],
        ['AB', 'lead'],
      ]);
    });

    it('shows members only their projects with their role', async () => {
      mock.db.projectMember.findMany.mockResolvedValue([
        { projectId: 10, userId: 1, role: 'viewer', project: projectRow() },
      ] as never);
      await expect(service.listFor(me)).resolves.toMatchObject([{ key: 'ACS', myRole: 'viewer' }]);
      expect(mock.db.projectMember.findMany.mock.calls[0]![0]!.where).toEqual({ userId: 1 });
    });
  });

  describe('create', () => {
    it('makes the creator lead and falls back to the configured doc-no pattern', async () => {
      mock.db.project.create.mockImplementation((async (args: { data: Record<string, unknown> }) =>
        projectRow({ docNoPattern: args.data.docNoPattern as string })) as never);
      const dto = await service.create(me, { key: 'ACS', name: 'ACS Smart control' });
      const data = mock.db.project.create.mock.calls[0]![0].data;
      expect(data).toMatchObject({
        key: 'ACS',
        docNoPattern: 'DOC-{YYYY}-{SEQ}',
        createdById: 1,
        members: { create: { userId: 1, role: 'lead' } },
      });
      expect(dto).toMatchObject({ key: 'ACS', myRole: 'lead', docNoPattern: 'DOC-{YYYY}-{SEQ}' });
      expect(activity.log.mock.calls[0]![1]).toMatchObject({ action: 'created', projectId: 10 });
    });

    it('answers PROJECT_KEY_TAKEN for a duplicate key', async () => {
      mock.db.project.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'test' }),
      );
      await expect(service.create(me, { key: 'ACS', name: 'x' })).rejects.toMatchObject({
        code: 'PROJECT_KEY_TAKEN',
      });
    });
  });

  it('updates only the given fields and resets a cleared doc-no pattern to the default', async () => {
    mock.db.project.update.mockResolvedValue(projectRow({ isArchived: true }));
    await service.update(projectCtx(), me, { isArchived: true, docNoPattern: null });
    expect(mock.db.project.update.mock.calls[0]![0].data).toEqual({
      docNoPattern: 'DOC-{YYYY}-{SEQ}',
      isArchived: true,
    });
  });

  it('returns 404 when the project vanished', async () => {
    mock.db.project.findUnique.mockResolvedValue(null);
    await expect(service.get(projectCtx())).rejects.toMatchObject({ code: 'PROJECT_NOT_FOUND' });
  });

  describe('members', () => {
    it('sorts leads first, then testers, then viewers', async () => {
      const member = (id: number, role: string, displayName: string) => ({
        role,
        user: { id, username: `u${id}`, displayName },
      });
      mock.db.projectMember.findMany.mockResolvedValue([
        member(1, 'viewer', 'Anna'),
        member(2, 'lead', 'Bert'),
        member(3, 'tester', 'Cora'),
      ] as never);
      const list = await service.members(10);
      expect(list.map((m) => m.role)).toEqual(['lead', 'tester', 'viewer']);
    });

    it('requires at least one lead', async () => {
      await expect(
        service.setMembers(projectCtx(), me, { members: [{ userId: 2, role: 'tester' }] }),
      ).rejects.toMatchObject({ code: 'LEAD_REQUIRED' });
    });

    it('rejects unknown users', async () => {
      mock.db.user.count.mockResolvedValue(1);
      await expect(
        service.setMembers(projectCtx(), me, {
          members: [
            { userId: 1, role: 'lead' },
            { userId: 99, role: 'tester' },
          ],
        }),
      ).rejects.toMatchObject({ code: 'UNKNOWN_USER' });
    });

    it('replaces the member list (last role per user wins)', async () => {
      mock.db.user.count.mockResolvedValue(2);
      mock.db.projectMember.findMany.mockResolvedValue([]);
      await service.setMembers(projectCtx(), me, {
        members: [
          { userId: 1, role: 'tester' },
          { userId: 1, role: 'lead' },
          { userId: 2, role: 'viewer' },
        ],
      });
      expect(mock.db.projectMember.deleteMany).toHaveBeenCalledWith({ where: { projectId: 10 } });
      expect(mock.db.projectMember.createMany.mock.calls[0]![0]!.data).toEqual([
        { projectId: 10, userId: 1, role: 'lead' },
        { projectId: 10, userId: 2, role: 'viewer' },
      ]);
    });
  });
});

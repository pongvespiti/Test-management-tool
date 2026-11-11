import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Prisma } from '@tmt/database';
import {
  authUser,
  caseRow,
  projectCtx,
  projectRow,
  suiteRow,
  userRow,
} from '../../../test/unit/fixtures.js';
import { createPrismaMock, type PrismaMock } from '../../../test/unit/prisma-mock.js';
import type { ActivityService } from '../activity/activity.service.js';
import { CasesService } from './cases.service.js';

const createInput = {
  title: 'Power ON',
  caseType: 'Normal' as const,
  status: 'ready' as const,
  priority: 'medium' as const,
  tags: [],
  template: 'text' as const,
  steps: [],
  custom: {},
};

describe('CasesService', () => {
  const me = authUser({ id: 1 });
  const tester = projectCtx({ role: 'tester' });
  let mock: PrismaMock;
  let activity: { log: jest.Mock<ActivityService['log']> };
  let service: CasesService;

  beforeEach(() => {
    mock = createPrismaMock();
    activity = { log: jest.fn<ActivityService['log']>().mockResolvedValue(undefined) };
    service = new CasesService(mock.prisma, activity as unknown as ActivityService);
    mock.db.section.findMany.mockResolvedValue([]);
    mock.db.user.findMany.mockResolvedValue([userRow()]);
    mock.db.project.findUnique.mockResolvedValue(projectRow({ requireCaseReview: true }));
  });

  describe('search', () => {
    it('searches the whole project with the given limit', async () => {
      mock.db.$queryRaw.mockResolvedValueOnce([{ total: 0 }] as never);
      await expect(service.search(10, { q: 'login', limit: 5 })).resolves.toEqual({
        items: [],
        total: 0,
      });
      const sql = mock.db.$queryRaw.mock.calls[0]![0] as Prisma.Sql;
      expect(sql.values[0]).toBe(10);
    });
  });

  describe('list', () => {
    it('answers SECTION_NOT_FOUND for a section outside the suite', async () => {
      mock.db.suite.findFirst.mockResolvedValue(suiteRow());
      await expect(
        service.list(10, 2, { page: 1, pageSize: 50, includeSubsections: true, sectionId: 9 }),
      ).rejects.toMatchObject({ code: 'SECTION_NOT_FOUND' });
    });

    it('returns one page with the total', async () => {
      mock.db.suite.findFirst.mockResolvedValue(suiteRow());
      mock.db.$queryRaw
        .mockResolvedValueOnce([{ total: 3 }] as never)
        .mockResolvedValueOnce([{ id: 100 }] as never);
      mock.db.testCase.findMany.mockResolvedValue([caseRow()]);
      const page = await service.list(10, 2, { page: 2, pageSize: 2, includeSubsections: true });
      expect(page).toMatchObject({ total: 3, page: 2, pageSize: 2 });
      expect(page.items.map((c) => c.displayId)).toEqual(['MBS-036']);
    });
  });

  describe('create', () => {
    it('stores ready as draft for a tester when review is required', async () => {
      mock.db.suite.findFirst.mockResolvedValue(suiteRow());
      mock.db.suite.update.mockResolvedValue({ nextSeq: 2 } as never);
      mock.db.testCase.aggregate.mockResolvedValue({ _max: { sortOrder: null } } as never);
      mock.db.testCase.create.mockImplementation((async (args: { data: object }) =>
        caseRow({ ...(args.data as object), id: 101 })) as never);
      const dto = await service.create(tester, me, 2, createInput);
      expect(dto.status).toBe('draft');
      expect(mock.db.testCase.create.mock.calls[0]![0].data).toMatchObject({ status: 'draft' });
      expect(activity.log.mock.calls[0]![1]).toMatchObject({
        entityType: 'test_case',
        entityId: 101,
        action: 'created',
        summary: 'Created case Power ON',
      });
    });

    it('validates the section and maps a duplicate code to CASE_CODE_TAKEN', async () => {
      mock.db.suite.findFirst.mockResolvedValue(suiteRow());
      await expect(
        service.create(tester, me, 2, { ...createInput, sectionId: 5 }),
      ).rejects.toMatchObject({ code: 'BAD_SECTION' });
      mock.db.suite.update.mockResolvedValue({ nextSeq: 2 } as never);
      mock.db.testCase.aggregate.mockResolvedValue({ _max: { sortOrder: null } } as never);
      mock.db.testCase.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: 'test',
          meta: {
            driverAdapterError: {
              cause: { constraint: { index: 'test_cases_suite_code_live_key' } },
            },
          },
        }),
      );
      await expect(
        service.create(tester, me, 2, { ...createInput, code: 'MB-1' }),
      ).rejects.toMatchObject({
        code: 'CASE_CODE_TAKEN',
        message: expect.stringContaining('MB-1'),
      });
    });
  });

  describe('update', () => {
    beforeEach(() => {
      mock.db.testCase.findFirst.mockResolvedValue({
        ...caseRow({ status: 'ready', version: 4, procedure: 'Step 1' }),
        suite: suiteRow(),
      } as never);
    });

    it('rejects a stale version before writing', async () => {
      await expect(
        service.update(tester, me, 100, { title: 'x', version: 3 }),
      ).rejects.toMatchObject({ code: 'VERSION_CONFLICT', details: { currentVersion: 4 } });
      expect(mock.db.testCase.update).not.toHaveBeenCalled();
    });

    it('turns a concurrent change into VERSION_CONFLICT', async () => {
      mock.db.testCase.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('gone', { code: 'P2025', clientVersion: 'test' }),
      );
      await expect(service.update(tester, me, 100, { title: 'x' })).rejects.toMatchObject({
        code: 'VERSION_CONFLICT',
      });
      expect(mock.db.testCase.update.mock.calls[0]![0].where).toEqual({ id: 100, version: 4 });
    });

    it('sends a ready case back to draft when a tester changes reviewable content', async () => {
      mock.db.testCase.update.mockImplementation((async () =>
        caseRow({ status: 'draft', version: 5, title: 'x' })) as never);
      await service.update(tester, me, 100, { procedure: 'Step 2  ', status: 'ready' });
      const data = mock.db.testCase.update.mock.calls[0]![0].data;
      expect(data).toEqual({
        status: 'draft',
        procedure: 'Step 2',
        version: { increment: 1 },
        updatedById: 1,
      });
      expect(mock.db.testCaseVersion.createMany).toHaveBeenCalled();
      expect(activity.log.mock.calls[0]![1]).toMatchObject({
        action: 'updated',
        summary: 'Updated case x (v5) — back to draft for review',
        data: { statusReset: 'draft' },
      });
    });

    it('keeps the status for unchanged content and refuses in_review', async () => {
      mock.db.testCase.update.mockResolvedValue(caseRow({ version: 5 }));
      await service.update(tester, me, 100, { procedure: 'Step 1', priority: 'high' });
      expect(mock.db.testCase.update.mock.calls[0]![0].data).toMatchObject({
        status: 'ready',
        priority: 'high',
      });
      await expect(service.update(tester, me, 100, { status: 'in_review' })).rejects.toMatchObject({
        code: 'USE_REVIEW_ENDPOINT',
      });
    });
  });

  it('soft-deletes a case', async () => {
    mock.db.testCase.findFirst.mockResolvedValue({ ...caseRow(), suite: suiteRow() } as never);
    await service.remove(tester, me, 100);
    expect(mock.db.testCase.update).toHaveBeenCalledWith({
      where: { id: 100 },
      data: { isDeleted: true, updatedById: 1 },
    });
    expect(activity.log.mock.calls[0]![1]).toMatchObject({
      action: 'deleted',
      summary: 'Deleted case Power ON from app',
    });
  });

  it('clones a case in review as a draft next to the original', async () => {
    mock.db.testCase.findFirst.mockResolvedValue({
      ...caseRow({ status: 'in_review', code: 'X-1', sortOrder: 6, tags: ['a'] }),
      suite: suiteRow(),
    } as never);
    mock.db.project.findUnique.mockResolvedValue(projectRow());
    mock.db.suite.update.mockResolvedValue({ nextSeq: 50 } as never);
    mock.db.testCase.create.mockResolvedValue(caseRow({ id: 120 }));
    await service.clone(tester, me, 100);
    expect(mock.db.testCase.create.mock.calls[0]![0].data).toMatchObject({
      code: null,
      title: 'Power ON from app (copy)',
      status: 'draft',
      sortOrder: 6,
      tags: ['a'],
    });
    expect(activity.log.mock.calls[0]![1]).toMatchObject({
      entityId: 120,
      summary: 'Cloned case Power ON from app',
      data: { from: 100 },
    });
  });

  it('lists versions newest first with the author', async () => {
    mock.db.testCase.findFirst.mockResolvedValue({ ...caseRow(), suite: suiteRow() } as never);
    mock.db.testCaseVersion.findMany.mockResolvedValue([
      {
        id: 1,
        testCaseId: 100,
        version: 2,
        data: { title: 'v2' },
        changedById: 1,
        changedAt: new Date('2026-02-01T00:00:00Z'),
      },
    ]);
    await expect(service.versions(10, 100)).resolves.toEqual([
      {
        version: 2,
        data: { title: 'v2' },
        changedBy: { id: 1, username: 'alice', displayName: 'Alice' },
        changedAt: '2026-02-01T00:00:00.000Z',
      },
    ]);
    expect(mock.db.testCaseVersion.findMany.mock.calls[0]![0]!.orderBy).toEqual([
      { version: 'desc' },
      { id: 'desc' },
    ]);
  });
});

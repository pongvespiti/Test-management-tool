import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { authUser, projectCtx, sectionRow, suiteRow } from '../../../test/unit/fixtures.js';
import { createPrismaMock, type PrismaMock } from '../../../test/unit/prisma-mock.js';
import type { ActivityService } from '../activity/activity.service.js';
import { SectionsService } from './sections.service.js';

/** `groupBy` has overloads the deep mock cannot type. */
const groupByMock = (m: PrismaMock) =>
  m.db.testCase.groupBy as unknown as jest.Mock<(args: { where?: unknown }) => Promise<unknown>>;

describe('SectionsService', () => {
  const me = authUser();
  const ctx = projectCtx();
  let mock: PrismaMock;
  let activity: { log: jest.Mock<ActivityService['log']> };
  let service: SectionsService;

  beforeEach(() => {
    mock = createPrismaMock();
    activity = { log: jest.fn<ActivityService['log']>().mockResolvedValue(undefined) };
    service = new SectionsService(mock.prisma, activity as unknown as ActivityService);
    groupByMock(mock).mockResolvedValue([] as never);
  });

  it('builds the tree with direct and total live case counts', async () => {
    mock.db.suite.findFirst.mockResolvedValue(suiteRow());
    mock.db.section.findMany.mockResolvedValue([
      sectionRow({ id: 1, name: 'Power' }),
      sectionRow({ id: 2, name: 'On', parentId: 1 }),
    ]);
    groupByMock(mock).mockResolvedValue([
      { sectionId: 1, _count: { _all: 2 } },
      { sectionId: 2, _count: { _all: 3 } },
      { sectionId: null, _count: { _all: 1 } },
    ] as never);
    const tree = await service.tree(10, 2);
    expect(tree).toMatchObject({ suiteId: 2, unsectionedCount: 1, total: 6 });
    expect(tree.sections[0]).toMatchObject({ caseCount: 2, totalCount: 5 });
    expect(tree.sections[0]!.children[0]).toMatchObject({ id: 2, caseCount: 3, totalCount: 3 });
    expect(groupByMock(mock).mock.calls[0]![0]!.where).toEqual({
      suiteId: 2,
      isDeleted: false,
    });
  });

  it('creates sections at the end of their parent, only under parents of the same suite', async () => {
    mock.db.suite.findFirst.mockResolvedValue(suiteRow());
    mock.db.section.findFirst.mockResolvedValueOnce(sectionRow({ id: 5, suiteId: 99 }));
    await expect(service.create(ctx, me, 2, { name: 'x', parentId: 5 })).rejects.toMatchObject({
      code: 'BAD_PARENT',
    });
    expect(mock.db.section.findFirst.mock.calls[0]![0]!.where).toEqual({
      id: 5,
      suite: { projectId: 10 },
    });

    mock.db.section.aggregate.mockResolvedValue({ _max: { sortOrder: 3 } } as never);
    mock.db.section.create.mockResolvedValue(sectionRow({ id: 6, name: 'Top' }));
    mock.db.section.findMany.mockResolvedValue([sectionRow({ id: 6, name: 'Top' })]);
    const node = await service.create(ctx, me, 2, { name: 'Top' });
    expect(node).toMatchObject({ id: 6, children: [] });
    expect(mock.db.section.aggregate.mock.calls[0]![0]!.where).toEqual({
      suiteId: 2,
      parentId: null,
    });
    expect(mock.db.section.create.mock.calls[0]![0].data).toMatchObject({
      suiteId: 2,
      parentId: null,
      code: null,
      sortOrder: 4,
    });
    expect(activity.log.mock.calls[0]![1]).toMatchObject({
      summary: 'Created section Top in Modbus system test',
    });
  });

  it('refuses to move a section inside its own subtree', async () => {
    mock.db.section.findFirst
      .mockResolvedValueOnce(sectionRow({ id: 1 }))
      .mockResolvedValueOnce(sectionRow({ id: 2, parentId: 1 }));
    mock.db.section.findMany.mockResolvedValue([
      sectionRow({ id: 1 }),
      sectionRow({ id: 2, parentId: 1 }),
    ]);
    await expect(service.update(ctx, me, 1, { parentId: 2 })).rejects.toMatchObject({
      code: 'SECTION_CYCLE',
    });
  });

  it('appends a moved section to its new parent and logs a move', async () => {
    mock.db.section.findFirst.mockResolvedValue(sectionRow({ id: 3, parentId: 1, sortOrder: 7 }));
    mock.db.section.aggregate.mockResolvedValue({ _max: { sortOrder: 1 } } as never);
    mock.db.section.update.mockResolvedValue(sectionRow({ id: 3 }));
    mock.db.section.findMany.mockResolvedValue([sectionRow({ id: 3 })]);
    await service.update(ctx, me, 3, { parentId: null });
    expect(mock.db.section.update.mock.calls[0]![0].data).toEqual({ parentId: null, sortOrder: 2 });
    expect(activity.log.mock.calls[0]![1]).toMatchObject({ action: 'moved' });

    mock.db.section.findFirst.mockResolvedValue(
      sectionRow({ id: 3, parentId: null, sortOrder: 7 }),
    );
    await service.update(ctx, me, 3, { name: 'Renamed' });
    expect(mock.db.section.update.mock.calls[1]![0].data).toEqual({
      name: 'Renamed',
      parentId: null,
      sortOrder: 7,
    });
    expect(activity.log.mock.calls[1]![1]).toMatchObject({ action: 'updated' });
  });

  it('deletes non-empty sections only when moving their content to the parent', async () => {
    mock.db.section.findFirst
      .mockResolvedValueOnce(sectionRow({ id: 3, parentId: 1 }))
      .mockResolvedValueOnce(null);
    mock.db.testCase.findFirst.mockResolvedValue({ id: 100 } as never);
    await expect(service.remove(ctx, me, 3, false)).rejects.toMatchObject({
      code: 'SECTION_NOT_EMPTY',
    });
    expect(mock.db.testCase.findFirst.mock.calls[0]![0]!.where).toEqual({
      sectionId: 3,
      isDeleted: false,
    });

    mock.db.section.findFirst
      .mockResolvedValueOnce(sectionRow({ id: 3, parentId: 1 }))
      .mockResolvedValueOnce(null);
    await service.remove(ctx, me, 3, true);
    expect(mock.db.section.updateMany).toHaveBeenCalledWith({
      where: { parentId: 3 },
      data: { parentId: 1 },
    });
    expect(mock.db.testCase.updateMany).toHaveBeenCalledWith({
      where: { sectionId: 3 },
      data: { sectionId: 1 },
    });
    expect(mock.db.section.delete).toHaveBeenCalledWith({ where: { id: 3 } });
    expect(activity.log.mock.calls[0]![1]).toMatchObject({
      summary: 'Deleted section Power (content moved up)',
    });
  });

  it('answers SECTION_NOT_FOUND for sections of other projects', async () => {
    mock.db.section.findFirst.mockResolvedValue(null);
    await expect(service.remove(ctx, me, 3, false)).rejects.toMatchObject({
      code: 'SECTION_NOT_FOUND',
    });
  });
});

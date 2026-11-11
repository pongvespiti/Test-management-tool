import { beforeEach, describe, expect, it } from '@jest/globals';
import { Prisma } from '@tmt/database';
import { groupByMock, runCaseRow, unitConfig } from '../../../test/unit/fixtures.js';
import { createPrismaMock, type PrismaMock } from '../../../test/unit/prisma-mock.js';
import type { AuthUser } from '../../common/types/auth.js';
import { MyWorkService } from './my-work.service.js';

/** 2026-10-22 (Thursday) 10:00 in Bangkok. */
const NOW = new Date('2026-10-22T03:00:00Z');
const me: AuthUser = {
  id: 5,
  username: 'tom',
  displayName: 'Tom',
  isAdmin: false,
  mustChangePassword: false,
};

function rawValues(mock: PrismaMock): unknown[] {
  const [, ...values] = mock.db.$queryRaw.mock.calls[0]! as unknown[];
  return values.flatMap((v) => (v instanceof Prisma.Sql ? v.values : [v]));
}

describe('MyWorkService', () => {
  let mock: PrismaMock;
  let service: MyWorkService;

  beforeEach(() => {
    mock = createPrismaMock();
    service = new MyWorkService(mock.prisma, unitConfig());
    groupByMock(mock.db.runCase.groupBy).mockResolvedValue([] as never);
    mock.db.runCase.findMany.mockResolvedValue([] as never);
    mock.db.$queryRaw.mockResolvedValue([] as never);
    mock.db.defect.findMany.mockResolvedValue([] as never);
    mock.db.release.findMany.mockResolvedValue([] as never);
    mock.db.build.findMany.mockResolvedValue([] as never);
  });

  it('is empty and uses today in the report time zone by default', async () => {
    const r = await service.get(10, me, { range: 'day' }, NOW);
    expect(r).toMatchObject({
      user: { id: 5, username: 'tom' },
      timezone: 'Asia/Bangkok',
      range: 'day',
      from: '2026-10-22',
      to: '2026-10-22',
      assigned: { total: 0, items: [], truncated: false, remainingEstimateMinutes: 0 },
      summary: { executed: 0, elapsedSec: 0, groups: [], defects: [] },
    });
  });

  it('asks for my cases in open plans of the project: assigned to me, else my runs', async () => {
    await service.get(10, me, { range: 'day' }, NOW);
    const where = (groupByMock(mock.db.runCase.groupBy).mock.calls[0]![0] as { where: unknown })
      .where;
    expect(where).toEqual({
      status: { in: ['untested', 'ng', 'blocked'] },
      run: { plan: { projectId: 10, status: { not: 'completed' } } },
      OR: [{ assigneeId: 5 }, { assigneeId: null, run: { testerId: 5 } }],
    });
  });

  it('lists NG first with release and build names and counts every status', async () => {
    groupByMock(mock.db.runCase.groupBy).mockResolvedValue([
      { status: 'untested', _count: { _all: 3 }, _sum: { estimateMinutes: 45 } },
      { status: 'ng', _count: { _all: 1 }, _sum: { estimateMinutes: 5 } },
    ] as never);
    const run = { id: 3, code: 'RUN-1', buildId: 8, plan: { id: 7, docNo: 'D-1', releaseId: 5 } };
    mock.db.runCase.findMany.mockImplementation((async (args: { where: { status: string } }) => {
      if (args.where.status === 'ng') {
        return [{ ...runCaseRow({ id: 51, status: 'ng', priority: 'low' }), run }];
      }
      if (args.where.status === 'untested') {
        return [{ ...runCaseRow({ id: 50, status: 'untested', priority: 'critical' }), run }];
      }
      return [];
    }) as never);
    mock.db.release.findMany.mockResolvedValue([{ id: 5, name: 'Step 1.1.7' }] as never);
    mock.db.build.findMany.mockResolvedValue([{ id: 8, name: '1.1.7(2.0.0)' }] as never);
    const r = await service.get(10, me, { range: 'day' }, NOW);
    expect(r.assigned).toMatchObject({
      untested: 3,
      ng: 1,
      blocked: 0,
      total: 4,
      remainingEstimateMinutes: 45,
      truncated: true,
    });
    expect(r.assigned.items.map((i) => [i.runCaseId, i.status])).toEqual([
      [51, 'ng'],
      [50, 'untested'],
    ]);
    expect(r.assigned.items[0]).toMatchObject({
      runCode: 'RUN-1',
      planDocNo: 'D-1',
      release: { id: 5, name: 'Step 1.1.7' },
      build: { id: 8, name: '1.1.7(2.0.0)' },
    });
  });

  it('summarises my results of the week, bucketed by local day', async () => {
    mock.db.$queryRaw.mockResolvedValue([
      {
        runCaseId: 50,
        status: 'ok',
        elapsedSec: 90,
        // 2026-10-20 23:30 in Bangkok is still the 20th; 17:30Z is already the 21st at 00:30.
        executedAt: new Date('2026-10-20T16:30:00Z'),
        releaseId: 5,
        buildId: 8,
      },
      {
        runCaseId: 51,
        status: 'ng',
        elapsedSec: 30,
        executedAt: new Date('2026-10-20T17:30:00Z'),
        releaseId: 5,
        buildId: 8,
      },
    ] as never);
    mock.db.release.findMany.mockResolvedValue([{ id: 5, name: 'Step 1.1.7' }] as never);
    mock.db.build.findMany.mockResolvedValue([{ id: 8, name: '1.1.7(2.0.0)' }] as never);
    mock.db.defect.findMany.mockResolvedValue([
      { id: 9, seq: 4, title: 'Times out', status: 'new', severity: 'major' },
    ] as never);
    const r = await service.get(10, me, { range: 'week', date: '2026-10-22' }, NOW);
    expect(r.from).toBe('2026-10-19');
    expect(r.to).toBe('2026-10-25');
    expect(r.summary.executed).toBe(2);
    expect(r.summary.elapsedSec).toBe(120);
    expect(r.summary.days.filter((d) => d.executed > 0)).toEqual([
      { date: '2026-10-20', executed: 1, elapsedSec: 90 },
      { date: '2026-10-21', executed: 1, elapsedSec: 30 },
    ]);
    expect(r.summary.groups).toEqual([
      {
        release: { id: 5, name: 'Step 1.1.7' },
        build: { id: 8, name: '1.1.7(2.0.0)' },
        executed: 2,
        counts: expect.objectContaining({ ok: 1, ng: 1 }),
        elapsedSec: 120,
      },
    ]);
    expect(r.summary.defects).toEqual([
      { id: 9, key: 'BUG-4', title: 'Times out', status: 'new', severity: 'major' },
    ]);
    // Monday 00:00 → next Monday 00:00 Bangkok, passed as ISO text.
    expect(rawValues(mock)).toEqual([
      10,
      5,
      '2026-10-18T17:00:00.000Z',
      '2026-10-25T17:00:00.000Z',
    ]);
    expect(mock.db.defect.findMany.mock.calls[0]![0]!.where).toMatchObject({
      projectId: 10,
      reporterId: 5,
    });
  });

  it('shows the work of another member, and refuses people outside the project', async () => {
    mock.db.projectMember.findUnique.mockResolvedValue({
      user: { id: 8, username: 'ann', displayName: 'Ann' },
    } as never);
    const r = await service.get(10, me, { range: 'day', userId: 8 }, NOW);
    expect(r.user).toEqual({ id: 8, username: 'ann', displayName: 'Ann' });
    expect(mock.db.projectMember.findUnique.mock.calls[0]![0]!.where).toEqual({
      projectId_userId: { projectId: 10, userId: 8 },
    });
    expect(mock.db.runCase.findMany.mock.calls[0]![0]!.where!.OR).toEqual([
      { assigneeId: 8 },
      { assigneeId: null, run: { testerId: 8 } },
    ]);
    expect(rawValues(mock)).toContain(8);
    expect(mock.db.defect.findMany.mock.calls[0]![0]!.where).toMatchObject({ reporterId: 8 });

    mock.db.projectMember.findUnique.mockResolvedValue(null);
    await expect(service.get(10, me, { range: 'day', userId: 9 }, NOW)).rejects.toMatchObject({
      code: 'BAD_USER',
    });
  });
});

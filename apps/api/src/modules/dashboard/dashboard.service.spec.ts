import { describe, expect, it } from '@jest/globals';
import {
  defectRow,
  groupByMock,
  planRow,
  releaseRow,
  runCaseRow,
  unitConfig,
} from '../../../test/unit/fixtures.js';
import { createPrismaMock } from '../../../test/unit/prisma-mock.js';
import { toAttentionItem } from './dashboard.mapper.js';
import { DashboardService, openDefectsWhere, pickRelease } from './dashboard.service.js';

describe('dashboard', () => {
  const releases = [
    releaseRow({ id: 3, name: 'Next', status: 'planned' }),
    releaseRow({ id: 2, name: 'Current', status: 'active', endDate: new Date('2026-11-30') }),
    releaseRow({ id: 1, name: 'Old', status: 'completed' }),
  ];

  it('picks the requested, the newest active or the newest release', () => {
    expect(pickRelease(releases, 1)?.name).toBe('Old');
    expect(() => pickRelease(releases, 9)).toThrow(
      expect.objectContaining({ code: 'BAD_RELEASE' }),
    );
    expect(pickRelease(releases, undefined)?.name).toBe('Current');
    expect(pickRelease([releases[0]!], undefined)?.name).toBe('Next');
    expect(pickRelease([], undefined)).toBeNull();
  });

  it('scopes open defects to the release or its plans', () => {
    expect(openDefectsWhere(10, null)).toEqual({
      projectId: 10,
      status: { in: ['new', 'open', 'in_progress', 'reopened'] },
    });
    expect(openDefectsWhere(10, { id: 2 }).OR).toEqual([
      { releaseId: 2 },
      { links: { some: { runCase: { run: { plan: { releaseId: 2 } } } } } },
    ]);
  });

  it('maps attention items', () => {
    const item = toAttentionItem(
      {
        ...runCaseRow({
          status: 'ng',
          executedAt: new Date('2026-10-27T00:00:00Z'),
          executedById: 5,
        }),
        run: { id: 3, code: 'KR', plan: { id: 7, docNo: 'D-1' } },
      },
      new Map([[5, { id: 5, username: 'tom', displayName: 'Tom' }]]),
      null,
    );
    expect(item).toMatchObject({
      runCaseId: 50,
      status: 'ng',
      runCode: 'KR',
      planDocNo: 'D-1',
      executedBy: { id: 5 },
      executedAt: '2026-10-27T00:00:00.000Z',
      defect: null,
    });
  });

  it('summarises plans, open defects and attention items of the release', async () => {
    const { prisma, db } = createPrismaMock();
    db.release.findMany.mockResolvedValue(releases);
    db.testPlan.findMany.mockResolvedValue([planRow({ status: 'in_progress', releaseId: 2 })]);
    db.testRun.findMany.mockResolvedValue([]);
    db.build.findMany.mockResolvedValue([]);
    db.attachment.findMany.mockResolvedValue([]);
    db.user.findMany.mockResolvedValue([]);
    groupByMock(db.defect.groupBy).mockResolvedValue([
      { severity: 'critical', _count: { _all: 2 } },
      { severity: 'minor', _count: { _all: 1 } },
    ]);
    db.defect.findMany.mockResolvedValue([defectRow()]);
    db.release.findMany.mockResolvedValueOnce(releases).mockResolvedValue([]);
    db.defectLink.findMany.mockResolvedValue([]);
    db.runCase.findMany.mockResolvedValue([
      {
        ...runCaseRow({ status: 'ok_cond' }),
        run: { id: 3, code: 'KR', plan: { id: 7, docNo: 'D' } },
      },
    ] as never);
    db.$queryRaw.mockResolvedValue([{ total: 20, remaining: 8, minutes: 80, recent: 14 }] as never);
    // 2026-11-11 10:00 in Bangkok.
    const d = await new DashboardService(prisma, unitConfig()).get(
      10,
      undefined,
      new Date('2026-11-11T03:00:00Z'),
    );
    expect(d.release?.name).toBe('Current');
    // 14 cases in 7 days = 2 a day: 8 left need 4 days, the release ends in 19.
    expect(d.readiness).toEqual({
      state: 'on_track',
      total: 20,
      remaining: 8,
      remainingMinutes: 80,
      executedLast7Days: 14,
      perDay: 2,
      endDate: '2026-11-30',
      daysLeft: 19,
      projectedDate: '2026-11-15',
    });
    expect(d.releases).toHaveLength(3);
    expect(d.builds).toEqual([]);
    expect(d.kpis).toMatchObject({
      planCount: 1,
      plansByStatus: { draft: 0, in_progress: 1, completed: 0 },
      openDefects: 3,
      openDefectsBySeverity: { critical: 2, major: 0, minor: 1, trivial: 0 },
    });
    expect(d.openDefects.map((x) => x.key)).toEqual(['BUG-12']);
    expect(d.attention.map((a) => a.status)).toEqual(['ok_cond']);
    expect(db.testPlan.findMany.mock.calls[0]![0]!.where).toEqual({ projectId: 10, releaseId: 2 });
    expect(db.defect.findMany.mock.calls[0]![0]!.orderBy).toEqual([
      { severity: 'asc' },
      { createdAt: 'desc' },
      { id: 'desc' },
    ]);
    const attention = db.runCase.findMany.mock.calls[0]![0]!;
    expect(attention.where).toEqual({
      run: { planId: { in: [7] } },
      status: { in: ['ng', 'ok_cond'] },
    });
    expect(attention.take).toBe(10);
    // Only plans that are not completed count; the window starts 6 days before today (Bangkok).
    expect(db.$queryRaw.mock.calls[0]).toContainEqual('2026-11-04T17:00:00.000Z');
  });

  it('reads no readiness figures for a release without open plans', async () => {
    const { prisma, db } = createPrismaMock();
    db.release.findMany.mockResolvedValue(releases);
    db.testPlan.findMany.mockResolvedValue([planRow({ status: 'completed', releaseId: 2 })]);
    db.testRun.findMany.mockResolvedValue([]);
    db.build.findMany.mockResolvedValue([]);
    db.attachment.findMany.mockResolvedValue([]);
    db.user.findMany.mockResolvedValue([]);
    groupByMock(db.defect.groupBy).mockResolvedValue([]);
    db.defect.findMany.mockResolvedValue([]);
    db.defectLink.findMany.mockResolvedValue([]);
    db.runCase.findMany.mockResolvedValue([]);
    const d = await new DashboardService(prisma, unitConfig()).get(10);
    expect(db.$queryRaw).not.toHaveBeenCalled();
    expect(d.readiness).toMatchObject({ state: 'no_cases', total: 0, remaining: 0 });
  });

  it('lists the builds of the release with results and open defects found in them', async () => {
    const { prisma, db } = createPrismaMock();
    db.release.findMany.mockResolvedValue(releases);
    db.testPlan.findMany.mockResolvedValue([]);
    db.testRun.findMany.mockResolvedValue([
      { id: 31, buildId: 8 },
      { id: 32, buildId: 8 },
      { id: 33, buildId: 7 },
    ] as never);
    db.build.findMany.mockResolvedValue([
      { id: 8, name: '1.1.7(2.0.0)' },
      { id: 7, name: '1.1.7(1.0.0)' },
      { id: 6, name: '1.1.7(0.9.0)' },
    ] as never);
    groupByMock(db.runCase.groupBy).mockResolvedValue([
      { runId: 31, status: 'ok', _count: { _all: 4 } },
      { runId: 32, status: 'ng', _count: { _all: 1 } },
      { runId: 33, status: 'ok', _count: { _all: 2 } },
    ]);
    groupByMock(db.defect.groupBy).mockImplementation((async (args: { by: string[] }) =>
      args.by[0] === 'foundInBuildId'
        ? [{ foundInBuildId: 8, _count: { _all: 2 } }]
        : []) as never);
    db.defect.findMany.mockResolvedValue([]);
    db.user.findMany.mockResolvedValue([]);
    const d = await new DashboardService(prisma, unitConfig()).get(10, 2);
    expect(db.build.findMany.mock.calls[0]![0]!.where).toEqual({ releaseId: 2 });
    expect(d.builds.map((b) => [b.build.name, b.runCount, b.openDefects])).toEqual([
      ['1.1.7(2.0.0)', 2, 2],
      ['1.1.7(1.0.0)', 1, 0],
      ['1.1.7(0.9.0)', 0, 0],
    ]);
    expect(d.builds[0]!.counts).toMatchObject({ ok: 4, ng: 1 });
    expect(d.builds[2]!.counts.ok).toBe(0);
  });
});

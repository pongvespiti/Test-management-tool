import { describe, expect, it } from '@jest/globals';
import {
  defectRow,
  groupByMock,
  planRow,
  releaseRow,
  runCaseRow,
} from '../../../test/unit/fixtures.js';
import { createPrismaMock } from '../../../test/unit/prisma-mock.js';
import { toAttentionItem } from './dashboard.mapper.js';
import { DashboardService, openDefectsWhere, pickRelease } from './dashboard.service.js';

describe('dashboard', () => {
  const releases = [
    releaseRow({ id: 3, name: 'Next', status: 'planned' }),
    releaseRow({ id: 2, name: 'Current', status: 'active' }),
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
    const d = await new DashboardService(prisma).get(10);
    expect(d.release?.name).toBe('Current');
    expect(d.releases).toHaveLength(3);
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
  });
});

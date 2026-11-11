import { beforeEach, describe, expect, it } from '@jest/globals';
import { Prisma } from '@tmt/database';
import { AppConfig } from '../../config/app-config.js';
import {
  defectRow,
  groupByMock,
  planRow,
  releaseRow,
  unitConfig,
  userRow,
} from '../../../test/unit/fixtures.js';
import { createPrismaMock, type PrismaMock } from '../../../test/unit/prisma-mock.js';
import { planScopeSql, planWhere, ReportsService } from './reports.service.js';

/** 2026-10-22 10:00 in Bangkok. */
const NOW = new Date('2026-10-22T03:00:00Z');

/** Values bound to the n-th `$queryRaw` call (nested SQL fragments flattened). */
function rawValues(mock: PrismaMock, n = 0): unknown[] {
  const [, ...values] = mock.db.$queryRaw.mock.calls[n]! as unknown[];
  return values.flatMap((v) => (v instanceof Prisma.Sql ? v.values : [v]));
}

describe('report scope', () => {
  it('filters plans by plan (wins), release or project', () => {
    expect(planWhere({ projectId: 1, planId: 2, releaseId: 3 })).toEqual({ projectId: 1, id: 2 });
    expect(planWhere({ projectId: 1, releaseId: 3 })).toEqual({ projectId: 1, releaseId: 3 });
    expect(planWhere({ projectId: 1 })).toEqual({ projectId: 1 });
  });

  it('builds the same scope as bound SQL', () => {
    const plan = planScopeSql({ projectId: 1, planId: 2, releaseId: 3 });
    expect(plan.sql).toBe('p.project_id = ? AND p.id = ?');
    expect(plan.values).toEqual([1, 2]);
    expect(planScopeSql({ projectId: 1, releaseId: 3 }).sql).toBe(
      'p.project_id = ? AND p.release_id = ?',
    );
    expect(planScopeSql({ projectId: 1 }).values).toEqual([1]);
  });
});

describe('REPORT_TIMEZONE configuration', () => {
  it('defaults to Asia/Bangkok and refuses unknown zones at start-up', () => {
    expect(unitConfig().reportTimezone).toBe('Asia/Bangkok');
    expect(unitConfig({ REPORT_TIMEZONE: 'Europe/Berlin' }).reportTimezone).toBe('Europe/Berlin');
    expect(() =>
      AppConfig.fromEnv({ DATABASE_URL: 'postgresql://x/y', REPORT_TIMEZONE: 'Mars/Olympus' }),
    ).toThrow(/REPORT_TIMEZONE/);
  });
});

describe('ReportsService', () => {
  let mock: PrismaMock;
  let service: ReportsService;

  beforeEach(() => {
    mock = createPrismaMock();
    service = new ReportsService(mock.prisma, unitConfig());
    mock.db.user.findMany.mockResolvedValue([]);
  });

  it('validates the scope ids against the project', async () => {
    mock.db.testPlan.findFirst.mockResolvedValue(planRow({ id: 2 }));
    await expect(service.resolveScope(10, { planId: 2, releaseId: 3 })).resolves.toEqual({
      projectId: 10,
      planId: 2,
    });
    expect(mock.db.release.count).not.toHaveBeenCalled();
    mock.db.testPlan.findFirst.mockResolvedValue(null);
    await expect(service.resolveScope(10, { planId: 9 })).rejects.toMatchObject({
      code: 'PLAN_NOT_FOUND',
    });
    mock.db.release.count.mockResolvedValue(0);
    await expect(service.resolveScope(10, { releaseId: 3 })).rejects.toMatchObject({
      code: 'BAD_RELEASE',
    });
    mock.db.release.count.mockResolvedValue(1);
    await expect(service.resolveScope(10, { releaseId: 3 })).resolves.toEqual({
      projectId: 10,
      releaseId: 3,
    });
    await expect(service.resolveScope(10, {})).resolves.toEqual({ projectId: 10 });
  });

  it('replays the history of the run cases in scope for the trend', async () => {
    mock.db.release.count.mockResolvedValue(1);
    mock.db.runCase.findMany.mockResolvedValue([
      { id: 1, run: { createdAt: new Date('2026-10-01T00:00:00Z') } },
    ] as never);
    mock.db.runCaseResult.findMany.mockResolvedValue([
      { runCaseId: 1, status: 'ok', executedAt: new Date('2026-10-21T03:00:00Z') },
    ] as never);
    const r = await service.trend(10, { releaseId: 3, days: 2 }, NOW);
    expect(r).toMatchObject({ from: '2026-10-21', to: '2026-10-22', total: 1 });
    expect(r.points.map((p) => [p.executed, p.passRate])).toEqual([
      [1, 1],
      [0, 1],
    ]);
    const plan = { projectId: 10, releaseId: 3 };
    expect(mock.db.runCase.findMany.mock.calls[0]![0]!.where).toEqual({ run: { plan } });
    expect(mock.db.runCaseResult.findMany.mock.calls[0]![0]).toMatchObject({
      where: { runCase: { run: { plan } } },
      orderBy: [{ executedAt: 'asc' }, { id: 'asc' }],
    });
  });

  it('aggregates the workload of open plans since the start of the 7-day window', async () => {
    mock.db.$queryRaw.mockResolvedValue([
      { userId: null, runCases: 1, untested: 1, ng: 0, remainingMinutes: 5, executedRecently: 0 },
      { userId: 2, runCases: 3, untested: 1, ng: 1, remainingMinutes: 10, executedRecently: 2 },
    ]);
    mock.db.user.findMany.mockResolvedValue([userRow({ id: 2, username: 'tina' })]);
    const rows = await service.workload(10, {}, NOW);
    expect(rows.map((r) => [r.user?.username ?? null, r.executed])).toEqual([
      ['tina', 2],
      [null, 0],
    ]);
    // Seven Bangkok days back from the 22nd: the 16th, 00:00 local = the 15th, 17:00 UTC.
    expect(rawValues(mock)).toEqual(['2026-10-15T17:00:00.000Z', 10]);
  });

  it('summarises defects with assignees and the most affected cases', async () => {
    mock.db.release.count.mockResolvedValue(1);
    mock.db.defect.findMany.mockResolvedValue([
      defectRow({ assigneeId: 2, createdAt: new Date('2026-10-21T03:00:00Z') }),
      defectRow({ assigneeId: null, createdAt: new Date('2026-10-21T03:00:00Z') }),
      defectRow({ assigneeId: null, status: 'open', createdAt: new Date('2026-10-22T01:00:00Z') }),
    ]);
    mock.db.user.findMany.mockResolvedValue([userRow({ id: 2, username: 'tina' })]);
    mock.db.$queryRaw.mockResolvedValue([
      { testCaseId: 100, seq: 36, title: 'Power ON', prefix: 'MBS', defectCount: 2 },
    ]);
    const r = await service.defects(10, { releaseId: 3, days: 2 }, NOW);
    expect(mock.db.defect.findMany.mock.calls[0]![0]!.where).toEqual({
      projectId: 10,
      releaseId: 3,
    });
    expect(r.byAssignee.map((a) => [a.user?.username ?? null, a.open])).toEqual([
      [null, 2],
      ['tina', 1],
    ]);
    expect(r.trend).toEqual([
      { date: '2026-10-21', opened: 2, closed: 0, open: 2 },
      { date: '2026-10-22', opened: 1, closed: 0, open: 3 },
    ]);
    expect(r.topCases).toEqual([
      { testCaseId: 100, displayId: 'MBS-036', title: 'Power ON', defectCount: 2 },
    ]);
    expect(rawValues(mock)).toEqual([10, 3, 10]);
    mock.db.release.count.mockResolvedValue(0);
    await expect(service.defects(10, { releaseId: 4, days: 2 }, NOW)).rejects.toMatchObject({
      code: 'BAD_RELEASE',
    });
  });

  it('compares releases newest first', async () => {
    mock.db.release.findMany.mockResolvedValue([]);
    await expect(service.releases(10)).resolves.toEqual([]);
    expect(mock.db.$queryRaw).not.toHaveBeenCalled();

    mock.db.release.findMany.mockResolvedValue([releaseRow({ id: 1 })]);
    groupByMock(mock.db.testPlan.groupBy).mockResolvedValue([
      { releaseId: 1, overallJudgement: 'pass', _count: { _all: 2 } },
    ]);
    groupByMock(mock.db.defect.groupBy).mockResolvedValue([
      { releaseId: 1, status: 'new', _count: { _all: 1 } },
    ]);
    mock.db.$queryRaw
      .mockResolvedValueOnce([{ releaseId: 1, n: 3 }])
      .mockResolvedValueOnce([{ releaseId: 1, status: 'ok', n: 4 }]);
    const [row] = await service.releases(10);
    expect(row).toMatchObject({
      planCount: 2,
      runCount: 3,
      defectsTotal: 1,
      defectsOpen: 1,
      passRate: 1,
      judgements: { pass: 2 },
    });
    expect(mock.db.release.findMany.mock.calls[1]![0]!.orderBy).toEqual([
      { startDate: { sort: 'desc', nulls: 'last' } },
      { id: 'desc' },
    ]);
    expect(groupByMock(mock.db.testPlan.groupBy).mock.calls[0]![0]).toMatchObject({
      where: { projectId: 10, releaseId: { not: null } },
    });
  });

  it('reports coverage from the latest run case of every live library case', async () => {
    mock.db.suite.findMany.mockResolvedValue([]);
    await expect(service.coverage(10)).resolves.toEqual([]);
    expect(mock.db.testCase.findMany).not.toHaveBeenCalled();

    mock.db.release.count.mockResolvedValue(1);
    mock.db.suite.findMany.mockResolvedValue([{ id: 1, name: 'App', prefix: 'APP' }] as never);
    mock.db.testCase.findMany.mockResolvedValue([
      { id: 10, suiteId: 1, priority: 'high' },
      { id: 11, suiteId: 1, priority: 'low' },
    ] as never);
    mock.db.$queryRaw.mockResolvedValue([{ testCaseId: 10, status: 'ng' }]);
    const [row] = await service.coverage(10, 3);
    expect(row).toMatchObject({ cases: 2, inScope: 1, executed: 1, failed: 1, neverRun: 1 });
    expect(mock.db.suite.findMany.mock.calls[1]![0]!.where).toEqual({
      projectId: 10,
      isArchived: false,
    });
    expect(mock.db.testCase.findMany.mock.calls[0]![0]!.where).toEqual({
      suiteId: { in: [1] },
      isDeleted: false,
      status: { not: 'deprecated' },
    });
    expect(rawValues(mock)).toEqual([10, 3]);
  });
});

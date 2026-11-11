import { describe, expect, it } from '@jest/globals';
import { emptyCounts } from '@tmt/shared';
import {
  attachmentRow,
  planRow,
  runCaseRow,
  runRow,
  suiteRow,
  groupByMock,
} from '../../../test/unit/fixtures.js';
import { createPrismaMock } from '../../../test/unit/prisma-mock.js';
import {
  assertPlanEditable,
  assertBuildForPlan,
  assertReleaseInProject,
  buildPlanDTOs,
  buildRunDTOs,
  caseRunHistory,
  countsByRun,
  envOf,
  estimatesByRun,
  getPlanInProject,
  getRunCaseInProject,
  getRunInProject,
  loadRunCaseDTOs,
  lockEditablePlan,
  markPlanInProgress,
  nextRunSortOrder,
  runRefs,
  runStepsOf,
  stepResultsOf,
} from './execution.queries.js';

describe('execution queries', () => {
  it('scopes plan, run and run case lookups to the project', async () => {
    const { db } = createPrismaMock();
    db.testPlan.findFirst.mockResolvedValue(null);
    await expect(getPlanInProject(db, 10, 7)).rejects.toMatchObject({ code: 'PLAN_NOT_FOUND' });
    expect(db.testPlan.findFirst).toHaveBeenCalledWith({ where: { id: 7, projectId: 10 } });

    db.testRun.findFirst.mockResolvedValue({ id: 3, planId: 7, plan: planRow() } as never);
    const { run, plan } = await getRunInProject(db, 10, 3);
    expect(run).toEqual({ id: 3, planId: 7 });
    expect(plan.docNo).toBe('26TR-TEAM-10-001');
    expect(db.testRun.findFirst.mock.calls[0]![0]!.where).toEqual({
      id: 3,
      plan: { projectId: 10 },
    });
    db.testRun.findFirst.mockResolvedValue(null);
    await expect(getRunInProject(db, 10, 4)).rejects.toMatchObject({ code: 'RUN_NOT_FOUND' });

    db.runCase.findFirst.mockResolvedValue({
      id: 50,
      runId: 3,
      run: { id: 3, planId: 7, plan: planRow() },
    } as never);
    const found = await getRunCaseInProject(db, 10, 50);
    expect(found.rc).toEqual({ id: 50, runId: 3 });
    expect(found.run).toEqual({ id: 3, planId: 7 });
    expect(found.plan.id).toBe(7);
    expect(db.runCase.findFirst.mock.calls[0]![0]!.where).toEqual({
      id: 50,
      run: { plan: { projectId: 10 } },
    });
    db.runCase.findFirst.mockResolvedValue(null);
    await expect(getRunCaseInProject(db, 10, 51)).rejects.toMatchObject({
      code: 'RUN_CASE_NOT_FOUND',
    });
  });

  it('validates release references', async () => {
    const { db } = createPrismaMock();
    db.release.count.mockResolvedValue(0);
    await expect(assertReleaseInProject(db, 10, 5)).rejects.toMatchObject({ code: 'BAD_RELEASE' });
    await expect(assertReleaseInProject(db, 10, null)).resolves.toBeUndefined();
    db.release.count.mockResolvedValue(1);
    await expect(assertReleaseInProject(db, 10, 5)).resolves.toBeUndefined();
  });

  it('accepts a run build of the plan release only (any project build without a release)', async () => {
    const { db } = createPrismaMock();
    db.build.count.mockResolvedValue(0);
    await expect(assertBuildForPlan(db, 10, { releaseId: 4 }, 8)).rejects.toMatchObject({
      code: 'BAD_BUILD',
    });
    expect(db.build.count.mock.calls[0]![0]!.where).toEqual({
      id: 8,
      release: { projectId: 10 },
      releaseId: 4,
    });
    await expect(assertBuildForPlan(db, 10, { releaseId: 4 }, null)).resolves.toBeUndefined();
    await expect(assertBuildForPlan(db, 10, { releaseId: 4 }, undefined)).resolves.toBeUndefined();
    db.build.count.mockResolvedValue(1);
    await assertBuildForPlan(db, 10, { releaseId: null }, 8);
    expect(db.build.count.mock.calls[1]![0]!.where).toEqual({ id: 8, release: { projectId: 10 } });
  });

  it('locks completed plans', async () => {
    expect(() => assertPlanEditable(planRow({ status: 'completed' }))).toThrow(
      expect.objectContaining({ code: 'PLAN_LOCKED' }),
    );
    expect(() => assertPlanEditable(planRow({ status: 'in_progress' }))).not.toThrow();

    const { db } = createPrismaMock();
    db.$queryRaw.mockResolvedValue([] as never);
    db.testPlan.findUnique.mockResolvedValue(planRow({ status: 'completed' }));
    await expect(lockEditablePlan(db, 7)).rejects.toMatchObject({ code: 'PLAN_LOCKED' });
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    db.testPlan.findUnique.mockResolvedValue(null);
    await expect(lockEditablePlan(db, 7)).rejects.toMatchObject({ code: 'PLAN_NOT_FOUND' });
  });

  it('moves draft plans to in progress only', async () => {
    const { db } = createPrismaMock();
    await markPlanInProgress(db, 7);
    expect(db.testPlan.updateMany).toHaveBeenCalledWith({
      where: { id: 7, status: 'draft' },
      data: { status: 'in_progress' },
    });
  });

  it('reads JSON columns defensively', () => {
    expect(envOf({ environment: [{ label: 'FW', value: '2.4' }] as never })).toEqual([
      { label: 'FW', value: '2.4' },
    ]);
    expect(envOf({ environment: {} as never })).toEqual([]);
    expect(runStepsOf({ steps: null as never })).toEqual([]);
    expect(stepResultsOf(null)).toBeNull();
    expect(stepResultsOf([{ status: 'ok', actual: '' }])).toEqual([{ status: 'ok', actual: '' }]);
  });
});

describe('execution DTO builders', () => {
  it('counts results per run, empty runs included', async () => {
    const { db } = createPrismaMock();
    groupByMock(db.runCase.groupBy).mockResolvedValue([
      { runId: 3, status: 'ok', _count: { _all: 2 } },
      { runId: 3, status: 'ng', _count: { _all: 1 } },
    ] as never);
    const map = await countsByRun(db, [3, 4]);
    expect(map.get(3)).toEqual({ ...emptyCounts(), ok: 2, ng: 1 });
    expect(map.get(4)).toEqual(emptyCounts());
    expect(await countsByRun(db, [])).toEqual(new Map());
    expect(db.runCase.groupBy).toHaveBeenCalledTimes(1);
  });

  it('sums estimates per run with a parameterised query', async () => {
    const { db } = createPrismaMock();
    db.$queryRaw.mockResolvedValue([{ run_id: 3, total: 35, remaining: 5 }] as never);
    const map = await estimatesByRun(db, [3, 9]);
    expect(map.get(3)).toEqual({ totalMinutes: 35, remainingMinutes: 5 });
    expect(map.has(9)).toBe(false);
    const sql = db.$queryRaw.mock.calls[0]!;
    expect(sql.slice(1)).toEqual([expect.objectContaining({ values: [3, 9] })]);
    expect(await estimatesByRun(db, [])).toEqual(new Map());
  });

  it('loads run refs and the next run sort order', async () => {
    const { db } = createPrismaMock();
    expect(await runRefs(db, [null, undefined])).toEqual(new Map());
    db.testRun.findMany.mockResolvedValue([{ id: 2, code: 'SRC' }] as never);
    expect((await runRefs(db, [2, 2, null])).get(2)).toEqual({ id: 2, code: 'SRC' });
    expect(db.testRun.findMany.mock.calls[0]![0]!.where).toEqual({ id: { in: [2] } });
    db.testRun.aggregate.mockResolvedValue({ _max: { sortOrder: null } } as never);
    expect(await nextRunSortOrder(db, 7)).toBe(1);
    db.testRun.aggregate.mockResolvedValue({ _max: { sortOrder: 4 } } as never);
    expect(await nextRunSortOrder(db, 7)).toBe(5);
  });

  it('builds run DTOs with suite, counts, estimate, source run and tester', async () => {
    const { db } = createPrismaMock();
    db.suite.findMany.mockResolvedValue([suiteRow()]);
    groupByMock(db.runCase.groupBy).mockResolvedValue([
      { runId: 3, status: 'ng', _count: { _all: 1 } },
    ] as never);
    db.$queryRaw.mockResolvedValue([{ run_id: 3, total: 10, remaining: 0 }] as never);
    db.testRun.findMany.mockResolvedValue([{ id: 2, code: 'SRC' }] as never);
    db.user.findMany.mockResolvedValue([{ id: 5, username: 'tom', displayName: 'Tom' }] as never);
    const run = runRow({
      sourceRunId: 2,
      testerId: 5,
      testedDate: new Date('2026-10-20T00:00:00Z'),
    });
    const [dto] = await buildRunDTOs(db, [{ run, plan: planRow() }]);
    expect(dto).toMatchObject({
      id: 3,
      planDocNo: '26TR-TEAM-10-001',
      planStatus: 'draft',
      suite: { id: 2, prefix: 'MBS', fieldDefs: [] },
      tester: { id: 5, displayName: 'Tom' },
      testedDate: '2026-10-20',
      counts: { ng: 1 },
      suggestedJudgement: 'not_pass',
      sourceRun: { id: 2, code: 'SRC' },
      estimate: { totalMinutes: 10, remainingMinutes: 0 },
    });
    expect(await buildRunDTOs(db, [])).toEqual([]);
  });

  it('loads run cases with defect and attachment counts in execution order', async () => {
    const { db } = createPrismaMock();
    db.runCase.findMany.mockResolvedValue([
      { ...runCaseRow({ id: 50, assigneeId: 5 }), _count: { defectLinks: 2 } },
      { ...runCaseRow({ id: 51, executedById: 5 }), _count: { defectLinks: 0 } },
    ] as never);
    groupByMock(db.attachment.groupBy).mockResolvedValue([
      { entityId: 51, _count: { _all: 3 } },
    ] as never);
    db.user.findMany.mockResolvedValue([{ id: 5, username: 'tom', displayName: 'Tom' }] as never);
    const list = await loadRunCaseDTOs(db, { runId: 3 });
    expect(list.map((r) => [r.id, r.defectCount, r.attachmentCount])).toEqual([
      [50, 2, 0],
      [51, 0, 3],
    ]);
    expect(list[0]!.assignee?.id).toBe(5);
    expect(list[1]!.executedBy?.id).toBe(5);
    const args = db.runCase.findMany.mock.calls[0]![0]!;
    expect(args.where).toEqual({ runId: 3 });
    expect(args.orderBy).toEqual([{ sortOrder: 'asc' }, { id: 'asc' }]);
    expect(groupByMock(db.attachment.groupBy).mock.calls[0]![0]).toMatchObject({
      where: { entityType: 'run_case', entityId: { in: [50, 51] } },
    });
    db.runCase.findMany.mockResolvedValue([]);
    expect(await loadRunCaseDTOs(db, { ids: [9] })).toEqual([]);
    expect(db.runCase.findMany.mock.calls[1]![0]!.where).toEqual({ id: { in: [9] } });
  });

  it('builds plan DTOs with run summaries, totals, release and signed copy', async () => {
    const { db } = createPrismaMock();
    db.testRun.findMany.mockResolvedValueOnce([
      { ...runRow({ id: 3, planId: 7 }), suite: { name: 'Modbus' } },
      { ...runRow({ id: 4, planId: 7, code: 'KR_02', sourceRunId: 3 }), suite: { name: 'Modbus' } },
    ] as never);
    db.testRun.findMany.mockResolvedValueOnce([{ id: 3, code: 'KR_01' }] as never);
    groupByMock(db.runCase.groupBy).mockResolvedValue([
      { runId: 3, status: 'ok', _count: { _all: 2 } },
      { runId: 4, status: 'ok_cond', _count: { _all: 1 } },
    ] as never);
    db.release.findMany.mockResolvedValue([{ id: 5, name: 'FW 2.4.0' }] as never);
    db.attachment.findMany.mockResolvedValue([
      attachmentRow({ id: 'a-1', entityType: 'plan', entityId: 7 }),
    ]);
    db.user.findMany.mockResolvedValue([
      { id: 1, username: 'alice', displayName: 'Alice' },
    ] as never);
    const [dto] = await buildPlanDTOs(db, [
      planRow({ releaseId: 5, signedCopyId: 'a-1', completedById: 1 }),
    ]);
    expect(dto).toMatchObject({
      release: { id: 5, name: 'FW 2.4.0' },
      counts: { ok: 2, ok_cond: 1 },
      suggestedJudgement: 'pass_with_condition',
      completedBy: { id: 1 },
      createdBy: { id: 1 },
      signedCopy: { id: 'a-1', url: '/api/v1/projects/10/attachments/a-1/download' },
    });
    expect(dto!.runs.map((r) => [r.code, r.suiteName, r.sourceRun?.code ?? null])).toEqual([
      ['KR_01', 'Modbus', null],
      ['KR_02', 'Modbus', 'KR_01'],
    ]);
    expect(await buildPlanDTOs(db, [])).toEqual([]);
  });

  it('lists the run history of a library case, newest execution first', async () => {
    const { db } = createPrismaMock();
    db.runCase.findMany.mockResolvedValue([
      {
        id: 61,
        status: 'ok',
        actualResult: null,
        executedById: null,
        executedAt: null,
        run: { id: 4, code: 'KR_02', plan: { id: 7, docNo: 'D-1', title: 'T', release: null } },
      },
    ] as never);
    const items = await caseRunHistory(db, 100, 50, 20);
    expect(items).toEqual([
      {
        runCaseId: 61,
        runId: 4,
        runCode: 'KR_02',
        planId: 7,
        planDocNo: 'D-1',
        planTitle: 'T',
        releaseName: null,
        status: 'ok',
        actualResult: null,
        executedBy: null,
        executedAt: null,
      },
    ]);
    const args = db.runCase.findMany.mock.calls[0]![0]!;
    expect(args.where).toEqual({ testCaseId: 100, id: { not: 50 } });
    expect(args.orderBy).toEqual([{ executedAt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }]);
    expect(args.take).toBe(20);
    await caseRunHistory(db, 100);
    expect(db.runCase.findMany.mock.calls[1]![0]!.where).toEqual({ testCaseId: 100 });
  });
});

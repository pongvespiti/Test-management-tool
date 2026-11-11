/**
 * Report endpoints (port of the v1 server's w2-reports tests). The pure date and replay cases of
 * that file live in src/modules/reports/report-dates.spec.ts and report-compute.spec.ts; the
 * history is written directly to pin timestamps, everything else goes through the endpoints.
 */
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import type { Prisma, ResultStatus } from '@tmt/database';
import type {
  CoverageRowDTO,
  DefectDTO,
  DefectReportDTO,
  PlanDTO,
  ReleaseComparisonRowDTO,
  ReleaseDTO,
  ReportTrendDTO,
  RunCaseDTO,
  RunDTO,
  SuiteDTO,
  TestCaseDTO,
  WorkloadRowDTO,
} from '@tmt/shared';
import { addDays } from '../src/modules/reports/report-dates.js';
import {
  createProject,
  createTestApp,
  createUser,
  errorCode,
  expectBody,
  login,
  type Client,
  type TestApp,
} from './helpers.js';

const TZ_OFFSET = '+07:00'; // Asia/Bangkok (no DST) — the default REPORT_TIMEZONE
let t: TestApp;
let lead: Client;
let viewer: Client;
let outsider: Client;
let P: string;
let today: string;
let tina: number;
let umar: number;
const rel: Record<'A' | 'B' | 'C', ReleaseDTO> = {} as never;
const plan: Record<'P1' | 'P2' | 'P3', PlanDTO> = {} as never;
/** Run case id by `<run>:<case key>`. */
const rc: Record<string, number> = {};
const cases: Record<string, TestCaseDTO> = {};
let otherProjectRelease: ReleaseDTO;

/** Bangkok wall time `hh:mm` on `today + offset` days. */
function at(offset: number, hhmm: string): Date {
  return new Date(`${addDays(today, offset)}T${hhmm}:00${TZ_OFFSET}`);
}

/** Records a result like the API does (history row + current status on the run case). */
async function record(runCaseId: number, status: ResultStatus, when: Date, by: number) {
  const db = t.prisma.db;
  await db.runCaseResult.create({
    data: { runCaseId, status, executedAt: when, executedById: by, source: 'ui' },
  });
  const executed = status !== 'untested';
  await db.runCase.update({
    where: { id: runCaseId },
    data: {
      status,
      executedAt: executed ? when : null,
      executedById: executed ? by : null,
    },
  });
}

async function setRunCreated(runId: number, when: Date) {
  await t.prisma.db.testRun.update({ where: { id: runId }, data: { createdAt: when } });
}

beforeAll(async () => {
  t = await createTestApp();
  today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  const l = await createUser(t.prisma, 'lead');
  const ti = await createUser(t.prisma, 'tina');
  const um = await createUser(t.prisma, 'umar');
  const v = await createUser(t.prisma, 'viewer');
  await createUser(t.prisma, 'outsider');
  tina = ti.id;
  umar = um.id;
  const projectId = (
    await createProject(t.prisma, 'REP', [
      { userId: l.id, role: 'lead' },
      { userId: ti.id, role: 'tester' },
      { userId: um.id, role: 'tester' },
      { userId: v.id, role: 'viewer' },
    ])
  ).id;
  const otherProject = (await createProject(t.prisma, 'OTH', [{ userId: l.id, role: 'lead' }])).id;
  P = `/projects/${projectId}`;
  lead = await login(t, 'lead');
  viewer = await login(t, 'viewer');
  outsider = await login(t, 'outsider');

  rel.A = expectBody<ReleaseDTO>(
    await lead.post(`${P}/releases`, { name: 'A', startDate: '2026-09-01', status: 'active' }),
    201,
  );
  rel.B = expectBody<ReleaseDTO>(
    await lead.post(`${P}/releases`, { name: 'B', startDate: '2026-10-01' }),
    201,
  );
  rel.C = expectBody<ReleaseDTO>(await lead.post(`${P}/releases`, { name: 'C' }), 201);
  otherProjectRelease = expectBody<ReleaseDTO>(
    await lead.post(`/projects/${otherProject}/releases`, { name: 'Other' }),
    201,
  );

  const app = expectBody<SuiteDTO>(
    await lead.post(`${P}/suites`, { name: 'Mobile app', prefix: 'APP' }),
    201,
  );
  const mod = expectBody<SuiteDTO>(
    await lead.post(`${P}/suites`, { name: 'Modbus', prefix: 'MOD' }),
    201,
  );
  const old = expectBody<SuiteDTO>(
    await lead.post(`${P}/suites`, { name: 'Old', prefix: 'OLD' }),
    201,
  );
  const addCase = async (key: string, suiteId: number, body: Record<string, unknown>) => {
    cases[key] = expectBody<TestCaseDTO>(
      await lead.post(`${P}/suites/${suiteId}/cases`, { title: key, ...body }),
      201,
    );
  };
  await addCase('a1', app.id, { priority: 'critical', estimateMinutes: 10 });
  await addCase('a2', app.id, { priority: 'high', estimateMinutes: 20 });
  await addCase('a3', app.id, { priority: 'medium', estimateMinutes: 30 });
  await addCase('a4', app.id, { priority: 'medium', estimateMinutes: 40 });
  await addCase('a5', app.id, { status: 'deprecated' });
  await addCase('a6', app.id, {});
  await addCase('a7', app.id, { status: 'draft', priority: 'low' });
  await addCase('m1', mod.id, { estimateMinutes: 5 });
  await addCase('m2', mod.id, { estimateMinutes: 15 });
  await addCase('o1', old.id, {});
  expect((await lead.delete(`${P}/cases/${cases.a6!.id}`)).status).toBe(204);
  expectBody<SuiteDTO>(await lead.patch(`${P}/suites/${old.id}`, { isArchived: true }), 200);

  const newPlan = async (docNo: string, releaseId?: number) =>
    expectBody<PlanDTO>(await lead.post(`${P}/plans`, { docNo, title: docNo, releaseId }), 201);
  plan.P1 = await newPlan('P1', rel.A.id);
  plan.P2 = await newPlan('P2', rel.B.id);
  plan.P3 = await newPlan('P3');
  const newRun = async (planId: number, suiteId: number, code: string, testerId: number | null) => {
    const r = expectBody<RunDTO>(
      await lead.post(`${P}/plans/${planId}/runs`, { suiteId, code, testerId }),
      201,
    );
    for (const c of expectBody<RunCaseDTO[]>(await lead.get(`${P}/runs/${r.id}/cases`), 200)) {
      rc[`${code}:${c.title}`] = c.id;
    }
    return r;
  };
  const R1 = await newRun(plan.P1.id, app.id, 'R1', tina);
  const R2 = await newRun(plan.P2.id, app.id, 'R2', umar);
  const R3 = await newRun(plan.P2.id, mod.id, 'R3', null);
  const R4 = await newRun(plan.P3.id, mod.id, 'R4', tina);
  await setRunCreated(R1.id, at(-10, '12:00'));
  await setRunCreated(R2.id, at(-2, '14:00'));
  await setRunCreated(R3.id, at(-12, '09:00'));
  await setRunCreated(R4.id, at(-20, '09:00'));

  // History (Bangkok wall times).
  await record(rc['R1:a1']!, 'ok', at(-8, '10:00'), tina);
  await record(rc['R1:a2']!, 'ng', at(-3, '23:30'), tina);
  await record(rc['R1:a2']!, 'ok', at(-2, '00:15'), tina); // same UTC day as the NG above
  await record(rc['R1:a3']!, 'blocked', at(-1, '09:00'), tina);
  await record(rc['R1:a3']!, 'untested', at(-1, '10:00'), tina);
  await record(rc['R1:a3']!, 'ng', at(0, '07:00'), tina);
  await record(rc['R1:a4']!, 'ok_cond', at(0, '08:00'), tina);
  await record(rc['R3:m1']!, 'ok', at(-1, '12:00'), umar);
  await record(rc['R4:m1']!, 'ok', at(-15, '12:00'), tina);
  await record(rc['R4:m2']!, 'ok', at(-15, '12:30'), tina);

  // Assignees: explicit assignee wins over the run tester.
  const db = t.prisma.db;
  await db.runCase.update({ where: { id: rc['R2:a2']! }, data: { assigneeId: tina } });
  await db.runCase.update({ where: { id: rc['R3:m2']! }, data: { assigneeId: umar } });
  // P3 is completed (excluded from workload); P1 has a judgement.
  await db.testPlan.update({ where: { id: plan.P3.id }, data: { status: 'completed' } });
  await db.testPlan.update({
    where: { id: plan.P1.id },
    data: { overallJudgement: 'pass_with_condition', status: 'in_progress' },
  });

  // Defects (dates set explicitly below).
  const newDefect = async (body: Record<string, unknown>) =>
    expectBody<DefectDTO>(await lead.post(`${P}/defects`, body), 201);
  const d1 = await newDefect({
    title: 'd1',
    severity: 'critical',
    releaseId: rel.A.id,
    assigneeId: tina,
    runCaseId: rc['R1:a3'],
  });
  const d2 = await newDefect({
    title: 'd2',
    severity: 'major',
    releaseId: rel.A.id,
    runCaseId: rc['R1:a3'],
  });
  expectBody<DefectDTO>(
    await lead.post(`${P}/defects/${d2.id}/links`, { runCaseId: rc['R2:a3'] }),
    200,
  );
  const d3 = await newDefect({
    title: 'd3',
    severity: 'minor',
    releaseId: rel.B.id,
    assigneeId: umar,
    runCaseId: rc['R1:a2'],
  });
  const d4 = await newDefect({ title: 'd4', severity: 'trivial', assigneeId: tina });
  for (const [d, to] of [
    [d2, 'open'],
    [d2, 'resolved'],
    [d3, 'rejected'],
    [d4, 'open'],
  ] as const) {
    expectBody<DefectDTO>(await lead.post(`${P}/defects/${d.id}/transition`, { to }), 200);
  }
  const setDates = (id: number, data: Prisma.DefectUpdateInput) =>
    db.defect.update({ where: { id }, data });
  await setDates(d1.id, { createdAt: at(-3, '10:00') });
  await setDates(d2.id, { createdAt: at(-4, '09:00'), resolvedAt: at(-1, '15:00') });
  await setDates(d3.id, { createdAt: at(-6, '09:00'), closedAt: at(-2, '11:00') });
  await setDates(d4.id, { createdAt: at(0, '01:00') });
});
afterAll(() => t.close());

describe('GET reports/trend', () => {
  it('returns one point per day for the whole project, bucketed in REPORT_TIMEZONE', async () => {
    const r = expectBody<ReportTrendDTO>(await viewer.get(`${P}/reports/trend?days=5`), 200);
    expect(r.timezone).toBe('Asia/Bangkok');
    expect(r.from).toBe(addDays(today, -4));
    expect(r.to).toBe(today);
    expect(r.total).toBe(12);
    expect(r.points.map((p) => [p.date, p.executed, p.remaining, p.passRate])).toEqual([
      [addDays(today, -4), 0, 5, 1],
      [addDays(today, -3), 1, 4, 0.75],
      [addDays(today, -2), 1, 8, 1],
      [addDays(today, -1), 2, 7, 1],
      [today, 2, 5, 6 / 7],
    ]);
    expect(r.points[1]!.byStatus.ng).toBe(1);
    expect(r.points[2]!.byStatus.ok).toBe(1);
    expect(r.points[3]!.byStatus).toMatchObject({ blocked: 1, ok: 1, untested: 0 });
    expect(r.points[4]!.byStatus).toMatchObject({ ng: 1, ok_cond: 1 });
  });

  it('defaults to 30 days and validates the range', async () => {
    const r = expectBody<ReportTrendDTO>(await viewer.get(`${P}/reports/trend`), 200);
    expect(r.points).toHaveLength(30);
    expect(r.points[29]!.date).toBe(today);
    expect((await viewer.get(`${P}/reports/trend?days=0`)).status).toBe(400);
    expect((await viewer.get(`${P}/reports/trend?days=366`)).status).toBe(400);
    expect(
      expectBody<ReportTrendDTO>(await viewer.get(`${P}/reports/trend?days=365`), 200).points,
    ).toHaveLength(365);
  });

  it('scopes to a release (its plans) or a plan (which wins over the release)', async () => {
    const byRelease = expectBody<ReportTrendDTO>(
      await viewer.get(`${P}/reports/trend?days=5&releaseId=${rel.B.id}`),
      200,
    );
    expect(byRelease.total).toBe(6);
    expect(byRelease.points.map((p) => [p.executed, p.remaining, p.passRate])).toEqual([
      [0, 2, null],
      [0, 2, null],
      [0, 6, null],
      [1, 5, 1],
      [0, 5, 1],
    ]);
    const byPlan = expectBody<ReportTrendDTO>(
      await viewer.get(`${P}/reports/trend?days=5&releaseId=${rel.B.id}&planId=${plan.P1.id}`),
      200,
    );
    expect(byPlan.total).toBe(4);
    expect(byPlan.points.map((p) => [p.executed, p.remaining, p.passRate])).toEqual([
      [0, 3, 1],
      [1, 2, 0.5],
      [1, 2, 1],
      [1, 2, 1],
      [2, 0, 0.75],
    ]);
  });

  it('rejects scopes outside the project', async () => {
    const badPlan = await viewer.get(`${P}/reports/trend?planId=999999`);
    expect(badPlan.status).toBe(404);
    expect(errorCode(badPlan)).toBe('PLAN_NOT_FOUND');
    const badRelease = await viewer.get(`${P}/reports/trend?releaseId=${otherProjectRelease.id}`);
    expect(badRelease.status).toBe(422);
    expect(errorCode(badRelease)).toBe('BAD_RELEASE');
    expect(errorCode(await outsider.get(`${P}/reports/trend`))).toBe('PROJECT_NOT_FOUND');
  });
});

describe('GET reports/workload', () => {
  it('groups run cases of open plans by effective assignee (assignee, else run tester)', async () => {
    const rows = expectBody<WorkloadRowDTO[]>(await viewer.get(`${P}/reports/workload`), 200);
    expect(rows.map((r) => r.user?.username ?? null)).toEqual(['tina', 'umar', null]);
    const [ti, um, none] = rows;
    expect(ti).toMatchObject({
      runCases: 5,
      untested: 1,
      executed: 4,
      ng: 1,
      remainingEstimateMinutes: 20,
      executedLast7Days: 3,
    });
    expect(um).toMatchObject({
      runCases: 4,
      untested: 4,
      executed: 0,
      ng: 0,
      remainingEstimateMinutes: 95,
      executedLast7Days: 0,
    });
    expect(none).toMatchObject({ runCases: 1, untested: 0, executed: 1, executedLast7Days: 1 });
  });

  it('applies the scope and leaves completed plans out', async () => {
    const byRelease = expectBody<WorkloadRowDTO[]>(
      await viewer.get(`${P}/reports/workload?releaseId=${rel.B.id}`),
      200,
    );
    expect(byRelease.map((r) => [r.user?.username ?? null, r.runCases])).toEqual([
      ['tina', 1],
      ['umar', 4],
      [null, 1],
    ]);
    expect(
      expectBody<WorkloadRowDTO[]>(
        await viewer.get(`${P}/reports/workload?planId=${plan.P3.id}`),
        200,
      ),
    ).toEqual([]);
  });
});

describe('GET reports/defects', () => {
  it('summarises status, severity, open trend, assignees and top cases', async () => {
    const r = expectBody<DefectReportDTO>(await viewer.get(`${P}/reports/defects?days=5`), 200);
    expect(r.byStatus).toMatchObject({ new: 1, open: 1, resolved: 1, rejected: 1, closed: 0 });
    expect(r.bySeverity).toEqual({ critical: 1, major: 1, minor: 1, trivial: 1 });
    expect(r.openBySeverity).toEqual({ critical: 1, major: 0, minor: 0, trivial: 1 });
    expect(r.trend).toEqual([
      { date: addDays(today, -4), opened: 1, closed: 0, open: 2 },
      { date: addDays(today, -3), opened: 1, closed: 0, open: 3 },
      { date: addDays(today, -2), opened: 0, closed: 1, open: 2 },
      { date: addDays(today, -1), opened: 0, closed: 0, open: 1 },
      { date: today, opened: 1, closed: 0, open: 2 },
    ]);
    expect(r.byAssignee).toEqual([
      { user: { id: tina, username: 'tina', displayName: 'Tina' }, open: 2 },
    ]);
    expect(r.topCases).toEqual([
      { testCaseId: cases.a3!.id, displayId: cases.a3!.displayId, title: 'a3', defectCount: 2 },
      { testCaseId: cases.a2!.id, displayId: cases.a2!.displayId, title: 'a2', defectCount: 1 },
    ]);
  });

  it('filters by the defect release', async () => {
    const r = expectBody<DefectReportDTO>(
      await viewer.get(`${P}/reports/defects?days=5&releaseId=${rel.A.id}`),
      200,
    );
    expect(r.byStatus).toMatchObject({ new: 1, resolved: 1, open: 0, rejected: 0 });
    expect(r.trend.map((p) => p.open)).toEqual([1, 2, 2, 1, 1]);
    expect(r.topCases.map((c) => [c.title, c.defectCount])).toEqual([['a3', 2]]);
    expect(
      errorCode(await viewer.get(`${P}/reports/defects?releaseId=${otherProjectRelease.id}`)),
    ).toBe('BAD_RELEASE');
  });
});

describe('GET reports/releases', () => {
  it('compares releases newest first', async () => {
    const rows = expectBody<ReleaseComparisonRowDTO[]>(
      await viewer.get(`${P}/reports/releases`),
      200,
    );
    expect(rows.map((r) => r.release.name)).toEqual(['B', 'A', 'C']);
    const [b, a, c] = rows;
    expect(b).toMatchObject({
      planCount: 1,
      runCount: 2,
      passRate: 1,
      defectsTotal: 1,
      defectsOpen: 0,
      judgements: { pass: 0, pass_with_condition: 0, not_pass: 0, none: 1 },
    });
    expect(b!.counts).toMatchObject({ untested: 5, ok: 1 });
    expect(b!.progress).toBeCloseTo(1 / 6);
    expect(a).toMatchObject({
      planCount: 1,
      runCount: 1,
      passRate: 0.75,
      progress: 1,
      defectsTotal: 2,
      defectsOpen: 1,
      judgements: { pass_with_condition: 1, none: 0 },
    });
    expect(a!.counts).toMatchObject({ ok: 2, ng: 1, ok_cond: 1, untested: 0 });
    expect(a!.release).toEqual({
      id: rel.A.id,
      name: 'A',
      status: 'active',
      startDate: '2026-09-01',
      endDate: null,
    });
    expect(c).toMatchObject({ planCount: 0, runCount: 0, passRate: null, progress: 0 });
  });
});

describe('GET reports/coverage', () => {
  it('reports per non-archived suite using the latest run case of every library case', async () => {
    const rows = expectBody<CoverageRowDTO[]>(await viewer.get(`${P}/reports/coverage`), 200);
    expect(rows.map((r) => r.suite.prefix)).toEqual(['APP', 'MOD']);
    const [app, mod] = rows;
    expect(app).toMatchObject({
      cases: 5,
      byPriority: { critical: 1, high: 1, medium: 2, low: 1 },
      inScope: 4,
      executed: 0, // the newest run (R2) is untested
      passed: 0,
      failed: 0,
      neverRun: 1,
    });
    expect(mod).toMatchObject({ cases: 2, inScope: 2, executed: 1, passed: 1, neverRun: 0 });
  });

  it('limits the runs to a release', async () => {
    const rows = expectBody<CoverageRowDTO[]>(
      await viewer.get(`${P}/reports/coverage?releaseId=${rel.A.id}`),
      200,
    );
    const [app, mod] = rows;
    expect(app).toMatchObject({ inScope: 4, executed: 4, passed: 3, failed: 1, neverRun: 1 });
    expect(mod).toMatchObject({ inScope: 0, executed: 0, neverRun: 2 });
  });

  it('is readable by viewers only within their projects', async () => {
    expect(errorCode(await outsider.get(`${P}/reports/coverage`))).toBe('PROJECT_NOT_FOUND');
    expect(errorCode(await outsider.get(`${P}/reports/releases`))).toBe('PROJECT_NOT_FOUND');
    // lead sees the same data as the viewer
    const leadRows = expectBody<CoverageRowDTO[]>(await lead.get(`${P}/reports/coverage`), 200);
    expect(leadRows).toHaveLength(2);
  });
});

describe('report data sanity', () => {
  it('uses the history rows recorded for the scenario', async () => {
    const rows = await t.prisma.db.runCaseResult.findMany({
      where: { runCaseId: { in: Object.values(rc) }, executedById: tina },
    });
    expect(rows.length).toBe(9);
    expect(umar).toBeGreaterThan(0);
  });
});

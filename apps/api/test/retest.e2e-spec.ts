import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import type {
  BuildDTO,
  DashboardDTO,
  DefectDTO,
  PlanDTO,
  ReleaseDTO,
  RunCaseDTO,
  RunDTO,
} from '@tmt/shared';
import {
  createCase,
  createProject,
  createSection,
  createSuite,
  createTestApp,
  createUser,
  errorCode,
  expectBody,
  login,
  type Client,
  type TestApp,
} from './helpers.js';

let t: TestApp;
let lead: Client;
let tester: Client;
let P: string;
let release: ReleaseDTO;
let other: ReleaseDTO;
let b1: BuildDTO;
let b2: BuildDTO;
let otherBuild: BuildDTO;
let plan: PlanDTO;
let run1: RunDTO;
let cases: RunCaseDTO[];

const retest = async (releaseId = release.id) =>
  expectBody<DashboardDTO>(await tester.get(`${P}/dashboard?releaseId=${releaseId}`), 200).retest;

const newDefect = async (body: Record<string, unknown>) =>
  expectBody<DefectDTO>(await tester.post(`${P}/defects`, { severity: 'major', ...body }), 201);

const resolve = async (defectId: number) => {
  expectBody(await tester.post(`${P}/defects/${defectId}/transition`, { to: 'open' }), 200);
  expectBody(await tester.post(`${P}/defects/${defectId}/transition`, { to: 'resolved' }), 200);
};

beforeAll(async () => {
  t = await createTestApp();
  const l = await createUser(t.prisma, 'lead');
  const te = await createUser(t.prisma, 'tester');
  const projectId = (
    await createProject(t.prisma, 'RTS', [
      { userId: l.id, role: 'lead' },
      { userId: te.id, role: 'tester' },
    ])
  ).id;
  P = `/projects/${projectId}`;
  lead = await login(t, 'lead');
  tester = await login(t, 'tester');
  const suite = await createSuite(t, projectId, { name: 'System', prefix: 'SY' });
  const section = await createSection(t, suite.id, 'All');
  for (const title of ['Power on', 'Power off', 'Timer']) {
    await createCase(t, suite, l.id, { title, sectionId: section.id });
  }
  release = expectBody<ReleaseDTO>(await lead.post(`${P}/releases`, { name: 'Step 1.1.7' }), 201);
  other = expectBody<ReleaseDTO>(await lead.post(`${P}/releases`, { name: 'Step 1.1.8' }), 201);
  const mk = async (releaseId: number, name: string) =>
    expectBody<BuildDTO>(await tester.post(`${P}/releases/${releaseId}/builds`, { name }), 201);
  b1 = await mk(release.id, '1.1.7(1.0.0)');
  b2 = await mk(release.id, '1.1.7(2.0.0)');
  otherBuild = await mk(other.id, '1.1.8(1.0.0)');
  plan = expectBody<PlanDTO>(
    await tester.post(`${P}/plans`, { docNo: 'RT-1', title: 'Step 1.1.7', releaseId: release.id }),
    201,
  );
  run1 = expectBody<RunDTO>(
    await tester.post(`${P}/plans/${plan.id}/runs`, {
      suiteId: suite.id,
      code: 'R1',
      buildId: b1.id,
    }),
    201,
  );
  cases = expectBody<RunCaseDTO[]>(await tester.get(`${P}/runs/${run1.id}/cases`), 200);
  for (const [i, status] of (['ng', 'ng', 'ok'] as const).entries()) {
    expectBody(await tester.put(`${P}/run-cases/${cases[i]!.id}/result`, { status }), 200);
  }
});
afterAll(() => t.close());

describe('waiting for retest', () => {
  it('shows nothing until a defect is resolved with a fix build', async () => {
    const d = await newDefect({
      title: 'Does not power on',
      runCaseId: cases[0]!.id,
      foundInBuildId: b1.id,
      fixedInBuildId: b2.id,
    });
    expect(await retest()).toEqual({ total: 0, items: [] });
    await resolve(d.id);
    const r = await retest();
    expect(r.total).toBe(1);
    expect(r.items[0]).toMatchObject({
      defect: { id: d.id, key: 'BUG-1', status: 'resolved', severity: 'major' },
      fixedInBuild: { id: b2.id, name: '1.1.7(2.0.0)' },
    });
    expect(r.items[0]!.cases).toEqual([
      expect.objectContaining({
        runCaseId: cases[0]!.id,
        displayId: 'SY-001',
        runId: run1.id,
        runCode: 'R1',
        planDocNo: 'RT-1',
        planStatus: expect.any(String),
        scheduledRun: null,
      }),
    ]);
  });

  it('is only listed on the release that owns the fix build', async () => {
    expect(await retest(other.id)).toEqual({ total: 0, items: [] });
  });

  it('re-runs only the chosen failed cases on the fix build, then shows them as scheduled', async () => {
    const wrong = await tester.post(`${P}/runs/${run1.id}/rerun`, {
      code: 'R1-x',
      runCaseIds: [cases[2]!.id],
    });
    expect(wrong.status).toBe(422);
    expect(errorCode(wrong)).toBe('NO_CASES');

    const run2 = expectBody<RunDTO>(
      await tester.post(`${P}/runs/${run1.id}/rerun`, {
        code: 'R2',
        buildId: b2.id,
        runCaseIds: [cases[0]!.id],
      }),
      201,
    );
    expect(run2).toMatchObject({
      build: { id: b2.id },
      counts: expect.objectContaining({ untested: 1 }),
    });
    const rerunCases = expectBody<RunCaseDTO[]>(
      await tester.get(`${P}/runs/${run2.id}/cases`),
      200,
    );
    expect(rerunCases).toHaveLength(1);
    expect(rerunCases[0]!.displayId).toBe('SY-001');

    const r = await retest();
    expect(r.items[0]!.cases[0]!.scheduledRun).toEqual({ id: run2.id, code: 'R2' });

    // A result on the fix build ends the wait, whether it passes or fails again.
    expectBody(
      await tester.put(`${P}/run-cases/${rerunCases[0]!.id}/result`, { status: 'ok' }),
      200,
    );
    expect(await retest()).toEqual({ total: 0, items: [] });
  });

  it('lists another resolved defect whose failed case was never re-run', async () => {
    const d = await newDefect({
      title: 'Does not power off',
      runCaseId: cases[1]!.id,
      fixedInBuildId: b2.id,
    });
    await resolve(d.id);
    const r = await retest();
    expect(r.total).toBe(1);
    expect(r.items[0]!.defect.id).toBe(d.id);
    expect(r.items[0]!.cases.map((c) => c.displayId)).toEqual(['SY-002']);
  });

  it('ignores defects that are not resolved or fixed in a build of another release', async () => {
    const open = await newDefect({
      title: 'Open one',
      runCaseId: cases[1]!.id,
      fixedInBuildId: b2.id,
    });
    expect(open.status).toBe('new');
    const foreign = await tester.post(`${P}/defects`, {
      title: 'Foreign',
      severity: 'minor',
      runCaseId: cases[1]!.id,
      fixedInBuildId: otherBuild.id,
    });
    expect(foreign.status).toBe(201);
    expect((await retest()).total).toBe(1);
  });
});

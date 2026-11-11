import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import type {
  BuildDTO,
  CompareDTO,
  CompareSideDTO,
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
let viewer: Client;
let outsider: Client;
let P: string;
const run: Record<string, RunDTO> = {};
const build: Record<string, BuildDTO> = {};

async function record(r: RunDTO, statuses: Record<string, string>) {
  const cases = expectBody<RunCaseDTO[]>(await lead.get(`${P}/runs/${r.id}/cases`), 200);
  for (const [title, status] of Object.entries(statuses)) {
    const c = cases.find((x) => x.title === title)!;
    expectBody(
      await lead.post(`${P}/runs/${r.id}/results/bulk`, { runCaseIds: [c.id], status }),
      200,
    );
  }
}

beforeAll(async () => {
  t = await createTestApp();
  const l = await createUser(t.prisma, 'lead');
  const v = await createUser(t.prisma, 'viewer');
  await createUser(t.prisma, 'outsider');
  const projectId = (
    await createProject(t.prisma, 'CMP', [
      { userId: l.id, role: 'lead' },
      { userId: v.id, role: 'viewer' },
    ])
  ).id;
  P = `/projects/${projectId}`;
  lead = await login(t, 'lead');
  viewer = await login(t, 'viewer');
  outsider = await login(t, 'outsider');

  const suite = await createSuite(t, projectId, { name: 'Unit operation', prefix: 'UO' });
  const section = await createSection(t, suite.id, 'All');
  for (const title of ['Power on', 'Power off', 'Timer']) {
    await createCase(t, suite, l.id, { title, sectionId: section.id });
  }
  const release = expectBody<ReleaseDTO>(await lead.post(`${P}/releases`, { name: 'Step 1' }), 201);
  for (const name of ['B1', 'B2']) {
    build[name] = expectBody<BuildDTO>(
      await lead.post(`${P}/releases/${release.id}/builds`, { name }),
      201,
    );
  }
  const plan = expectBody<PlanDTO>(
    await lead.post(`${P}/plans`, { docNo: 'D-1', title: 'T', releaseId: release.id }),
    201,
  );
  for (const [code, b] of [
    ['R1', 'B1'],
    ['R2', 'B2'],
  ] as const) {
    run[code] = expectBody<RunDTO>(
      await lead.post(`${P}/plans/${plan.id}/runs`, {
        suiteId: suite.id,
        code,
        buildId: build[b]!.id,
      }),
      201,
    );
  }
  await record(run.R1!, { 'Power on': 'ok', 'Power off': 'ng', Timer: 'ok' });
  await record(run.R2!, { 'Power on': 'ng', 'Power off': 'ok' });
});
afterAll(() => t.close());

describe('GET reports/compare', () => {
  it('lists the runs and builds that can be compared', async () => {
    const sides = expectBody<CompareSideDTO[]>(await viewer.get(`${P}/reports/compare/sides`), 200);
    expect(sides.map((s) => s.value)).toEqual([
      `run:${run.R2!.id}`,
      `run:${run.R1!.id}`,
      `build:${build.B2!.id}`,
      `build:${build.B1!.id}`,
    ]);
    expect(sides[0]).toMatchObject({ label: 'R2 · Unit operation', kind: 'run' });
    expect(sides.at(-1)).toMatchObject({ label: 'Step 1 / B1', detail: '1 run' });
  });

  it('finds regressions between two runs', async () => {
    const q = new URLSearchParams({ base: `run:${run.R1!.id}`, target: `run:${run.R2!.id}` });
    const out = expectBody<CompareDTO>(await viewer.get(`${P}/reports/compare?${q}`), 200);
    expect(out.base.label).toBe('R1 · Unit operation');
    expect(out.summary).toMatchObject({ regression: 1, fixed: 1, not_run: 1, unchanged: 0 });
    expect(out.rows.map((r) => [r.title, r.base, r.target, r.change])).toEqual([
      ['Power on', 'ok', 'ng', 'regression'],
      ['Timer', 'ok', 'untested', 'not_run'],
      ['Power off', 'ng', 'ok', 'fixed'],
    ]);
  });

  it('compares the latest results of two builds the same way', async () => {
    const q = new URLSearchParams({
      base: `build:${build.B1!.id}`,
      target: `build:${build.B2!.id}`,
    });
    const out = expectBody<CompareDTO>(await viewer.get(`${P}/reports/compare?${q}`), 200);
    expect(out.summary.regression).toBe(1);
    expect(out.target.label).toBe('Step 1 / B2');
  });

  it('refuses a bad side, an unknown run or build, and non-members', async () => {
    const get = (base: string, target: string, c: Client = viewer) =>
      c.get(`${P}/reports/compare?${new URLSearchParams({ base, target })}`);
    expect((await get('x', 'run:1')).status).toBe(400);
    expect(errorCode(await get('run:999999', `run:${run.R1!.id}`))).toBe('RUN_NOT_FOUND');
    expect(errorCode(await get(`run:${run.R1!.id}`, 'build:999999'))).toBe('BUILD_NOT_FOUND');
    expect(errorCode(await get('run:1', 'run:2', outsider))).toBe('PROJECT_NOT_FOUND');
  });
});

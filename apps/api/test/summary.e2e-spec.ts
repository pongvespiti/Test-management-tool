import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import type { PlanDTO, RunCaseDTO, RunDTO, SavedViewDTO, SummaryDTO } from '@tmt/shared';
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
let viewer: Client;
let outsider: Client;
let P: string;

async function makeRun(
  plan: PlanDTO,
  suiteId: number,
  code: string,
  environment: { label: string; value: string }[],
  results: Record<string, number>,
) {
  const run = expectBody<RunDTO>(
    await lead.post(`${P}/plans/${plan.id}/runs`, { suiteId, code, environment }),
    201,
  );
  const cases = expectBody<RunCaseDTO[]>(await lead.get(`${P}/runs/${run.id}/cases`), 200);
  let i = 0;
  for (const [status, n] of Object.entries(results)) {
    const ids = cases.slice(i, i + n).map((c) => c.id);
    i += n;
    if (ids.length === 0) continue;
    expectBody(
      await lead.post(`${P}/runs/${run.id}/results/bulk`, { runCaseIds: ids, status }),
      200,
    );
  }
  return run;
}

beforeAll(async () => {
  t = await createTestApp();
  const l = await createUser(t.prisma, 'lead');
  const te = await createUser(t.prisma, 'tester');
  const v = await createUser(t.prisma, 'viewer');
  await createUser(t.prisma, 'outsider');
  const projectId = (
    await createProject(t.prisma, 'SUM', [
      { userId: l.id, role: 'lead' },
      { userId: te.id, role: 'tester' },
      { userId: v.id, role: 'viewer' },
    ])
  ).id;
  P = `/projects/${projectId}`;
  lead = await login(t, 'lead');
  tester = await login(t, 'tester');
  viewer = await login(t, 'viewer');
  outsider = await login(t, 'outsider');

  const unit = await createSuite(t, projectId, {
    name: 'Unit operation',
    prefix: 'UO',
    topic: 'Unit operation test',
  });
  const adapter = await createSuite(t, projectId, {
    name: 'Adapter A',
    prefix: 'AD',
    topic: 'Adapter operation test',
  });
  for (const s of [unit, adapter]) {
    const section = await createSection(t, s.id, 'All');
    for (const title of ['One', 'Two', 'Three', 'Four']) {
      await createCase(t, s, l.id, { title, sectionId: section.id });
    }
  }
  const plan = expectBody<PlanDTO>(
    await lead.post(`${P}/plans`, { docNo: 'D-1', title: 'T' }),
    201,
  );
  await makeRun(
    plan,
    unit.id,
    'R1',
    [
      { label: 'Platform', value: 'Android' },
      { label: 'OS ver', value: '15' },
      { label: 'Unit model', value: 'A' },
    ],
    { ok: 3, ng: 1 },
  );
  await makeRun(
    plan,
    unit.id,
    'R2',
    [
      { label: 'Platform', value: 'iOS' },
      { label: 'OS ver', value: '18' },
      { label: 'Unit model', value: 'A' },
    ],
    { ok: 2, blocked: 1 },
  );
  await makeRun(
    plan,
    adapter.id,
    'R3',
    [
      { label: 'Platform', value: 'Android' },
      { label: 'OS ver', value: '14' },
      { label: 'Unit model', value: 'B' },
    ],
    { ok: 4 },
  );
});
afterAll(() => t.close());

describe('GET reports/summary', () => {
  it('sums every run when nothing is chosen', async () => {
    const s = expectBody<SummaryDTO>(await viewer.get(`${P}/reports/summary`), 200);
    expect(s.totals.runs).toBe(3);
    expect(s.totals.counts).toMatchObject({ ok: 9, ng: 1, blocked: 1, untested: 1 });
    expect(s.dimensions.map((d) => d.key)).toEqual(
      expect.arrayContaining(['Platform', 'OS ver', 'Unit model', '@topic']),
    );
  });

  it('groups by platform and topic', async () => {
    const q = new URLSearchParams({ rows: 'Platform', cols: '@topic' });
    const s = expectBody<SummaryDTO>(await viewer.get(`${P}/reports/summary?${q}`), 200);
    expect(s.rowValues).toEqual(['Android', 'iOS']);
    expect(s.colValues).toEqual(['Adapter operation test', 'Unit operation test']);
    const android = s.cells.find((c) => c.row === 'Android' && c.col === 'Unit operation test')!;
    expect(android.counts).toMatchObject({ ok: 3, ng: 1 });
    expect(android.runs.map((r) => r.code)).toEqual(['R1']);
  });

  it('filters and narrows the other dimensions', async () => {
    const q = new URLSearchParams({ rows: 'OS ver' });
    q.append('f', 'Platform=Android');
    const s = expectBody<SummaryDTO>(await viewer.get(`${P}/reports/summary?${q}`), 200);
    expect(s.totals.runs).toBe(2);
    expect(s.scopeRuns).toBe(3);
    expect(s.rowValues).toEqual(['14', '15']);
    const os = s.dimensions.find((d) => d.key === 'OS ver')!;
    expect(os.options.map((o) => o.value)).toEqual(['14', '15']);
  });

  it('refuses an unknown plan and release, and non-members', async () => {
    expect(errorCode(await viewer.get(`${P}/reports/summary?planId=999999`))).toBe(
      'PLAN_NOT_FOUND',
    );
    expect(errorCode(await viewer.get(`${P}/reports/summary?releaseId=999999`))).toBe(
      'BAD_RELEASE',
    );
    expect(errorCode(await outsider.get(`${P}/reports/summary`))).toBe('PROJECT_NOT_FOUND');
  });
});

describe('saved views', () => {
  const config = { rows: 'Platform', cols: null, filters: { 'Unit model': ['A'] } };

  it('keeps a private view for its owner only and a shared one for everybody', async () => {
    const mine = expectBody<SavedViewDTO>(
      await tester.post(`${P}/reports/views`, { name: 'Unit A by platform', config }),
      201,
    );
    expect(mine).toMatchObject({ name: 'Unit A by platform', shared: false, config });
    const shared = expectBody<SavedViewDTO>(
      await lead.post(`${P}/reports/views`, {
        name: 'Release board',
        shared: true,
        config: { rows: '@topic', cols: 'Platform', filters: {} },
      }),
      201,
    );
    const seenByTester = expectBody<SavedViewDTO[]>(await tester.get(`${P}/reports/views`), 200);
    expect(seenByTester.map((v) => v.name)).toEqual(['Release board', 'Unit A by platform']);
    const seenByViewer = expectBody<SavedViewDTO[]>(await viewer.get(`${P}/reports/views`), 200);
    expect(seenByViewer.map((v) => v.name)).toEqual(['Release board']);
    expect(shared.owner?.username).toBe('lead');

    expect(errorCode(await viewer.delete(`${P}/reports/views/${mine.id}`))).toBe('VIEW_NOT_FOUND');
    expect(errorCode(await tester.delete(`${P}/reports/views/${shared.id}`))).toBe('FORBIDDEN');
    // A private view is invisible to everybody else, a lead included.
    expect(errorCode(await lead.delete(`${P}/reports/views/${mine.id}`))).toBe('VIEW_NOT_FOUND');
    expect((await tester.delete(`${P}/reports/views/${mine.id}`)).status).toBe(204);
    expect((await lead.delete(`${P}/reports/views/${shared.id}`)).status).toBe(204);
  });

  it('refuses a second view with the same name and a blank name', async () => {
    expectBody(await tester.post(`${P}/reports/views`, { name: 'Twice', config }), 201);
    expect(errorCode(await tester.post(`${P}/reports/views`, { name: 'Twice', config }))).toBe(
      'VIEW_NAME_TAKEN',
    );
    expect((await tester.post(`${P}/reports/views`, { name: '  ', config })).status).toBe(400);
  });
});

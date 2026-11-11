import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import type { BuildDTO, MyWorkDTO, PlanDTO, ReleaseDTO, RunCaseDTO, RunDTO } from '@tmt/shared';
import type { Suite } from '@tmt/database';
import {
  anon,
  API,
  createCase,
  createProject,
  createSection,
  createSuite,
  createTestApp,
  createUser,
  expectBody,
  login,
  type Client,
  type TestApp,
} from './helpers.js';

let t: TestApp;
let lead: Client;
let tom: Client;
let ann: Client;
let viewer: Client;
let tomId: number;
let annId: number;
let P: string;
let suite: Suite;
let release: ReleaseDTO;
let build: BuildDTO;
let plan: PlanDTO;
let run: RunDTO;
let cases: RunCaseDTO[];

const today = () => new Date().toISOString().slice(0, 10);
const mine = async (client: Client, query = '') =>
  expectBody<MyWorkDTO>(await client.get(`${P}/my-work${query}`), 200);

beforeAll(async () => {
  t = await createTestApp();
  const l = await createUser(t.prisma, 'lead');
  const a = await createUser(t.prisma, 'tom');
  const b = await createUser(t.prisma, 'ann');
  const v = await createUser(t.prisma, 'viewer');
  tomId = a.id;
  annId = b.id;
  const projectId = (
    await createProject(t.prisma, 'MYW', [
      { userId: l.id, role: 'lead' },
      { userId: a.id, role: 'tester' },
      { userId: b.id, role: 'tester' },
      { userId: v.id, role: 'viewer' },
    ])
  ).id;
  P = `/projects/${projectId}`;
  lead = await login(t, 'lead');
  tom = await login(t, 'tom');
  ann = await login(t, 'ann');
  viewer = await login(t, 'viewer');
  suite = await createSuite(t, projectId, { name: 'System', prefix: 'SY' });
  const section = await createSection(t, suite.id, 'All');
  for (const [title, priority] of [
    ['Power on', 'critical'],
    ['Power off', 'low'],
    ['Timer', 'medium'],
  ] as const) {
    await createCase(t, suite, l.id, {
      title,
      sectionId: section.id,
      priority,
      estimateMinutes: 10,
    });
  }
  release = expectBody<ReleaseDTO>(await lead.post(`${P}/releases`, { name: 'Step 1.1.7' }), 201);
  build = expectBody<BuildDTO>(
    await tom.post(`${P}/releases/${release.id}/builds`, { name: '1.1.7(2.0.0)' }),
    201,
  );
  plan = expectBody<PlanDTO>(
    await tom.post(`${P}/plans`, { docNo: 'MY-1', title: 'Mine', releaseId: release.id }),
    201,
  );
  run = expectBody<RunDTO>(
    await tom.post(`${P}/plans/${plan.id}/runs`, {
      suiteId: suite.id,
      code: 'R1',
      testerId: tomId,
      buildId: build.id,
    }),
    201,
  );
  cases = expectBody<RunCaseDTO[]>(await tom.get(`${P}/runs/${run.id}/cases`), 200);
});
afterAll(() => t.close());

describe('my work', () => {
  it('lists every case of my run, most urgent first, with release and build', async () => {
    const r = await mine(tom);
    expect(r).toMatchObject({
      user: { id: tomId, username: 'tom' },
      range: 'day',
      from: today(),
      to: today(),
      assigned: { untested: 3, ng: 0, blocked: 0, total: 3, remainingEstimateMinutes: 30 },
      summary: { executed: 0, elapsedSec: 0, groups: [], defects: [] },
    });
    expect(r.assigned.truncated).toBe(false);
    expect(r.assigned.items.map((i) => i.priority)).toEqual(['critical', 'medium', 'low']);
    expect(r.assigned.items[0]).toMatchObject({
      displayId: 'SY-001',
      runCode: 'R1',
      planDocNo: 'MY-1',
      release: { id: release.id, name: 'Step 1.1.7' },
      build: { id: build.id, name: '1.1.7(2.0.0)' },
    });
  });

  it('moves a case to the person it is assigned to', async () => {
    const give = await tom.post(`${P}/runs/${run.id}/assign`, {
      runCaseIds: [cases[2]!.id],
      assigneeId: annId,
    });
    expect(give.status).toBe(200);
    expect((await mine(tom)).assigned.total).toBe(2);
    const a = await mine(ann);
    expect(a.assigned.items.map((i) => i.runCaseId)).toEqual([cases[2]!.id]);
    expect((await mine(lead)).assigned.total).toBe(0);
  });

  it('summarises what I recorded: NG first in the list, results by build, my defects', async () => {
    const ok = await tom.put(`${P}/run-cases/${cases[0]!.id}/result`, {
      status: 'ok',
      elapsedSec: 120,
    });
    expect(ok.status).toBe(200);
    expect(
      (
        await tom.post(`${P}/runs/${run.id}/results/bulk`, {
          runCaseIds: [cases[1]!.id],
          status: 'ng',
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await tom.post(`${P}/defects`, {
          title: 'Does not power off',
          severity: 'major',
          runCaseId: cases[1]!.id,
        })
      ).status,
    ).toBe(201);

    const r = await mine(tom);
    expect(r.assigned).toMatchObject({ untested: 0, ng: 1, total: 1 });
    expect(r.assigned.items.map((i) => [i.runCaseId, i.status])).toEqual([[cases[1]!.id, 'ng']]);
    expect(r.summary.executed).toBe(2);
    expect(r.summary.counts).toMatchObject({ ok: 1, ng: 1 });
    expect(r.summary.elapsedSec).toBe(120);
    expect(r.summary.days).toEqual([{ date: today(), executed: 2, elapsedSec: 120 }]);
    expect(r.summary.groups).toEqual([
      {
        release: { id: release.id, name: 'Step 1.1.7' },
        build: { id: build.id, name: '1.1.7(2.0.0)' },
        executed: 2,
        counts: expect.objectContaining({ ok: 1, ng: 1 }),
        elapsedSec: 120,
      },
    ]);
    expect(r.summary.defects).toEqual([
      expect.objectContaining({ key: 'BUG-1', title: 'Does not power off', status: 'new' }),
    ]);

    // Results and defects belong to whoever recorded them.
    const other = await mine(ann);
    expect(other.summary).toMatchObject({ executed: 0, defects: [] });
  });

  it('covers the whole Monday-to-Sunday week and any other day', async () => {
    const week = await mine(tom, '?range=week');
    expect(week.summary.days).toHaveLength(7);
    expect(week.summary.executed).toBe(2);
    expect(
      new Date(`${week.to}T00:00:00Z`).getTime() - new Date(`${week.from}T00:00:00Z`).getTime(),
    ).toBe(6 * 86_400_000);
    const past = await mine(tom, '?date=2020-01-01');
    expect(past).toMatchObject({ from: '2020-01-01', to: '2020-01-01' });
    expect(past.summary.executed).toBe(0);
  });

  it('is readable by viewers (empty) and validates the query', async () => {
    expect((await mine(viewer)).assigned.total).toBe(0);
    expect((await tom.get(`${P}/my-work?range=month`)).status).toBe(400);
    expect((await tom.get(`${P}/my-work?date=22-10-2026`)).status).toBe(400);
  });

  it('lets a lead or a viewer open the work of another member', async () => {
    const own = await mine(tom);
    for (const client of [lead, viewer]) {
      const seen = await mine(client, `?userId=${tomId}`);
      expect(seen.user.id).toBe(tomId);
      expect(seen.assigned).toEqual(own.assigned);
      expect(seen.summary).toEqual(own.summary);
    }
    expect((await mine(lead, `?userId=${annId}&range=week`)).user.id).toBe(annId);
    const stranger = await createUser(t.prisma, 'stranger');
    const res = await lead.get(`${P}/my-work?userId=${stranger.id}`);
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ error: { code: 'BAD_USER' } });
  });

  it('drops cases of completed plans', async () => {
    expectBody(await tom.post(`${P}/plans/${plan.id}/complete`), 200);
    expect((await mine(tom)).assigned.total).toBe(0);
    expect((await mine(ann)).assigned.total).toBe(0);
    // What I recorded stays in the summary.
    expect((await mine(tom)).summary.executed).toBe(2);
  });

  it('requires a session', async () => {
    expect((await anon(t).get(`${API}${P}/my-work`)).status).toBe(401);
  });
});

import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import type {
  AssignSuitesResultDTO,
  PlanDTO,
  ReleaseDTO,
  RunCaseDTO,
  RunDTO,
  TopicsDTO,
} from '@tmt/shared';
import type { Suite } from '@tmt/database';
import {
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
let manager: Client;
let tom: Client;
let ann: Client;
let viewer: Client;
let tomId: number;
let annId: number;
let viewerId: number;
let P: string;
let release: ReleaseDTO;
let plan: PlanDTO;
let suites: Suite[];
let runs: RunDTO[];

const topics = async (client: Client, query = '') =>
  expectBody<TopicsDTO>(await client.get(`${P}/topics${query}`), 200);

beforeAll(async () => {
  t = await createTestApp();
  const l = await createUser(t.prisma, 'lead');
  const m = await createUser(t.prisma, 'mgr');
  const a = await createUser(t.prisma, 'tom');
  const b = await createUser(t.prisma, 'ann');
  const v = await createUser(t.prisma, 'viewer');
  tomId = a.id;
  annId = b.id;
  viewerId = v.id;
  const projectId = (
    await createProject(t.prisma, 'TOP', [
      { userId: l.id, role: 'lead' },
      { userId: m.id, role: 'manager' },
      { userId: a.id, role: 'tester' },
      { userId: b.id, role: 'tester' },
      { userId: v.id, role: 'viewer' },
    ])
  ).id;
  P = `/projects/${projectId}`;
  lead = await login(t, 'lead');
  manager = await login(t, 'mgr');
  tom = await login(t, 'tom');
  ann = await login(t, 'ann');
  viewer = await login(t, 'viewer');

  release = expectBody<ReleaseDTO>(await lead.post(`${P}/releases`, { name: 'Step 1.1.7' }), 201);
  plan = expectBody<PlanDTO>(
    await lead.post(`${P}/plans`, { docNo: 'T-1', title: 'Topics', releaseId: release.id }),
    201,
  );
  // Two suites of one topic (one per unit model), one suite of another topic, one never run.
  const defs = [
    { name: 'Adapter Model A', prefix: 'A35', topic: 'Adapter operation test' },
    { name: 'Adapter Model B', prefix: 'A50', topic: 'Adapter operation test' },
    { name: 'Unit operation test', prefix: 'UO', topic: '' },
    { name: 'Modbus system test', prefix: 'MB', topic: '' },
  ];
  suites = [];
  for (const def of defs) {
    const suite = await createSuite(t, projectId, { name: def.name, prefix: def.prefix });
    if (def.topic) {
      expectBody(await lead.patch(`${P}/suites/${suite.id}`, { topic: def.topic }), 200);
    }
    const section = await createSection(t, suite.id, 'All');
    for (const title of ['One', 'Two']) {
      await createCase(t, suite, l.id, { title, sectionId: section.id, estimateMinutes: 10 });
    }
    suites.push(suite);
  }
  runs = [];
  for (const [i, suite] of suites.slice(0, 3).entries()) {
    runs.push(
      expectBody<RunDTO>(
        await lead.post(`${P}/plans/${plan.id}/runs`, { suiteId: suite.id, code: `R${i + 1}` }),
        201,
      ),
    );
  }
});
afterAll(() => t.close());

describe('topics', () => {
  it('lists topics with suites, runs and the suites nobody has run yet', async () => {
    const all = await topics(manager);
    expect(all.release?.name).toBe('Step 1.1.7');
    expect(all.topics.map((g) => [g.topic, g.suites.length])).toEqual([
      ['Adapter operation test', 2],
      ['Unit operation test', 1],
    ]);
    expect(all.topics[0]).toMatchObject({ total: 4, state: 'not_started' });
    expect(all.topics[0]!.suites[0]!.runs[0]).toMatchObject({ tester: null, state: 'not_started' });
    expect(all.suitesWithoutRuns).toEqual([
      { id: suites[3]!.id, name: 'Modbus system test', topic: 'Modbus system test' },
    ]);
  });

  it('gives suites to people, one suite each, with a due date', async () => {
    const first = expectBody<AssignSuitesResultDTO>(
      await manager.post(`${P}/topics/assign`, {
        releaseId: release.id,
        suiteIds: [suites[0]!.id, suites[2]!.id],
        testerId: tomId,
        dueDate: '2026-11-20',
      }),
      200,
    );
    expect(first).toEqual({ updatedRuns: 2, lockedRuns: 0, suitesWithoutRuns: [] });
    const second = expectBody<AssignSuitesResultDTO>(
      await lead.post(`${P}/topics/assign`, {
        releaseId: release.id,
        suiteIds: [suites[1]!.id, suites[3]!.id],
        testerId: annId,
      }),
      200,
    );
    // The Modbus suite has no run in the release yet.
    expect(second).toEqual({ updatedRuns: 1, lockedRuns: 0, suitesWithoutRuns: [suites[3]!.id] });

    const all = await topics(lead);
    const adapter = all.topics[0]!;
    expect(adapter.suites[0]!.runs[0]).toMatchObject({
      tester: { id: tomId },
      dueDate: '2026-11-20',
    });
    expect(adapter.suites[1]!.runs[0]).toMatchObject({ tester: { id: annId }, dueDate: null });
  });

  it('shows one person only their runs, with their own progress', async () => {
    const cases = expectBody<RunCaseDTO[]>(await tom.get(`${P}/runs/${runs[0]!.id}/cases`), 200);
    expectBody(await tom.put(`${P}/run-cases/${cases[0]!.id}/result`, { status: 'ok' }), 200);
    const mine = await topics(tom, `?userId=${tomId}`);
    expect(mine.user?.id).toBe(tomId);
    expect(mine.suitesWithoutRuns).toEqual([]);
    expect(mine.topics.map((g) => g.topic)).toEqual([
      'Adapter operation test',
      'Unit operation test',
    ]);
    const run = mine.topics[0]!.suites[0]!.runs[0]!;
    expect(run).toMatchObject({ total: 2, state: 'in_progress', remainingEstimateMinutes: 10 });
    expect(run.counts.ok).toBe(1);
    // Ann only has the other adapter suite.
    const hers = await topics(manager, `?userId=${annId}`);
    expect(hers.topics.map((g) => [g.topic, g.suites.map((s) => s.suite.name)])).toEqual([
      ['Adapter operation test', ['Adapter Model B']],
    ]);
    // A case assigned to Ann inside Tom's run moves out of Tom's count into hers.
    expectBody(
      await lead.post(`${P}/runs/${runs[0]!.id}/assign`, {
        runCaseIds: [cases[1]!.id],
        assigneeId: annId,
      }),
      200,
    );
    const tomNow = (await topics(tom, `?userId=${tomId}`)).topics[0]!.suites[0]!.runs[0]!;
    expect(tomNow).toMatchObject({ total: 1, state: 'done' });
    const annNow = await topics(ann, `?userId=${annId}`);
    expect(annNow.topics[0]!.suites.map((s) => s.suite.name)).toEqual([
      'Adapter Model A',
      'Adapter Model B',
    ]);
  });

  it('keeps the team view and assigning to managers and leads', async () => {
    for (const client of [tom, viewer]) {
      expect((await client.get(`${P}/topics`)).status).toBe(403);
      expect((await client.get(`${P}/topics?userId=${annId}`)).status).toBe(403);
      const res = await client.post(`${P}/topics/assign`, {
        releaseId: release.id,
        suiteIds: [suites[0]!.id],
        testerId: tomId,
      });
      expect(res.status).toBe(403);
    }
    // Everyone sees their own list.
    expect((await topics(viewer, `?userId=${viewerId}`)).topics).toEqual([]);
  });

  it('validates the release, suites, person and dates', async () => {
    const bad = (body: object) => manager.post(`${P}/topics/assign`, body);
    const ok = { releaseId: release.id, suiteIds: [suites[0]!.id], testerId: tomId };
    expect((await bad({ ...ok, releaseId: 9999 })).status).toBe(422);
    expect((await bad({ ...ok, suiteIds: [9999] })).status).toBe(422);
    // A viewer cannot be given work; neither can a manager.
    expect((await bad({ ...ok, testerId: viewerId })).status).toBe(422);
    expect((await bad({ ...ok, suiteIds: [] })).status).toBe(400);
    expect((await bad({ ...ok, dueDate: '20-11-2026' })).status).toBe(400);
    expect((await manager.get(`${P}/topics?userId=${viewerId + 1000}`)).status).toBe(422);
  });

  it('takes runs away and clears the due date; completed plans stay as they are', async () => {
    const cleared = expectBody<AssignSuitesResultDTO>(
      await manager.post(`${P}/topics/assign`, {
        releaseId: release.id,
        suiteIds: [suites[0]!.id],
        testerId: null,
        dueDate: '',
      }),
      200,
    );
    expect(cleared.updatedRuns).toBe(1);
    const run = (await topics(lead)).topics[0]!.suites[0]!.runs[0]!;
    expect(run).toMatchObject({ tester: null, dueDate: null });

    expectBody(await lead.post(`${P}/plans/${plan.id}/complete`), 200);
    const locked = expectBody<AssignSuitesResultDTO>(
      await manager.post(`${P}/topics/assign`, {
        releaseId: release.id,
        suiteIds: [suites[0]!.id],
        testerId: tomId,
      }),
      200,
    );
    expect(locked).toEqual({ updatedRuns: 0, lockedRuns: 1, suitesWithoutRuns: [] });
  });
});

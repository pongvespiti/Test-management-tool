/**
 * In-app notifications: created by assignments, a resolved defect, a changed requirement and by
 * due dates (noticed when the user looks); private to the user; read / read all.
 */
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import type { NotificationListDTO, PlanDTO, ReleaseDTO, RunDTO } from '@tmt/shared';
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
let tom: Client;
let ann: Client;
let viewer: Client;
let tomId: number;
let annId: number;
let P: string;
let plan: PlanDTO;
let suiteId: number;

const mine = async (client: Client, query = '') =>
  expectBody<NotificationListDTO>(await client.get(`${P}/notifications${query}`), 200);
const day = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  t = await createTestApp();
  const l = await createUser(t.prisma, 'lead');
  const a = await createUser(t.prisma, 'tom');
  const b = await createUser(t.prisma, 'ann');
  const v = await createUser(t.prisma, 'viewer');
  tomId = a.id;
  annId = b.id;
  const projectId = (
    await createProject(t.prisma, 'NTF', [
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
  const suite = await createSuite(t, projectId, { name: 'Unit operation', prefix: 'UO' });
  suiteId = suite.id;
  const section = await createSection(t, suite.id, 'All');
  await createCase(t, suite, l.id, {
    title: 'Power on',
    sectionId: section.id,
    references: 'REQ-1',
  });
  const release = expectBody<ReleaseDTO>(await lead.post(`${P}/releases`, { name: 'R1' }), 201);
  plan = expectBody<PlanDTO>(
    await lead.post(`${P}/plans`, { docNo: 'N-1', title: 'Notify', releaseId: release.id }),
    201,
  );
});
afterAll(() => t.close());

describe('notifications', () => {
  it('start empty and are private to each user', async () => {
    expect(await mine(tom)).toEqual({ items: [], unread: 0 });
  });

  it('tells a tester a run was given to them, but not the person who did it', async () => {
    const run = expectBody<RunDTO>(
      await lead.post(`${P}/plans/${plan.id}/runs`, { suiteId, code: 'RUN-1', testerId: tomId }),
      201,
    );
    const list = await mine(tom);
    expect(list.unread).toBe(1);
    expect(list.items[0]).toMatchObject({
      kind: 'assigned',
      read: false,
      link: `${P}/runs/${run.id}`,
    });
    expect(await mine(lead)).toEqual({ items: [], unread: 0 });
    expect(await mine(ann)).toEqual({ items: [], unread: 0 });

    // Moving the run to someone else notifies the new tester only.
    await lead.patch(`${P}/runs/${run.id}`, { testerId: annId });
    expect((await mine(ann)).items[0]).toMatchObject({ kind: 'assigned' });
    expect((await mine(tom)).unread).toBe(1);
    // Editing something else does not notify again.
    await lead.patch(`${P}/runs/${run.id}`, { remark: 'x' });
    expect((await mine(ann)).unread).toBe(1);
  });

  it('notices runs that are overdue or due soon once, and not when nothing is left to test', async () => {
    const late = expectBody<RunDTO>(
      await lead.post(`${P}/plans/${plan.id}/runs`, {
        suiteId,
        code: 'RUN-LATE',
        testerId: tomId,
        dueDate: day(-3),
      }),
      201,
    );
    const soon = expectBody<RunDTO>(
      await lead.post(`${P}/plans/${plan.id}/runs`, {
        suiteId,
        code: 'RUN-SOON',
        testerId: tomId,
        dueDate: day(1),
      }),
      201,
    );
    const far = await lead.post(`${P}/plans/${plan.id}/runs`, {
      suiteId,
      code: 'RUN-FAR',
      testerId: tomId,
      dueDate: day(30),
    });
    expect(far.status).toBe(201);
    const list = await mine(tom);
    const kinds = list.items.map((n) => `${n.kind}:${n.link}`);
    expect(kinds).toContain(`overdue:${P}/runs/${late.id}`);
    expect(kinds).toContain(`due_soon:${P}/runs/${soon.id}`);
    expect(list.items.filter((n) => n.kind === 'overdue' || n.kind === 'due_soon')).toHaveLength(2);
    // Looking again does not repeat them.
    expect((await mine(tom)).items).toHaveLength(list.items.length);
  });

  it('tells the reporter when a defect is resolved', async () => {
    const defect = expectBody<{ id: number }>(
      await ann.post(`${P}/defects`, {
        title: 'Does not start',
        severity: 'major',
        priority: 'high',
      }),
      201,
    );
    for (const to of ['open', 'resolved']) {
      expect((await lead.post(`${P}/defects/${defect.id}/transition`, { to })).status).toBe(200);
    }
    const list = await mine(ann);
    expect(list.items[0]).toMatchObject({
      kind: 'retest',
      link: `${P}/defects/${defect.id}`,
    });
  });

  it('tells testers with open runs when a requirement they test changes', async () => {
    const req = expectBody<{ id: number }>(
      await lead.post(`${P}/requirements`, { key: 'REQ-1', title: 'Powers on' }),
      201,
    );
    const before = (await mine(ann)).items.length;
    await lead.patch(`${P}/requirements/${req.id}`, { title: 'Powers on in 2 s' });
    const after = await mine(ann);
    expect(after.items.length).toBe(before + 1);
    expect(after.items[0]).toMatchObject({ kind: 'requirement_changed' });
    // A change that only touches the source document is silent.
    await lead.patch(`${P}/requirements/${req.id}`, { sourceRef: 'Spec' });
    expect((await mine(ann)).items.length).toBe(before + 1);
  });

  it('marks one or all as read, only for the owner', async () => {
    const list = await mine(ann, '?unread=true');
    expect(list.items.length).toBeGreaterThan(1);
    const first = list.items[0]!;
    expect((await tom.post(`${P}/notifications/${first.id}/read`)).status).toBe(404);
    expect((await ann.post(`${P}/notifications/${first.id}/read`)).status).toBe(204);
    expect((await mine(ann)).unread).toBe(list.unread - 1);
    expect((await mine(ann, '?unread=true')).items.map((n) => n.id)).not.toContain(first.id);
    expect((await ann.post(`${P}/notifications/read-all`)).status).toBe(204);
    expect(await mine(ann, '?unread=true')).toMatchObject({ items: [], unread: 0 });
    // Still listed, as read.
    expect((await mine(ann)).items.every((n) => n.read)).toBe(true);
  });

  it('is open to every member and validates the limit', async () => {
    expect((await viewer.get(`${P}/notifications`)).status).toBe(200);
    expect((await viewer.get(`${P}/notifications?limit=0`)).status).toBe(400);
  });
});

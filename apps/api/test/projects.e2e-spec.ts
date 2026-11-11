import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import {
  createProject,
  createTestApp,
  createUser,
  login,
  type Client,
  type TestApp,
} from './helpers.js';

describe('projects, members and releases', () => {
  let t: TestApp;
  let root: Client;
  let lead: Client;
  let tester: Client;
  let viewerId: number;
  let projectId: number;

  beforeAll(async () => {
    t = await createTestApp({ defaultDocNoPattern: '{YY}TR-CFG-{MM}-{SEQ}' });
    await createUser(t.prisma, 'root', { isAdmin: true });
    const l = await createUser(t.prisma, 'lena');
    const te = await createUser(t.prisma, 'tom');
    viewerId = (await createUser(t.prisma, 'vic')).id;
    await createUser(t.prisma, 'outsider');
    const p = await createProject(t.prisma, 'ACS', [
      { userId: l.id, role: 'lead' },
      { userId: te.id, role: 'tester' },
    ]);
    projectId = p.id;
    root = await login(t, 'root');
    lead = await login(t, 'lena');
    tester = await login(t, 'tom');
  });
  afterAll(() => t.close());

  it('lets admins create projects with the configured document pattern', async () => {
    const res = await root.post('/projects', { key: 'iot', name: 'IoT adapter' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      key: 'IOT',
      myRole: 'lead',
      docNoPattern: '{YY}TR-CFG-{MM}-{SEQ}',
    });
    const dup = await root.post('/projects', { key: 'IOT', name: 'again' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('PROJECT_KEY_TAKEN');
    expect((await lead.post('/projects', { key: 'NOPE', name: 'x' })).status).toBe(403);
  });

  it('lists only memberships for non-admins and hides other projects', async () => {
    const mine = await tester.get('/projects');
    expect(mine.body.map((p: { key: string }) => p.key)).toEqual(['ACS']);
    const outsider = await login(t, 'outsider');
    const hidden = await outsider.get(`/projects/${projectId}`);
    expect(hidden.status).toBe(404);
    expect(hidden.body.error.code).toBe('PROJECT_NOT_FOUND');
    expect((await tester.get('/projects/abc')).status).toBe(404);
  });

  it('enforces roles on project settings', async () => {
    const denied = await tester.patch(`/projects/${projectId}`, { name: 'x' });
    expect(denied.status).toBe(403);
    const ok = await lead.patch(`/projects/${projectId}`, { requireCaseReview: true });
    expect(ok.status).toBe(200);
    expect(ok.body.requireCaseReview).toBe(true);
    expect(ok.body.name).toBe('ACS project');
  });

  it('replaces members and keeps at least one lead', async () => {
    const lena = await t.prisma.db.user.findUniqueOrThrow({ where: { username: 'lena' } });
    const noLead = await lead.put(`/projects/${projectId}/members`, {
      members: [{ userId: viewerId, role: 'viewer' }],
    });
    expect(noLead.body.error.code).toBe('LEAD_REQUIRED');
    const res = await lead.put(`/projects/${projectId}/members`, {
      members: [
        { userId: viewerId, role: 'viewer' },
        { userId: lena.id, role: 'lead' },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.map((m: { role: string }) => m.role)).toEqual(['lead', 'viewer']);
  });

  it('manages releases without resetting unspecified fields', async () => {
    const created = await lead.post(`/projects/${projectId}/releases`, {
      name: 'R1',
      startDate: '2026-10-01',
      status: 'active',
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'R1', startDate: '2026-10-01', status: 'active' });
    const renamed = await lead.patch(`/projects/${projectId}/releases/${created.body.id}`, {
      name: 'R1.1',
    });
    expect(renamed.body).toMatchObject({ name: 'R1.1', status: 'active', startDate: '2026-10-01' });
    const list = await lead.get(`/projects/${projectId}/releases`);
    expect(list.body).toHaveLength(1);
    expect((await lead.delete(`/projects/${projectId}/releases/${created.body.id}`)).status).toBe(
      204,
    );
    const missing = await lead.delete(`/projects/${projectId}/releases/${created.body.id}`);
    expect(missing.body.error.code).toBe('RELEASE_NOT_FOUND');
  });
});

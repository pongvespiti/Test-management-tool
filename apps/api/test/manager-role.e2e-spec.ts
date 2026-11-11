import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import {
  createProject,
  createTestApp,
  createUser,
  login,
  type Client,
  type TestApp,
} from './helpers.js';

let t: TestApp;
let manager: Client;
let P: string;

beforeAll(async () => {
  t = await createTestApp();
  const m = await createUser(t.prisma, 'mgr');
  const project = await createProject(t.prisma, 'MGR', [{ userId: m.id, role: 'manager' }]);
  P = `/projects/${project.id}`;
  manager = await login(t, 'mgr');
});

afterAll(async () => {
  await t.close();
});

describe('manager role', () => {
  it('reads what a viewer reads', async () => {
    expect((await manager.get(`${P}/dashboard`)).status).toBe(200);
    expect((await manager.get(`${P}/my-work`)).status).toBe(200);
  });

  it('does not write: no plans, no results', async () => {
    const res = await manager.post(`${P}/plans`, { docNo: 'X-1', title: 'x' });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: { code: 'FORBIDDEN' } });
  });
});

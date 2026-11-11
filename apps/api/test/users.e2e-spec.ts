import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import {
  anon,
  API,
  createTestApp,
  createUser,
  login,
  type Client,
  type TestApp,
} from './helpers.js';

describe('users', () => {
  let t: TestApp;
  let root: Client;

  beforeAll(async () => {
    t = await createTestApp();
    await createUser(t.prisma, 'root', { isAdmin: true });
    await createUser(t.prisma, 'alice');
    root = await login(t, 'root');
  });
  afterAll(() => t.close());

  it('creates users (lower-case username, must change password) and rejects duplicates', async () => {
    const res = await root.post('/users', {
      username: 'Natthakan',
      displayName: 'Natthakan K.',
      password: 'Initial#2026',
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ username: 'natthakan', mustChangePassword: true });
    const dup = await root.post('/users', {
      username: 'NATTHAKAN',
      displayName: 'x',
      password: 'Initial#2026',
    });
    expect(dup.body.error.code).toBe('USERNAME_TAKEN');
  });

  it('is admin-only except the lookup', async () => {
    const alice = await login(t, 'alice');
    expect((await alice.get('/users')).status).toBe(403);
    const lookup = await alice.get('/users/lookup?q=nat');
    expect(lookup.status).toBe(200);
    expect(lookup.body.map((u: { username: string }) => u.username)).toEqual(['natthakan']);
  });

  it('cannot disable itself; disabling revokes sessions', async () => {
    const rootUser = await t.prisma.db.user.findUniqueOrThrow({ where: { username: 'root' } });
    const self = await root.patch(`/users/${rootUser.id}`, { isActive: false });
    expect(self.body.error.code).toBe('CANNOT_MODIFY_SELF');
    const alice = await login(t, 'alice');
    const aliceUser = await t.prisma.db.user.findUniqueOrThrow({ where: { username: 'alice' } });
    expect((await root.patch(`/users/${aliceUser.id}`, { isActive: false })).status).toBe(200);
    expect((await alice.get('/auth/me')).status).toBe(401);
  });

  it('serves the health check without authentication', async () => {
    const res = await anon(t).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', db: 'ok' });
  });

  it('serves the OpenAPI document to signed-in users with roles and error codes', async () => {
    expect((await anon(t).get(`${API}/openapi.json`)).status).toBe(401);
    const doc = await root.get('/openapi.json');
    expect(doc.status).toBe(200);
    const patch = doc.body.paths['/api/v1/projects/{projectId}'].patch;
    expect(patch['x-min-role']).toBe('lead');
    const login = doc.body.paths['/api/v1/auth/login'].post;
    expect(login['x-error-codes']).toContain('INVALID_CREDENTIALS');
    expect(login.requestBody.content['application/json'].schema.properties).toHaveProperty(
      'username',
    );
  });
});

import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { API, anon, createTestApp, createUser, login, type TestApp } from './helpers.js';

describe('API tokens', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
    await createUser(t.prisma, 'alice');
    await createUser(t.prisma, 'root', { isAdmin: true });
  });
  afterAll(() => t.close());

  it('creates a token once, authenticates with Bearer and skips the CSRF check', async () => {
    const alice = await login(t, 'alice');
    const created = await alice.post('/auth/tokens', { name: 'CI', expiresInDays: 30 });
    expect(created.status).toBe(201);
    expect(created.body.token).toMatch(/^tmt_[\w-]{40}$/);
    expect(created.body.prefix).toBe(created.body.token.slice(0, 8));
    const token = created.body.token as string;

    const me = await anon(t).get(`${API}/auth/me`).set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.user.username).toBe('alice');

    // No CSRF header needed with a Bearer token.
    const tokenOnly = await anon(t)
      .post(`${API}/auth/tokens`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'nested' });
    expect(tokenOnly.status).toBe(403);
    expect(tokenOnly.body.error.code).toBe('TOKEN_NOT_ALLOWED');

    const list = await alice.get('/auth/tokens');
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).not.toHaveProperty('token');

    expect((await alice.delete(`/auth/tokens/${created.body.id}`)).status).toBe(204);
    const revoked = await anon(t).get(`${API}/auth/me`).set('Authorization', `Bearer ${token}`);
    expect(revoked.status).toBe(401);
    expect(revoked.body.error.code).toBe('INVALID_TOKEN');
  });

  it('rejects malformed and unknown tokens', async () => {
    const bad = await anon(t).get(`${API}/auth/me`).set('Authorization', 'Bearer nope');
    expect(bad.body.error.code).toBe('INVALID_TOKEN');
  });

  it('lets an admin revoke all tokens of a user', async () => {
    const alice = await login(t, 'alice');
    const { body } = await alice.post('/auth/tokens', { name: 'one' });
    const root = await login(t, 'root');
    const aliceId = (await t.prisma.db.user.findUniqueOrThrow({ where: { username: 'alice' } })).id;
    expect((await root.delete(`/users/${aliceId}/tokens`)).status).toBe(204);
    const res = await anon(t).get(`${API}/auth/me`).set('Authorization', `Bearer ${body.token}`);
    expect(res.status).toBe(401);
  });
});

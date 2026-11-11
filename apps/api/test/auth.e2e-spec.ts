import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { CSRF_HEADER, CSRF_HEADER_VALUE } from '@tmt/shared';
import { API, PASSWORD, anon, createTestApp, createUser, login, type TestApp } from './helpers.js';

describe('auth', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ loginMaxFailed: 3 });
    await createUser(t.prisma, 'alice');
    await createUser(t.prisma, 'newbie', { mustChangePassword: true });
    await createUser(t.prisma, 'ghost', { isActive: false });
  });
  afterAll(() => t.close());

  it('signs in case-insensitively, sets an httpOnly cookie and returns the profile', async () => {
    const res = await anon(t)
      .post(`${API}/auth/login`)
      .set(CSRF_HEADER, CSRF_HEADER_VALUE)
      .send({ username: 'ALICE', password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe('alice');
    expect(res.body.memberships).toEqual([]);
    expect(String(res.headers['set-cookie'])).toMatch(/tmt_session=.*HttpOnly/i);
  });

  it('rejects wrong passwords and locks after repeated failures', async () => {
    await createUser(t.prisma, 'bob');
    const attempt = () =>
      anon(t)
        .post(`${API}/auth/login`)
        .set(CSRF_HEADER, CSRF_HEADER_VALUE)
        .send({ username: 'bob', password: 'wrong-password' });
    expect((await attempt()).body.error.code).toBe('INVALID_CREDENTIALS');
    await attempt();
    const locked = await attempt();
    expect(locked.status).toBe(423);
    expect(locked.body.error.code).toBe('ACCOUNT_LOCKED');
    const ok = await anon(t)
      .post(`${API}/auth/login`)
      .set(CSRF_HEADER, CSRF_HEADER_VALUE)
      .send({ username: 'bob', password: PASSWORD });
    expect(ok.status).toBe(423);
  });

  it('refuses disabled accounts', async () => {
    const res = await anon(t)
      .post(`${API}/auth/login`)
      .set(CSRF_HEADER, CSRF_HEADER_VALUE)
      .send({ username: 'ghost', password: PASSWORD });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_DISABLED');
  });

  it('validates the body with the shared schema', async () => {
    const res = await anon(t)
      .post(`${API}/auth/login`)
      .set(CSRF_HEADER, CSRF_HEADER_VALUE)
      .send({ username: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.issues.length).toBeGreaterThan(0);
  });

  it('requires the CSRF header on unsafe requests and rejects foreign origins', async () => {
    const noHeader = await anon(t).post(`${API}/auth/login`).send({ username: 'a', password: 'b' });
    expect(noHeader.status).toBe(403);
    expect(noHeader.body.error.code).toBe('CSRF_REJECTED');
    const foreign = await anon(t)
      .post(`${API}/auth/login`)
      .set(CSRF_HEADER, CSRF_HEADER_VALUE)
      .set('Origin', 'https://evil.example')
      .send({ username: 'alice', password: PASSWORD });
    expect(foreign.body.error.code).toBe('CSRF_REJECTED');
    const allowed = await anon(t)
      .post(`${API}/auth/login`)
      .set(CSRF_HEADER, CSRF_HEADER_VALUE)
      .set('Origin', 'http://localhost:3000')
      .send({ username: 'alice', password: PASSWORD });
    expect(allowed.status).toBe(200);
  });

  it('returns 401 without a session and the profile with one', async () => {
    expect((await anon(t).get(`${API}/auth/me`)).status).toBe(401);
    const alice = await login(t, 'alice');
    const me = await alice.get('/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.username).toBe('alice');
  });

  it('forces a password change before anything else', async () => {
    const newbie = await login(t, 'newbie');
    expect((await newbie.get('/auth/me')).status).toBe(200);
    const blocked = await newbie.get('/projects');
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
    const same = await newbie.post('/auth/change-password', {
      currentPassword: PASSWORD,
      newPassword: PASSWORD,
    });
    expect(same.body.error.code).toBe('SAME_PASSWORD');
    const changed = await newbie.post('/auth/change-password', {
      currentPassword: PASSWORD,
      newPassword: 'N3w-password!',
    });
    expect(changed.status).toBe(204);
    expect((await newbie.get('/projects')).status).toBe(200);
  });

  it('signs out', async () => {
    const alice = await login(t, 'alice');
    expect((await alice.post('/auth/logout')).status).toBe(204);
    expect((await alice.get('/auth/me')).status).toBe(401);
  });
});

import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import type {
  BuildDTO,
  ReleaseDTO,
  SessionDTO,
  SessionListItemDTO,
  SessionNoteDTO,
} from '@tmt/shared';
import {
  createDefect,
  createProject,
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
let other: Client;
let viewer: Client;
let outsider: Client;
let P: string;
let release: ReleaseDTO;
let build: BuildDTO;
let projectId: number;
let testerId: number;

beforeAll(async () => {
  t = await createTestApp();
  const l = await createUser(t.prisma, 'lead');
  const te = await createUser(t.prisma, 'tester');
  const o = await createUser(t.prisma, 'other');
  const v = await createUser(t.prisma, 'viewer');
  await createUser(t.prisma, 'outsider');
  testerId = te.id;
  projectId = (
    await createProject(t.prisma, 'EXP', [
      { userId: l.id, role: 'lead' },
      { userId: te.id, role: 'tester' },
      { userId: o.id, role: 'tester' },
      { userId: v.id, role: 'viewer' },
    ])
  ).id;
  P = `/projects/${projectId}`;
  lead = await login(t, 'lead');
  tester = await login(t, 'tester');
  other = await login(t, 'other');
  viewer = await login(t, 'viewer');
  outsider = await login(t, 'outsider');
  release = expectBody<ReleaseDTO>(await lead.post(`${P}/releases`, { name: 'Step 1' }), 201);
  build = expectBody<BuildDTO>(
    await lead.post(`${P}/releases/${release.id}/builds`, { name: 'B1' }),
    201,
  );
});
afterAll(() => t.close());

describe('exploratory sessions', () => {
  let session: SessionDTO;

  it('plans a session owned by its creator, with numbered key and tidy references', async () => {
    session = expectBody<SessionDTO>(
      await tester.post(`${P}/sessions`, {
        title: 'Pairing with unusual routers',
        charter: 'Explore pairing when the router changes channel',
        releaseId: release.id,
        buildId: build.id,
        timeBoxMinutes: 60,
        references: 'req 12, PROJ-7',
        environment: [{ label: 'Platform', value: 'Android' }],
      }),
      201,
    );
    expect(session).toMatchObject({
      key: 'EXP-1',
      status: 'planned',
      owner: { username: 'tester' },
      release: { name: 'Step 1' },
      build: { name: 'B1' },
      timeBoxMinutes: 60,
      references: 'REQ-12, PROJ-7',
      startedAt: null,
      noteCount: 0,
    });
    expect(session.environment).toEqual([{ label: 'Platform', value: 'Android' }]);
    const second = expectBody<SessionDTO>(
      await lead.post(`${P}/sessions`, { title: 'Second', ownerId: null }),
      201,
    );
    expect(second).toMatchObject({ key: 'EXP-2', owner: null });
  });

  it('is open to testers, readable by viewers, closed to non-members', async () => {
    expect((await viewer.post(`${P}/sessions`, { title: 'x' })).status).toBe(403);
    const list = expectBody<SessionListItemDTO[]>(await viewer.get(`${P}/sessions`), 200);
    expect(list.map((s) => s.key)).toEqual(['EXP-2', 'EXP-1']);
    expect(errorCode(await outsider.get(`${P}/sessions`))).toBe('PROJECT_NOT_FOUND');
    const mine = expectBody<SessionListItemDTO[]>(
      await viewer.get(`${P}/sessions?ownerId=${testerId}&status=planned`),
      200,
    );
    expect(mine.map((s) => s.key)).toEqual(['EXP-1']);
  });

  it('checks the release and build and keeps the build with its release', async () => {
    expect(errorCode(await tester.post(`${P}/sessions`, { title: 'x', releaseId: 999999 }))).toBe(
      'BAD_RELEASE',
    );
    const otherRelease = expectBody<ReleaseDTO>(
      await lead.post(`${P}/releases`, { name: 'Step 2' }),
      201,
    );
    expect(
      errorCode(
        await tester.post(`${P}/sessions`, {
          title: 'x',
          releaseId: otherRelease.id,
          buildId: build.id,
        }),
      ),
    ).toBe('BAD_BUILD');
    // Moving the session to another release drops the build of the old one.
    const moved = expectBody<SessionDTO>(
      await tester.patch(`${P}/sessions/${session.id}`, { releaseId: otherRelease.id }),
      200,
    );
    expect(moved.build).toBeNull();
    expectBody(
      await tester.patch(`${P}/sessions/${session.id}`, {
        releaseId: release.id,
        buildId: build.id,
      }),
      200,
    );
    expect((await tester.patch(`${P}/sessions/${session.id}`, { timeBoxMinutes: 2 })).status).toBe(
      400,
    );
  });

  it('follows planned → in progress → completed and can be resumed', async () => {
    expect(errorCode(await tester.post(`${P}/sessions/${session.id}/complete`))).toBe(
      'INVALID_SESSION_STATE',
    );
    const started = expectBody<SessionDTO>(
      await tester.post(`${P}/sessions/${session.id}/start`),
      200,
    );
    expect(started.status).toBe('in_progress');
    expect(started.startedAt).not.toBeNull();
    expect(errorCode(await tester.post(`${P}/sessions/${session.id}/start`))).toBe(
      'INVALID_SESSION_STATE',
    );

    const note = expectBody<SessionNoteDTO>(
      await tester.post(`${P}/sessions/${session.id}/notes`, {
        kind: 'bug',
        body: ' Hangs on channel 13 ',
      }),
      201,
    );
    expect(note).toMatchObject({
      kind: 'bug',
      body: 'Hangs on channel 13',
      author: { username: 'tester' },
    });
    expectBody(await other.post(`${P}/sessions/${session.id}/notes`, { body: 'Second look' }), 201);
    expect((await tester.post(`${P}/sessions/${session.id}/notes`, { body: '  ' })).status).toBe(
      400,
    );

    const done = expectBody<SessionDTO>(
      await tester.post(`${P}/sessions/${session.id}/complete`),
      200,
    );
    expect(done).toMatchObject({ status: 'completed', noteCount: 2 });
    expect(done.endedAt).not.toBeNull();
    expect(
      errorCode(await tester.post(`${P}/sessions/${session.id}/notes`, { body: 'late' })),
    ).toBe('SESSION_COMPLETED');
    const debrief = expectBody<SessionDTO>(
      await tester.patch(`${P}/sessions/${session.id}`, {
        summary: 'Found a hang; routers left to try',
      }),
      200,
    );
    expect(debrief.summary).toBe('Found a hang; routers left to try');

    const resumed = expectBody<SessionDTO>(
      await tester.post(`${P}/sessions/${session.id}/resume`),
      200,
    );
    expect(resumed).toMatchObject({ status: 'in_progress', endedAt: null });
    expect(resumed.startedAt).toBe(started.startedAt);
    expect(resumed.notes.map((n) => n.body)).toEqual(['Hangs on channel 13', 'Second look']);
  });

  it('lets only the author or a lead delete a note', async () => {
    const full = expectBody<SessionDTO>(await viewer.get(`${P}/sessions/${session.id}`), 200);
    const first = full.notes[0]!;
    expect(errorCode(await other.delete(`${P}/sessions/${session.id}/notes/${first.id}`))).toBe(
      'FORBIDDEN',
    );
    expect((await tester.delete(`${P}/sessions/${session.id}/notes/${first.id}`)).status).toBe(204);
    expect(errorCode(await tester.delete(`${P}/sessions/${session.id}/notes/${first.id}`))).toBe(
      'NOTE_NOT_FOUND',
    );
    const second = full.notes[1]!;
    expect((await lead.delete(`${P}/sessions/${session.id}/notes/${second.id}`)).status).toBe(204);
  });

  it('links and unlinks defects of the project (linking twice is harmless)', async () => {
    const d = await createDefect(t, projectId, { title: 'Router hang' });
    const link = () => tester.post(`${P}/sessions/${session.id}/defects`, { defectId: d.id });
    expect(expectBody<SessionDTO>(await link(), 200).defects).toHaveLength(1);
    const again = expectBody<SessionDTO>(await link(), 200);
    expect(again.defects).toEqual([
      expect.objectContaining({
        id: d.id,
        key: expect.stringMatching(/^BUG-\d+$/),
        title: 'Router hang',
      }),
    ]);
    expect(again.defectCount).toBe(1);
    expect(
      errorCode(await tester.post(`${P}/sessions/${session.id}/defects`, { defectId: 999999 })),
    ).toBe('DEFECT_NOT_FOUND');
    const gone = expectBody<SessionDTO>(
      await tester.delete(`${P}/sessions/${session.id}/defects/${d.id}`),
      200,
    );
    expect(gone.defects).toEqual([]);
    expect(errorCode(await tester.delete(`${P}/sessions/${session.id}/defects/${d.id}`))).toBe(
      'LINK_NOT_FOUND',
    );
  });

  it('lets the owner or a lead delete a session, not another tester', async () => {
    expect(errorCode(await other.delete(`${P}/sessions/${session.id}`))).toBe('FORBIDDEN');
    expect((await tester.delete(`${P}/sessions/${session.id}`)).status).toBe(204);
    expect(errorCode(await tester.get(`${P}/sessions/${session.id}`))).toBe('SESSION_NOT_FOUND');
    expect((await lead.delete(`${P}/sessions/2`)).status).toBe(204);
  });
});

import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import type { PlanDTO, ReleaseDTO, RunDTO, ScheduleDTO } from '@tmt/shared';
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
let viewer: Client;
let outsider: Client;
let P: string;
let release: ReleaseDTO;

beforeAll(async () => {
  t = await createTestApp();
  const l = await createUser(t.prisma, 'lead');
  const v = await createUser(t.prisma, 'viewer');
  await createUser(t.prisma, 'outsider');
  const projectId = (
    await createProject(t.prisma, 'SCH', [
      { userId: l.id, role: 'lead' },
      { userId: v.id, role: 'viewer' },
    ])
  ).id;
  P = `/projects/${projectId}`;
  lead = await login(t, 'lead');
  viewer = await login(t, 'viewer');
  outsider = await login(t, 'outsider');

  const unit = await createSuite(t, projectId, {
    name: 'Unit operation',
    prefix: 'UO',
    topic: 'Unit operation test',
  });
  const plain = await createSuite(t, projectId, { name: 'Misc', prefix: 'MS' });
  for (const s of [unit, plain]) {
    const section = await createSection(t, s.id, 'All');
    await createCase(t, s, l.id, { title: 'One', sectionId: section.id });
  }
  release = expectBody<ReleaseDTO>(await lead.post(`${P}/releases`, { name: 'Step 1' }), 201);
  const plan = expectBody<PlanDTO>(
    await lead.post(`${P}/plans`, {
      docNo: 'D-1',
      title: 'Plan one',
      releaseId: release.id,
      startDate: '2026-11-02',
      dueDate: '2026-11-20',
    }),
    201,
  );
  expectBody<RunDTO>(
    await lead.post(`${P}/plans/${plan.id}/runs`, {
      suiteId: unit.id,
      code: 'R1',
      testerId: l.id,
      dueDate: '2026-11-13',
    }),
    201,
  );
  expectBody<RunDTO>(
    await lead.post(`${P}/plans/${plan.id}/runs`, { suiteId: plain.id, code: 'R2' }),
    201,
  );
  // A plan outside the release, without any dates.
  const other = expectBody<PlanDTO>(
    await lead.post(`${P}/plans`, { docNo: 'D-2', title: 'Other' }),
    201,
  );
  expectBody<RunDTO>(
    await lead.post(`${P}/plans/${other.id}/runs`, { suiteId: unit.id, code: 'R3' }),
    201,
  );
});
afterAll(() => t.close());

describe('GET reports/schedule', () => {
  it('gives every run its window, topic, tester and counts', async () => {
    const out = expectBody<ScheduleDTO>(
      await viewer.get(`${P}/reports/schedule?releaseId=${release.id}`),
      200,
    );
    expect(out.release).toMatchObject({ id: release.id, name: 'Step 1' });
    expect(out.items.map((i) => i.code)).toEqual(['R1', 'R2']);
    expect(out.items[0]).toMatchObject({
      planDocNo: 'D-1',
      suite: 'Unit operation',
      topic: 'Unit operation test',
      start: '2026-11-02',
      due: '2026-11-13', // the run's own due date wins over the plan's
      tester: { username: 'lead' },
    });
    expect(out.items[0]!.counts.untested).toBe(1);
    expect(out.items[1]).toMatchObject({ topic: null, due: '2026-11-20', tester: null });
  });

  it('covers the whole project without a release, plans without dates included', async () => {
    const out = expectBody<ScheduleDTO>(await viewer.get(`${P}/reports/schedule`), 200);
    expect(out.release).toBeNull();
    expect(out.items.map((i) => i.code)).toEqual(['R1', 'R2', 'R3']);
    expect(out.items[2]).toMatchObject({ start: null, due: null });
  });

  it('refuses an unknown release and non-members', async () => {
    expect(errorCode(await viewer.get(`${P}/reports/schedule?releaseId=999999`))).toBe(
      'BAD_RELEASE',
    );
    expect(errorCode(await outsider.get(`${P}/reports/schedule`))).toBe('PROJECT_NOT_FOUND');
  });
});

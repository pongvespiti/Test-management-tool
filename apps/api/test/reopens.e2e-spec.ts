import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import type { PlanDTO, ReopenReportDTO, RunCaseDTO, RunDTO } from '@tmt/shared';
import {
  createCase,
  createDefect,
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
const ids: Record<string, number> = {};

async function move(defectId: number, to: string) {
  expectBody(await lead.post(`${P}/defects/${defectId}/transition`, { to }), 200);
}
/** resolved → reopened, `times` times (the defect ends reopened). */
async function reopen(defectId: number, times: number) {
  await move(defectId, 'open');
  await move(defectId, 'resolved');
  for (let i = 0; i < times; i++) {
    await move(defectId, 'reopened');
    if (i < times - 1) await move(defectId, 'resolved');
  }
}

beforeAll(async () => {
  t = await createTestApp();
  const l = await createUser(t.prisma, 'lead');
  const v = await createUser(t.prisma, 'viewer');
  await createUser(t.prisma, 'outsider');
  const projectId = (
    await createProject(t.prisma, 'RPN', [
      { userId: l.id, role: 'lead' },
      { userId: v.id, role: 'viewer' },
    ])
  ).id;
  P = `/projects/${projectId}`;
  lead = await login(t, 'lead');
  viewer = await login(t, 'viewer');
  outsider = await login(t, 'outsider');

  const suite = await createSuite(t, projectId, {
    name: 'Unit operation',
    prefix: 'UO',
    topic: 'Unit operation test',
  });
  const section = await createSection(t, suite.id, 'All');
  await createCase(t, suite, l.id, { title: 'Power on', sectionId: section.id });
  const plan = expectBody<PlanDTO>(
    await lead.post(`${P}/plans`, { docNo: 'D-1', title: 'T' }),
    201,
  );
  const run = expectBody<RunDTO>(
    await lead.post(`${P}/plans/${plan.id}/runs`, {
      suiteId: suite.id,
      code: 'R1',
      environment: [{ label: 'Platform', value: 'Android' }],
    }),
    201,
  );
  const [runCase] = expectBody<RunCaseDTO[]>(await lead.get(`${P}/runs/${run.id}/cases`), 200);

  const linked = await createDefect(t, projectId, { title: 'Linked', runCaseId: runCase!.id });
  const once = await createDefect(t, projectId, { title: 'Once' });
  const never = await createDefect(t, projectId, { title: 'Never' });
  ids.linked = linked.id;
  ids.once = once.id;
  ids.never = never.id;
  await reopen(linked.id, 3);
  await reopen(once.id, 1);
  await move(never.id, 'open');
});
afterAll(() => t.close());

describe('GET reports/reopens', () => {
  it('counts reopens from the activity log and lists the defects that keep coming back', async () => {
    const r = expectBody<ReopenReportDTO>(await viewer.get(`${P}/reports/reopens`), 200);
    expect(r.totals).toEqual({ defects: 3, reopenedDefects: 2, reopens: 4, repeatedDefects: 1 });
    expect(r.repeated).toHaveLength(1);
    expect(r.repeated[0]).toMatchObject({
      id: ids.linked,
      reopens: 3,
      status: 'reopened',
      platform: 'Android',
      topic: 'Unit operation test',
    });
  });

  it('groups by platform and topic of the linked run, the rest under the empty value', async () => {
    const r = expectBody<ReopenReportDTO>(await viewer.get(`${P}/reports/reopens`), 200);
    expect(r.byPlatform).toEqual([
      { value: 'Android', defects: 1, reopenedDefects: 1, reopens: 3 },
      { value: '', defects: 2, reopenedDefects: 1, reopens: 1 },
    ]);
    expect(r.byTopic.map((g) => g.value)).toEqual(['Unit operation test', '']);
  });

  it('refuses an unknown release and non-members', async () => {
    expect(errorCode(await viewer.get(`${P}/reports/reopens?releaseId=999999`))).toBe(
      'BAD_RELEASE',
    );
    expect(errorCode(await outsider.get(`${P}/reports/reopens`))).toBe('PROJECT_NOT_FOUND');
  });
});

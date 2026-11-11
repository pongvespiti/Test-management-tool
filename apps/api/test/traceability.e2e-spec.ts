import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import type { PlanDTO, RunCaseDTO, RunDTO, TraceabilityDTO } from '@tmt/shared';
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

beforeAll(async () => {
  t = await createTestApp();
  const l = await createUser(t.prisma, 'lead');
  const v = await createUser(t.prisma, 'viewer');
  await createUser(t.prisma, 'outsider');
  const projectId = (
    await createProject(t.prisma, 'TRC', [
      { userId: l.id, role: 'lead' },
      { userId: v.id, role: 'viewer' },
    ])
  ).id;
  P = `/projects/${projectId}`;
  lead = await login(t, 'lead');
  viewer = await login(t, 'viewer');
  outsider = await login(t, 'outsider');

  const suite = await createSuite(t, projectId, { name: 'Unit operation', prefix: 'UO' });
  const section = await createSection(t, suite.id, 'All');
  const make = (title: string, references?: string) =>
    createCase(t, suite, l.id, { title, sectionId: section.id, references });
  const a = await make('Power on', 'req 1, PROJ-7');
  await make('Power off', 'REQ_1');
  await make('Timer', 'SPEC-4.2');
  await make('No reference');

  const plan = expectBody<PlanDTO>(
    await lead.post(`${P}/plans`, { docNo: 'D-1', title: 'T' }),
    201,
  );
  const run = expectBody<RunDTO>(
    await lead.post(`${P}/plans/${plan.id}/runs`, { suiteId: suite.id, code: 'R1' }),
    201,
  );
  const runCases = expectBody<RunCaseDTO[]>(await lead.get(`${P}/runs/${run.id}/cases`), 200);
  const first = runCases.find((r) => r.testCaseId === a.id)!;
  expectBody(
    await lead.post(`${P}/runs/${run.id}/results/bulk`, { runCaseIds: [first.id], status: 'ng' }),
    200,
  );
  await createDefect(t, projectId, { title: 'Does not start', runCaseId: first.id });
});
afterAll(() => t.close());

describe('GET reports/traceability', () => {
  it('groups cases by canonical reference with latest results and defects', async () => {
    const out = expectBody<TraceabilityDTO>(await viewer.get(`${P}/reports/traceability`), 200);
    expect(out.rows.map((r) => r.reference)).toEqual(['PROJ-7', 'REQ-1', 'SPEC-4.2']);
    expect(out.totalCases).toBe(4);
    expect(out.casesWithoutReference).toBe(1);

    const req1 = out.rows.find((r) => r.reference === 'REQ-1')!;
    expect(req1.cases.map((c) => c.title)).toEqual(['Power on', 'Power off']);
    expect(req1.counts).toEqual({ total: 2, passed: 0, failed: 1, notExecuted: 1, neverRun: 0 });
    expect(req1.defects).toHaveLength(1);
    expect(req1.openDefects).toBe(1);
    expect(req1.defects[0]!.key).toMatch(/^BUG-\d+$/);

    const spec = out.rows.find((r) => r.reference === 'SPEC-4.2')!;
    expect(spec.counts).toMatchObject({ total: 1, notExecuted: 1, neverRun: 0 });
    expect(spec.defects).toEqual([]);
  });

  it('scopes to a release and refuses unknown ones', async () => {
    expect(errorCode(await viewer.get(`${P}/reports/traceability?releaseId=999999`))).toBe(
      'BAD_RELEASE',
    );
  });

  it('is closed to non-members', async () => {
    expect(errorCode(await outsider.get(`${P}/reports/traceability`))).toBe('PROJECT_NOT_FOUND');
  });
});

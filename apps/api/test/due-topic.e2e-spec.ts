import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import type { PlanDTO, RunDTO, SuiteDTO } from '@tmt/shared';
import type { Suite } from '@tmt/database';
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
let P: string;
let suite: Suite;
let plan: PlanDTO;

beforeAll(async () => {
  t = await createTestApp();
  const l = await createUser(t.prisma, 'lead');
  const projectId = (await createProject(t.prisma, 'DUE', [{ userId: l.id, role: 'lead' }])).id;
  P = `/projects/${projectId}`;
  lead = await login(t, 'lead');
  suite = await createSuite(t, projectId, { name: 'Adapter operation test', prefix: 'AO' });
  const section = await createSection(t, suite.id, 'All');
  await createCase(t, suite, l.id, { title: 'Pair', sectionId: section.id });
  plan = expectBody<PlanDTO>(await lead.post(`${P}/plans`, { docNo: 'D-1', title: 'Due' }), 201);
});
afterAll(() => t.close());

describe('run due date and suite topic', () => {
  it('sets, changes and clears the due date of a run', async () => {
    const run = expectBody<RunDTO>(
      await lead.post(`${P}/plans/${plan.id}/runs`, {
        suiteId: suite.id,
        code: 'R1',
        dueDate: '2026-11-20',
      }),
      201,
    );
    expect(run.dueDate).toBe('2026-11-20');
    const moved = expectBody<RunDTO>(
      await lead.patch(`${P}/runs/${run.id}`, { dueDate: '2026-11-25' }),
      200,
    );
    expect(moved.dueDate).toBe('2026-11-25');
    const cleared = expectBody<RunDTO>(
      await lead.patch(`${P}/runs/${run.id}`, { dueDate: '' }),
      200,
    );
    expect(cleared.dueDate).toBeNull();
    expect((await lead.patch(`${P}/runs/${run.id}`, { dueDate: '20-11-2026' })).status).toBe(400);
  });

  it('keeps the topic of a suite', async () => {
    const created = expectBody<SuiteDTO>(
      await lead.post(`${P}/suites`, {
        name: 'Adapter Model A',
        prefix: 'AF35',
        topic: 'Adapter operation test',
      }),
      201,
    );
    expect(created.topic).toBe('Adapter operation test');
    const cleared = expectBody<SuiteDTO>(
      await lead.patch(`${P}/suites/${created.id}`, { topic: '' }),
      200,
    );
    expect(cleared.topic).toBeNull();
    const plain = expectBody<SuiteDTO>(
      await lead.post(`${P}/suites`, { name: 'Plain', prefix: 'PL' }),
      201,
    );
    expect(plain.topic).toBeNull();
  });
});

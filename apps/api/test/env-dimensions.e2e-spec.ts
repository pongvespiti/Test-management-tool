import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import type { EnvDimensionsDTO, NormalizeRunsResultDTO, PlanDTO, RunDTO } from '@tmt/shared';
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
let tester: Client;
let viewer: Client;
let P: string;
let plan: PlanDTO;
let suiteId: number;

const LISTS = {
  dimensions: [
    {
      label: 'Platform',
      parent: null,
      values: [
        { value: 'Android', parent: null },
        { value: 'iOS', parent: null },
      ],
    },
    { label: 'OS ver', parent: 'Platform', values: [{ value: '15', parent: 'Android' }] },
  ],
};

beforeAll(async () => {
  t = await createTestApp();
  const l = await createUser(t.prisma, 'lead');
  const te = await createUser(t.prisma, 'tester');
  const v = await createUser(t.prisma, 'viewer');
  const projectId = (
    await createProject(t.prisma, 'ENV', [
      { userId: l.id, role: 'lead' },
      { userId: te.id, role: 'tester' },
      { userId: v.id, role: 'viewer' },
    ])
  ).id;
  P = `/projects/${projectId}`;
  lead = await login(t, 'lead');
  tester = await login(t, 'tester');
  viewer = await login(t, 'viewer');
  const suite = await createSuite(t, projectId, { name: 'Adapter', prefix: 'AD' });
  suiteId = suite.id;
  const section = await createSection(t, suite.id, 'All');
  await createCase(t, suite, l.id, { title: 'Pair', sectionId: section.id });
  plan = expectBody<PlanDTO>(await lead.post(`${P}/plans`, { docNo: 'D-1', title: 'T' }), 201);
});
afterAll(() => t.close());

const run = (code: string, environment: { label: string; value: string }[]) =>
  lead.post(`${P}/plans/${plan.id}/runs`, { suiteId, code, environment });

describe('environment lists', () => {
  it('starts empty and is read-only for non-leads', async () => {
    expect(expectBody<EnvDimensionsDTO>(await viewer.get(`${P}/env-dimensions`), 200)).toEqual({
      dimensions: [],
    });
    expect((await tester.put(`${P}/env-dimensions`, LISTS)).status).toBe(403);
    expect((await viewer.post(`${P}/env-dimensions/normalize-runs`)).status).toBe(403);
  });

  it('validates the lists', async () => {
    const bad = await lead.put(`${P}/env-dimensions`, {
      dimensions: [{ label: 'OS ver', parent: 'Missing', values: [] }],
    });
    expect(bad.status).toBe(400);
  });

  it('saves the lists', async () => {
    expectBody<EnvDimensionsDTO>(await lead.put(`${P}/env-dimensions`, LISTS), 200);
    const got = expectBody<EnvDimensionsDTO>(await viewer.get(`${P}/env-dimensions`), 200);
    expect(got.dimensions.map((d) => d.label)).toEqual(['Platform', 'OS ver']);
  });

  it('respells a new run to the lists and adds new values under their parent', async () => {
    const created = expectBody<RunDTO>(
      await run('R1', [
        { label: 'platform', value: ' ios ' },
        { label: 'OS ver', value: '18' },
        { label: 'SSID', value: ' Home ' },
      ]),
      201,
    );
    expect(created.environment).toEqual([
      { label: 'Platform', value: 'iOS' },
      { label: 'OS ver', value: '18' },
      { label: 'SSID', value: ' Home ' },
    ]);
    const got = expectBody<EnvDimensionsDTO>(await viewer.get(`${P}/env-dimensions`), 200);
    expect(got.dimensions[1]!.values).toContainEqual({ value: '18', parent: 'iOS' });
  });

  it('respells on update and on duplicate', async () => {
    const r = expectBody<RunDTO>(await run('R2', [{ label: 'Platform', value: 'android' }]), 201);
    const updated = expectBody<RunDTO>(
      await lead.patch(`${P}/runs/${r.id}`, {
        environment: [
          { label: 'PLATFORM', value: 'ANDROID' },
          { label: 'OS ver', value: '15' },
        ],
      }),
      200,
    );
    expect(updated.environment).toEqual([
      { label: 'Platform', value: 'Android' },
      { label: 'OS ver', value: '15' },
    ]);
    const copy = expectBody<RunDTO>(
      await lead.post(`${P}/runs/${r.id}/duplicate`, { code: 'R2-copy' }),
      201,
    );
    expect(copy.environment[0]).toEqual({ label: 'Platform', value: 'Android' });
  });

  it('tidies the environments of existing runs', async () => {
    // Runs written before the lists existed: spelled differently.
    const r = expectBody<RunDTO>(await run('R3', []), 201);
    await t.prisma.db.testRun.update({
      where: { id: r.id },
      data: {
        environment: [
          { label: 'platform', value: 'ANDROID' },
          { label: 'os ver', value: '16' },
        ],
      },
    });
    const out = expectBody<NormalizeRunsResultDTO>(
      await lead.post(`${P}/env-dimensions/normalize-runs`),
      200,
    );
    expect(out.updatedRuns).toBe(1);
    expect(out.addedValues).toBe(1);
    const after = expectBody<RunDTO>(await lead.get(`${P}/runs/${r.id}`), 200);
    expect(after.environment).toEqual([
      { label: 'Platform', value: 'Android' },
      { label: 'OS ver', value: '16' },
    ]);
    expect(errorCode(await viewer.get(`/projects/999999/env-dimensions`))).toBe(
      'PROJECT_NOT_FOUND',
    );
  });
});

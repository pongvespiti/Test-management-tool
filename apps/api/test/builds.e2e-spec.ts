import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import type { BuildDTO, DashboardDTO, DefectDTO, ReleaseDTO, RunDTO } from '@tmt/shared';
import type { Suite } from '@tmt/database';
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
let suite: Suite;
let step1: ReleaseDTO;
let step2: ReleaseDTO;

beforeAll(async () => {
  t = await createTestApp();
  const l = await createUser(t.prisma, 'lead');
  const te = await createUser(t.prisma, 'tester');
  const v = await createUser(t.prisma, 'viewer');
  const projectId = (
    await createProject(t.prisma, 'BLD', [
      { userId: l.id, role: 'lead' },
      { userId: te.id, role: 'tester' },
      { userId: v.id, role: 'viewer' },
    ])
  ).id;
  P = `/projects/${projectId}`;
  lead = await login(t, 'lead');
  tester = await login(t, 'tester');
  viewer = await login(t, 'viewer');
  suite = await createSuite(t, projectId, { name: 'System', prefix: 'SY' });
  const section = await createSection(t, suite.id, 'All');
  await createCase(t, suite, l.id, { title: 'Power on', sectionId: section.id });
  await createCase(t, suite, l.id, { title: 'Power off', sectionId: section.id });
  step1 = expectBody<ReleaseDTO>(await lead.post(`${P}/releases`, { name: 'Step 1.1.7' }), 201);
  step2 = expectBody<ReleaseDTO>(await lead.post(`${P}/releases`, { name: 'Step 1.1.8' }), 201);
});
afterAll(() => t.close());

const newBuild = async (releaseId: number, name: string, extra: Record<string, unknown> = {}) =>
  expectBody<BuildDTO>(
    await tester.post(`${P}/releases/${releaseId}/builds`, { name, ...extra }),
    201,
  );

describe('builds', () => {
  let b1: BuildDTO;
  let b2: BuildDTO;
  let other: BuildDTO;

  it('lets testers create builds under a release; viewers only read', async () => {
    b1 = await newBuild(step1.id, '1.1.7(1.0.0)', { builtDate: '2026-11-01', notes: 'first' });
    expect(b1).toMatchObject({
      releaseId: step1.id,
      name: '1.1.7(1.0.0)',
      builtDate: '2026-11-01',
      notes: 'first',
      runCount: 0,
      defectCount: 0,
    });
    b2 = await newBuild(step1.id, '1.1.7(2.0.0)', { builtDate: '2026-11-08' });
    other = await newBuild(step2.id, '1.1.8(1.0.0)');
    expect((await viewer.post(`${P}/releases/${step1.id}/builds`, { name: 'x' })).status).toBe(403);
    expect((await viewer.patch(`${P}/builds/${b1.id}`, { name: 'x' })).status).toBe(403);
    expect((await viewer.delete(`${P}/builds/${b1.id}`)).status).toBe(403);
    expect((await viewer.get(`${P}/builds`)).status).toBe(200);
  });

  it('rejects a duplicate name inside a release but allows it in another', async () => {
    const dup = await tester.post(`${P}/releases/${step1.id}/builds`, { name: '1.1.7(1.0.0)' });
    expect(dup.status).toBe(409);
    expect(errorCode(dup)).toBe('BUILD_NAME_TAKEN');
    await newBuild(step2.id, '1.1.7(1.0.0)');
    const clash = await tester.patch(`${P}/builds/${b2.id}`, { name: '1.1.7(1.0.0)' });
    expect(errorCode(clash)).toBe('BUILD_NAME_TAKEN');
  });

  it('lists newest first, optionally of one release', async () => {
    const all = expectBody<BuildDTO[]>(await viewer.get(`${P}/builds`), 200);
    expect(all).toHaveLength(4);
    const mine = expectBody<BuildDTO[]>(await viewer.get(`${P}/builds?releaseId=${step1.id}`), 200);
    expect(mine.map((b) => b.name)).toEqual(['1.1.7(2.0.0)', '1.1.7(1.0.0)']);
    expect(errorCode(await viewer.get(`${P}/builds?releaseId=999999`))).toBe('RELEASE_NOT_FOUND');
  });

  it('patches only the given fields; null clears', async () => {
    const res = expectBody<BuildDTO>(
      await tester.patch(`${P}/builds/${b1.id}`, { notes: null, builtDate: null }),
      200,
    );
    expect(res).toMatchObject({ name: '1.1.7(1.0.0)', notes: null, builtDate: null });
    expect(errorCode(await tester.patch(`${P}/builds/999999`, { name: 'x' }))).toBe(
      'BUILD_NOT_FOUND',
    );
  });

  describe('on runs', () => {
    let plan1: { id: number };
    let run: RunDTO;

    it('selects a build of the plan release when creating a run', async () => {
      plan1 = expectBody(
        await tester.post(`${P}/plans`, { docNo: 'B-1', title: 'Step 1.1.7', releaseId: step1.id }),
        201,
      );
      run = expectBody<RunDTO>(
        await tester.post(`${P}/plans/${plan1.id}/runs`, {
          suiteId: suite.id,
          code: 'R1',
          buildId: b1.id,
        }),
        201,
      );
      expect(run.build).toEqual({ id: b1.id, name: '1.1.7(1.0.0)' });
      const plain = expectBody<RunDTO>(
        await tester.post(`${P}/plans/${plan1.id}/runs`, { suiteId: suite.id, code: 'R0' }),
        201,
      );
      expect(plain.build).toBeNull();
    });

    it('refuses a build of another release (BAD_BUILD)', async () => {
      const res = await tester.post(`${P}/plans/${plan1.id}/runs`, {
        suiteId: suite.id,
        code: 'R9',
        buildId: other.id,
      });
      expect(res.status).toBe(422);
      expect(errorCode(res)).toBe('BAD_BUILD');
      expect(errorCode(await tester.patch(`${P}/runs/${run.id}`, { buildId: other.id }))).toBe(
        'BAD_BUILD',
      );
      expect(errorCode(await tester.patch(`${P}/runs/${run.id}`, { buildId: 999999 }))).toBe(
        'BAD_BUILD',
      );
    });

    it('changes and clears the build; duplicate and re-run keep it unless told otherwise', async () => {
      const changed = expectBody<RunDTO>(
        await tester.patch(`${P}/runs/${run.id}`, { buildId: b2.id }),
        200,
      );
      expect(changed.build?.id).toBe(b2.id);
      const copy = expectBody<RunDTO>(
        await tester.post(`${P}/runs/${run.id}/duplicate`, { code: 'R1-copy' }),
        201,
      );
      expect(copy.build?.id).toBe(b2.id);
      const moved = expectBody<RunDTO>(
        await tester.post(`${P}/runs/${run.id}/duplicate`, { code: 'R1-b1', buildId: b1.id }),
        201,
      );
      expect(moved.build?.id).toBe(b1.id);
      const cleared = expectBody<RunDTO>(
        await tester.post(`${P}/runs/${run.id}/duplicate`, { code: 'R1-none', buildId: null }),
        201,
      );
      expect(cleared.build).toBeNull();

      const cases = expectBody<{ id: number }[]>(
        await tester.get(`${P}/runs/${run.id}/cases`),
        200,
      );
      await tester.post(`${P}/runs/${run.id}/results/bulk`, {
        runCaseIds: [cases[0]!.id],
        status: 'ng',
      });
      const rerun = expectBody<RunDTO>(
        await tester.post(`${P}/runs/${run.id}/rerun`, { code: 'R1-re' }),
        201,
      );
      expect(rerun.build?.id).toBe(b2.id);
      const rerunNew = expectBody<RunDTO>(
        await tester.post(`${P}/runs/${run.id}/rerun`, { code: 'R1-re2', buildId: b1.id }),
        201,
      );
      expect(rerunNew.build?.id).toBe(b1.id);
    });

    it('does not move a plan to another release while its runs use builds of the old one', async () => {
      const res = await tester.patch(`${P}/plans/${plan1.id}`, { releaseId: step2.id });
      expect(res.status).toBe(409);
      expect(errorCode(res)).toBe('PLAN_RUNS_HAVE_BUILDS');
    });

    it('counts the runs of a build and refuses deleting a build in use', async () => {
      const list = expectBody<BuildDTO[]>(
        await viewer.get(`${P}/builds?releaseId=${step1.id}`),
        200,
      );
      expect(list.find((b) => b.id === b1.id)?.runCount).toBe(2);
      const res = await tester.delete(`${P}/builds/${b1.id}`);
      expect(res.status).toBe(409);
      expect(errorCode(res)).toBe('BUILD_IN_USE');
    });

    it('summarises results and open defects per build on the dashboard', async () => {
      const cases = expectBody<{ id: number }[]>(
        await tester.get(`${P}/runs/${run.id}/cases`),
        200,
      );
      await tester.post(`${P}/runs/${run.id}/results/bulk`, {
        runCaseIds: cases.map((c) => c.id),
        status: 'ok',
      });
      const dash = expectBody<DashboardDTO>(
        await viewer.get(`${P}/dashboard?releaseId=${step1.id}`),
        200,
      );
      const row2 = dash.builds.find((b) => b.build.id === b2.id)!;
      expect(row2.runCount).toBe(3);
      expect(row2.counts.ok).toBe(2);
      expect(dash.builds.map((b) => b.build.name)).toEqual(['1.1.7(2.0.0)', '1.1.7(1.0.0)']);
      const other2 = expectBody<DashboardDTO>(
        await viewer.get(`${P}/dashboard?releaseId=${step2.id}`),
        200,
      );
      expect(other2.builds.every((b) => b.runCount === 0)).toBe(true);
    });
  });

  describe('on defects', () => {
    let defect: DefectDTO;

    it('reports a defect found in a build and fixed in another', async () => {
      defect = expectBody<DefectDTO>(
        await tester.post(`${P}/defects`, {
          title: 'Wrong temperature',
          releaseId: step1.id,
          foundInBuildId: b1.id,
        }),
        201,
      );
      expect(defect.foundInBuild).toEqual({ id: b1.id, name: '1.1.7(1.0.0)' });
      expect(defect.fixedInBuild).toBeNull();
      const fixed = expectBody<DefectDTO>(
        await tester.patch(`${P}/defects/${defect.id}`, { fixedInBuildId: b2.id }),
        200,
      );
      expect(fixed.fixedInBuild?.name).toBe('1.1.7(2.0.0)');
      expect(fixed.foundInBuild?.id).toBe(b1.id);
    });

    it('rejects builds that are not in the project', async () => {
      expect(
        errorCode(await tester.post(`${P}/defects`, { title: 'x', foundInBuildId: 999999 })),
      ).toBe('BAD_BUILD');
    });

    it('filters by build (found in or fixed in) and counts the build as used', async () => {
      const found = expectBody<{ items: { id: number }[] }>(
        await viewer.get(`${P}/defects?buildId=${b1.id}`),
        200,
      );
      expect(found.items.map((d) => d.id)).toEqual([defect.id]);
      const fixedIn = expectBody<{ items: { id: number }[] }>(
        await viewer.get(`${P}/defects?buildId=${b2.id}`),
        200,
      );
      expect(fixedIn.items.map((d) => d.id)).toEqual([defect.id]);
      const none = expectBody<{ items: unknown[] }>(
        await viewer.get(`${P}/defects?buildId=${other.id}`),
        200,
      );
      expect(none.items).toHaveLength(0);
      const dash = expectBody<DashboardDTO>(
        await viewer.get(`${P}/dashboard?releaseId=${step1.id}`),
        200,
      );
      expect(dash.builds.find((b) => b.build.id === b1.id)?.openDefects).toBe(1);
    });

    it('prefills the found-in build from the run a defect is reported from', async () => {
      const plan = expectBody<{ id: number }>(
        await tester.post(`${P}/plans`, { docNo: 'B-2', title: 'p', releaseId: step2.id }),
        201,
      );
      const run = expectBody<RunDTO>(
        await tester.post(`${P}/plans/${plan.id}/runs`, {
          suiteId: suite.id,
          code: 'X1',
          buildId: other.id,
        }),
        201,
      );
      const [rc] = expectBody<{ id: number }[]>(await tester.get(`${P}/runs/${run.id}/cases`), 200);
      const d = expectBody<DefectDTO>(
        await tester.post(`${P}/defects`, { title: 'From run', runCaseId: rc!.id }),
        201,
      );
      expect(d.foundInBuild?.id).toBe(other.id);
    });
  });

  it('deletes an unused build; deleting a release removes its builds', async () => {
    const spare = await newBuild(step2.id, 'spare');
    expect((await tester.delete(`${P}/builds/${spare.id}`)).status).toBe(204);
    expect((await tester.delete(`${P}/builds/${spare.id}`)).status).toBe(404);
    const empty = expectBody<ReleaseDTO>(await lead.post(`${P}/releases`, { name: 'Empty' }), 201);
    await newBuild(empty.id, 'gone-with-release');
    expect((await lead.delete(`${P}/releases/${empty.id}`)).status).toBe(204);
    const all = expectBody<BuildDTO[]>(await viewer.get(`${P}/builds`), 200);
    expect(all.some((b) => b.name === 'gone-with-release')).toBe(false);
  });
});

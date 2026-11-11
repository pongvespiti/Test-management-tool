/**
 * Dashboard and report templates (port of the v1 server's dashboard-templates tests; the demo
 * seed is covered where the seed is ported).
 */
import fs from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import type { ProjectRole } from '@tmt/shared';
import { defaultTemplatePath, ExcelJS } from '@tmt/excel';
import type {
  DashboardDTO,
  PlanDTO,
  ReleaseDTO,
  RunCaseDTO,
  RunDTO,
  TemplateDTO,
} from '@tmt/shared';
import { TemplatesService } from '../src/modules/templates/templates.service.js';
import {
  attachmentPath,
  binary,
  createCase,
  createDefect,
  createProject,
  createSuite,
  createTestApp,
  createUser,
  errorCode,
  expectBody,
  login,
  upload,
  type Client,
  type TestApp,
} from './helpers.js';

let t: TestApp;
let leadId: number;
let lead: Client;
let tester: Client;
let viewer: Client;
/** The same three members for every project in this file. */
let team: { userId: number; role: ProjectRole }[] = [];

beforeAll(async () => {
  t = await createTestApp();
  leadId = (await createUser(t.prisma, 'lead')).id;
  const testerId = (await createUser(t.prisma, 'tester')).id;
  const viewerId = (await createUser(t.prisma, 'viewer')).id;
  lead = await login(t, 'lead');
  tester = await login(t, 'tester');
  viewer = await login(t, 'viewer');
  team = [
    { userId: leadId, role: 'lead' },
    { userId: testerId, role: 'tester' },
    { userId: viewerId, role: 'viewer' },
  ];
});
afterAll(() => t.close());

async function xlsxBuffer(sheets: string[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  for (const s of sheets) wb.addWorksheet(s).getCell('A1').value = `{{${s.toLowerCase()}}}`;
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('dashboard', () => {
  let P: string;
  let rActive: ReleaseDTO;
  let rOld: ReleaseDTO;
  let ngDefectKey: string;

  beforeAll(async () => {
    const pid = (await createProject(t.prisma, 'DSH', team)).id;
    P = `/projects/${pid}`;
    const rel = async (name: string, status: string, startDate: string) =>
      expectBody<ReleaseDTO>(await lead.post(`${P}/releases`, { name, status, startDate }), 201);
    rOld = await rel('Old', 'completed', '2026-01-01');
    rActive = await rel('Current', 'active', '2026-06-01');
    await rel('Next', 'planned', '2026-12-01');

    const suite = await createSuite(t, pid, { name: 'S', prefix: 'S' });
    for (const title of ['one', 'two', 'three', 'four']) {
      await createCase(t, suite, leadId, { title, summaryGroup: 'G' });
    }
    const plan = expectBody<PlanDTO>(
      await tester.post(`${P}/plans`, {
        docNo: 'DSH-1',
        title: 'Current plan',
        releaseId: rActive.id,
      }),
      201,
    );
    await tester.post(`${P}/plans`, { docNo: 'DSH-OLD', title: 'Old plan', releaseId: rOld.id });
    const run = expectBody<RunDTO>(
      await tester.post(`${P}/plans/${plan.id}/runs`, { suiteId: suite.id, code: 'KR' }),
      201,
    );
    const rcs = expectBody<RunCaseDTO[]>(await viewer.get(`${P}/runs/${run.id}/cases`), 200);
    await tester.put(`${P}/run-cases/${rcs[0]!.id}/result`, {
      status: 'ng',
      actualResult: 'Broken',
    });
    await tester.put(`${P}/run-cases/${rcs[1]!.id}/result`, {
      status: 'ok_cond',
      remark: 'Minor offset',
    });
    await tester.put(`${P}/run-cases/${rcs[2]!.id}/result`, { status: 'ok' });

    ngDefectKey = (
      await createDefect(t, pid, {
        title: 'Broken thing',
        severity: 'critical',
        runCaseId: rcs[0]!.id,
        releaseId: null,
      })
    ).key;
    await createDefect(t, pid, {
      title: 'Release minor',
      severity: 'minor',
      releaseId: rActive.id,
    });
    await createDefect(t, pid, {
      title: 'Rejected one',
      releaseId: rActive.id,
      status: 'rejected',
    });
    await createDefect(t, pid, { title: 'Old release bug', severity: 'major', releaseId: rOld.id });
  });

  it('defaults to the newest active release and summarises it', async () => {
    const d = expectBody<DashboardDTO>(await viewer.get(`${P}/dashboard`), 200);
    expect(d.release?.name).toBe('Current');
    expect(d.releases.map((r) => r.name)).toEqual(['Next', 'Current', 'Old']);
    expect(d.plans.map((p) => p.docNo)).toEqual(['DSH-1']);
    expect(d.kpis).toMatchObject({
      planCount: 1,
      plansByStatus: { draft: 0, in_progress: 1, completed: 0 },
      counts: { ng: 1, ok_cond: 1, ok: 1, untested: 1 },
      openDefects: 2,
      openDefectsBySeverity: { critical: 1, major: 0, minor: 1, trivial: 0 },
    });
    expect(d.openDefects.map((x) => x.title)).toEqual(['Broken thing', 'Release minor']);
    expect(d.attention.map((a) => a.status).toSorted()).toEqual(['ng', 'ok_cond']);
    const ng = d.attention.find((a) => a.status === 'ng')!;
    expect(ng).toMatchObject({
      actualResult: 'Broken',
      runCode: 'KR',
      planDocNo: 'DSH-1',
      defect: { key: ngDefectKey },
    });
    expect(d.attention.find((a) => a.status === 'ok_cond')!.defect).toBeNull();
  });

  it('switches release on request and validates it', async () => {
    const d = expectBody<DashboardDTO>(
      await viewer.get(`${P}/dashboard?releaseId=${rOld.id}`),
      200,
    );
    expect(d.release?.name).toBe('Old');
    expect(d.plans.map((p) => p.docNo)).toEqual(['DSH-OLD']);
    expect(d.kpis.openDefects).toBe(1);
    expect(d.attention).toEqual([]);
    expect(errorCode(await viewer.get(`${P}/dashboard?releaseId=999999`))).toBe('BAD_RELEASE');
  });

  it('covers all plans when the project has no releases', async () => {
    const pid = (await createProject(t.prisma, 'NOREL', team)).id;
    await tester.post(`/projects/${pid}/plans`, { docNo: 'N-1', title: 'Loose plan' });
    const d = expectBody<DashboardDTO>(await viewer.get(`/projects/${pid}/dashboard`), 200);
    expect(d.release).toBeNull();
    expect(d.plans.map((p) => p.docNo)).toEqual(['N-1']);
    expect(d.kpis.plansByStatus.draft).toBe(1);
  });
});

describe('report templates', () => {
  let P: string;
  let pid: number;

  beforeAll(async () => {
    pid = (await createProject(t.prisma, 'TPL', team)).id;
    P = `/projects/${pid}`;
  });

  it('lists the built-in template first and serves the packaged workbook', async () => {
    const list = expectBody<TemplateDTO[]>(await viewer.get(`${P}/templates`), 200);
    expect(list).toEqual([
      expect.objectContaining({
        id: 0,
        builtIn: true,
        isDefault: true,
        fileName: 'default-report.xlsx',
        projectId: pid,
      }),
    ]);
    const ok = await binary(viewer.get(`${P}/templates/0/download`));
    expect(ok.status).toBe(200);
    expect(String(ok.headers['content-disposition'])).toContain('default-report.xlsx');
    expect((ok.body as Buffer).equals(fs.readFileSync(defaultTemplatePath()))).toBe(true);
  });

  it('uploads, updates, defaults, downloads and deletes project templates', async () => {
    const file = await xlsxBuffer(['Cover', 'Result']);
    const form = (fields: Record<string, string>, name = 'team-report.xlsx', content = file) => ({
      fields,
      file: { name, content },
    });
    const url = `${P}/templates`;
    expect((await upload(t, tester, url, form({ name: 'Nope' }))).status).toBe(403);
    const wrongExt = await upload(t, lead, url, form({ name: 'PDF' }, 'report.pdf'));
    expect(wrongExt.status).toBe(415);
    const garbage = await upload(
      t,
      lead,
      url,
      form({ name: 'Garbage' }, 'fake.xlsx', Buffer.from('not a zip')),
    );
    expect(garbage.status).toBe(422);
    expect(errorCode(garbage)).toBe('BAD_TEMPLATE_FILE');
    expect(await t.prisma.db.attachment.findMany({ where: { entityType: 'template' } })).toEqual(
      [],
    );
    expect(errorCode(await lead.post(url, { name: 'JSON' }))).toBe('MULTIPART_REQUIRED');

    const tpl = expectBody<TemplateDTO>(
      await upload(
        t,
        lead,
        url,
        form({ name: 'TEAM report', runSheet: 'Result', isDefault: 'true', suiteId: '' }),
      ),
      201,
    );
    expect(tpl).toMatchObject({
      name: 'TEAM report',
      fileName: 'team-report.xlsx',
      runSheet: 'Result',
      isDefault: true,
      builtIn: false,
      suiteId: null,
    });
    let list = expectBody<TemplateDTO[]>(await viewer.get(url), 200);
    expect(list.map((x) => [x.id, x.isDefault])).toEqual([
      [0, false],
      [tpl.id, true],
    ]);

    const second = expectBody<TemplateDTO>(
      await upload(t, lead, url, form({ name: 'Alt', isDefault: 'true' })),
      201,
    );
    list = expectBody<TemplateDTO[]>(await viewer.get(url), 200);
    expect(list.filter((x) => x.isDefault).map((x) => x.id)).toEqual([second.id]);

    const patched = expectBody<TemplateDTO>(
      await lead.patch(`${url}/${tpl.id}`, {
        name: 'TEAM report v2',
        runSheet: 'RUN',
        isDefault: true,
      }),
      200,
    );
    expect(patched).toMatchObject({ name: 'TEAM report v2', runSheet: 'RUN', isDefault: true });
    list = expectBody<TemplateDTO[]>(await viewer.get(url), 200);
    expect(list.filter((x) => x.isDefault).map((x) => x.id)).toEqual([tpl.id]);
    expect((await tester.patch(`${url}/${tpl.id}`, { name: 'x' })).status).toBe(403);

    const dl = await binary(viewer.get(`${url}/${tpl.id}/download`));
    expect(dl.status).toBe(200);
    expect((dl.body as Buffer).equals(file)).toBe(true);
    expect(String(dl.headers['content-disposition'])).toContain('team-report.xlsx');

    // Plans may pin a template; deleting the template unpins them.
    const plan = expectBody<PlanDTO>(
      await tester.post(`${P}/plans`, { docNo: 'T-1', title: 'T', templateId: tpl.id }),
      201,
    );
    expect(plan.templateId).toBe(tpl.id);
    const row = await t.prisma.db.attachment.findFirstOrThrow({
      where: { entityId: tpl.id, entityType: 'template' },
    });
    const stored = await attachmentPath(t, row.id);
    expect(fs.existsSync(stored)).toBe(true);
    expect((await tester.delete(`${url}/${tpl.id}`)).status).toBe(403);
    expect((await lead.delete(`${url}/${tpl.id}`)).status).toBe(204);
    expect(fs.existsSync(stored)).toBe(false);
    expect(
      expectBody<PlanDTO>(await viewer.get(`${P}/plans/${plan.id}`), 200).templateId,
    ).toBeNull();
    expect((await viewer.get(`${url}/${tpl.id}/download`)).status).toBe(404);
  });

  it('resolves the template for exports: explicit, plan, project default, built-in', async () => {
    const templates = t.app.get(TemplatesService);
    const pid2 = (await createProject(t.prisma, 'RES', team)).id;
    const P2 = `/projects/${pid2}`;
    const builtIn = await templates.resolveTemplate(pid2, {});
    expect(builtIn).toMatchObject({ id: 0, builtIn: true, runSheet: 'RUN' });
    const a = expectBody<TemplateDTO>(
      await upload(t, lead, `${P2}/templates`, {
        fields: { name: 'A', runSheet: 'Result' },
        file: { name: 'a.xlsx', content: await xlsxBuffer(['A']) },
      }),
      201,
    );
    const b = expectBody<TemplateDTO>(
      await upload(t, lead, `${P2}/templates`, {
        fields: { name: 'B', isDefault: 'true' },
        file: { name: 'b.xlsx', content: await xlsxBuffer(['B']) },
      }),
      201,
    );
    expect((await templates.resolveTemplate(pid2, {})).id).toBe(b.id);
    const viaPlan = await templates.resolveTemplate(pid2, { planTemplateId: a.id });
    expect(viaPlan).toMatchObject({ id: a.id, runSheet: 'Result', fileName: 'a.xlsx' });
    expect(viaPlan.buffer.length).toBeGreaterThan(100);
    expect(
      (await templates.resolveTemplate(pid2, { templateId: 0, planTemplateId: a.id })).builtIn,
    ).toBe(true);
    await expect(templates.resolveTemplate(pid, { templateId: a.id })).rejects.toMatchObject({
      code: 'TEMPLATE_NOT_FOUND',
    });
  });
});

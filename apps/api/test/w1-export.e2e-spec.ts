/**
 * Plan report export (port of the v1 server's w1-export tests): template resolution, filled values
 * (incl. step cases and the v1.1 placeholders), template errors, template check and the
 * placeholder reference.
 */
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { ExcelJS, type Workbook } from '@tmt/excel';
import type {
  PlanDTO,
  ReleaseDTO,
  RunCaseDTO,
  RunDTO,
  TemplateCheckDTO,
  TemplateDTO,
} from '@tmt/shared';
import {
  binary,
  createCase,
  createProject,
  createSection,
  createSharedStep,
  createSuite,
  createTestApp,
  createUser,
  errorCode,
  expectBody,
  login,
  setDisplayName,
  upload,
  type Client,
  type TestApp,
} from './helpers.js';

let t: TestApp;
let lead: Client;
let tester: Client;
let viewer: Client;
let outsider: Client;
let P: string;
let otherP: string;
let plan: PlanDTO;
let runA: RunDTO;

async function xlsx(build: (wb: Workbook) => void): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  build(wb);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** A small project template using the v1.1 case placeholders. */
function customTemplate(wb: Workbook): void {
  const sum = wb.addWorksheet('Sum');
  sum.getCell('A1').value = '${plan.docNo} — ${plan.title}';
  sum.getCell('A2').value = '${table:runs.code}';
  sum.getCell('B2').value = '${table:runs.g_power}';
  sum.getCell('C2').value = '${table:runs.env_unit_model}';
  const run = wb.addWorksheet('Run');
  run.getCell('A1').value = '${run.code}';
  run.getCell('B1').value = '${env.unit_model}';
  const cols = [
    'code',
    'priority',
    'tags',
    'references',
    'estimate',
    'procedure',
    'expected',
    'result',
    'remark',
    'cf_register',
  ];
  cols.forEach((c, i) => {
    run.getCell(3, i + 1).value = `\${table:cases.${c}}`;
  });
}

async function uploadTemplate(
  fields: Record<string, string>,
  content: Buffer,
  base = P,
): Promise<TemplateDTO> {
  return expectBody<TemplateDTO>(
    await upload(t, lead, `${base}/templates`, {
      fields,
      file: { name: 'template.xlsx', content },
    }),
    201,
  );
}

async function exportBook(url: string): Promise<Workbook> {
  const res = await binary(viewer.get(url));
  expect(res.status).toBe(200);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(res.body as ArrayBuffer);
  return wb;
}

beforeAll(async () => {
  t = await createTestApp();
  const l = await createUser(t.prisma, 'lead');
  const te = await createUser(t.prisma, 'tester');
  await setDisplayName(t, te.id, 'Tester One');
  const v = await createUser(t.prisma, 'viewer');
  const o = await createUser(t.prisma, 'outsider');
  const projectId = (
    await createProject(t.prisma, 'WEXP', [
      { userId: l.id, role: 'lead' },
      { userId: te.id, role: 'tester' },
      { userId: v.id, role: 'viewer' },
    ])
  ).id;
  const other = await createProject(t.prisma, 'WEXO', [
    { userId: l.id, role: 'lead' },
    { userId: o.id, role: 'lead' },
  ]);
  P = `/projects/${projectId}`;
  otherP = `/projects/${other.id}`;
  lead = await login(t, 'lead');
  tester = await login(t, 'tester');
  viewer = await login(t, 'viewer');
  outsider = await login(t, 'outsider');

  const release = expectBody<ReleaseDTO>(
    await lead.post(`${P}/releases`, { name: 'Step 1.1.6', status: 'active' }),
    201,
  );
  const suite = await createSuite(t, projectId, {
    name: 'Unit operation',
    prefix: 'UO',
    envTemplate: ['Platform', 'Unit model'],
    fieldDefs: [{ key: 'register', label: 'Register', type: 'text', showInTable: true }],
  });
  const sec = await createSection(t, suite.id, 'Power');
  const shared = await createSharedStep(t, projectId, 'Open app', [
    { action: 'Open the app', expected: 'Home' },
  ]);
  await createCase(t, suite, l.id, {
    sectionId: sec.id,
    title: 'Power on',
    code: 'PW-1',
    summaryGroup: 'Power',
    priority: 'high',
    tags: ['Smoke', 'Nightly'],
    references: 'REQ-1',
    estimateMinutes: 15,
    procedure: 'Tap power',
    expected: 'Unit ON',
    remark: 'Library note',
    custom: { register: '2001' },
  });
  await createCase(t, suite, l.id, {
    sectionId: sec.id,
    title: 'Power off (steps)',
    summaryGroup: 'Power',
    template: 'steps',
    steps: [
      { kind: 'shared', sharedStepId: shared.id },
      { kind: 'step', action: 'Tap power', expected: 'Unit OFF' },
    ],
  });
  plan = expectBody<PlanDTO>(
    await tester.post(`${P}/plans`, {
      docNo: '26TR-TEAM-10-001',
      title: 'Unit/operation: test',
      releaseId: release.id,
      purpose: 'Check the unit',
    }),
    201,
  );
  runA = expectBody<RunDTO>(
    await tester.post(`${P}/plans/${plan.id}/runs`, {
      suiteId: suite.id,
      code: 'KR_01',
      scenario: 'Android',
      environment: [
        { label: 'Unit model', value: 'ACU18' },
        { label: 'Platform', value: 'Android 16' },
      ],
    }),
    201,
  );
  const rcs = expectBody<RunCaseDTO[]>(await viewer.get(`${P}/runs/${runA.id}/cases`), 200);
  expectBody(
    await tester.put(`${P}/run-cases/${rcs[0]!.id}/result`, {
      status: 'ng',
      actualResult: 'No response',
      remark: 'Retest',
    }),
    200,
  );
  expectBody(await tester.put(`${P}/run-cases/${rcs[1]!.id}/result`, { status: 'ok' }), 200);
  expectBody(
    await tester.patch(`${P}/runs/${runA.id}`, { judgement: 'not_pass', testedDate: '2026-10-21' }),
    200,
  );
  expectBody(
    await tester.post(`${P}/plans/${plan.id}/runs`, {
      suiteId: suite.id,
      code: 'KR_02',
      environment: [{ label: 'Unit model', value: 'ACU25' }],
    }),
    201,
  );
});
afterAll(() => t.close());

describe('plan export with the built-in template', () => {
  it('fills the summary and one sheet per run, named after the run codes', async () => {
    const res = await binary(viewer.get(`${P}/plans/${plan.id}/export.xlsx`));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    const disposition = String(res.headers['content-disposition']);
    expect(disposition).toContain(
      `filename*=UTF-8''${encodeURIComponent('26TR-TEAM-10-001 Unit operation test.xlsx')}`,
    );
    expect(disposition).toContain('attachment;');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Summary', 'KR_01', 'KR_02', 'refer']);
    const sum = wb.getWorksheet('Summary')!;
    expect(sum.getCell('B2').value).toBe('[Test Summary] Unit/operation: test');
    expect(sum.getCell('C4').value).toBe('26TR-TEAM-10-001');
    expect(sum.getCell('C5').value).toBe('WEXP project');
    expect(sum.getCell('C6').value).toBe('Step 1.1.6');
    expect(sum.getCell('F5').value).toBe('In progress');
    expect([sum.getCell('B15').value, sum.getCell('B16').value]).toEqual(['KR_01', 'KR_02']);

    const run = wb.getWorksheet('KR_01')!;
    expect(run.getCell('D4').value).toBe('KR_01');
    expect(run.getCell('G4').value).toBe('Android');
    expect(run.getCell('G5').value).toEqual(new Date(Date.UTC(2026, 9, 21)));
    // Environment in suite-template order.
    expect([9, 10].map((r) => [run.getCell(`B${r}`).value, run.getCell(`D${r}`).value])).toEqual([
      ['Platform', 'Android 16'],
      ['Unit model', 'ACU18'],
    ]);
    // Case rows start below the (moved) header.
    const header = [...Array(30).keys()]
      .map((i) => i + 1)
      .find((r) => run.getCell(`B${r}`).value === 'No.')!;
    const first = header + 1;
    expect(run.getCell(`D${first}`).value).toBe('Power on');
    expect(run.getCell(`J${first}`).value).toBe('NG');
    expect(run.getCell(`K${first}`).value).toBe('No response');
    expect(run.getCell(`L${first}`).value).toBe('Library note\nRetest');
    expect(run.getCell(`G${first + 1}`).value).toBe('1. Open the app\n2. Tap power');
    expect(run.getCell(`H${first + 1}`).value).toBe('1. Home\n2. Unit OFF');
    expect(run.getCell(`J${first + 1}`).value).toBe('OK');
    expect(String(run.getCell(`C${first}`).value)).toBe('Power');
  });

  it('is readable by viewers only inside the project', async () => {
    expect((await outsider.get(`${P}/plans/${plan.id}/export.xlsx`)).status).toBe(404);
    expect((await viewer.get(`${P}/plans/999999/export.xlsx`)).status).toBe(404);
    expect((await viewer.get(`${P}/plans/${plan.id}/export.xlsx?templateId=abc`)).status).toBe(400);
  });
});

describe('template resolution and the v1.1 placeholders', () => {
  let custom: TemplateDTO;

  beforeAll(async () => {
    custom = await uploadTemplate({ name: 'Custom', runSheet: 'Run' }, await xlsx(customTemplate));
  });

  it('uses an explicit template and fills priority, tags, references, estimate', async () => {
    const wb = await exportBook(`${P}/plans/${plan.id}/export.xlsx?templateId=${custom.id}`);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Sum', 'KR_01', 'KR_02']);
    const sum = wb.getWorksheet('Sum')!;
    expect(sum.getCell('A1').value).toBe('26TR-TEAM-10-001 — Unit/operation: test');
    expect([sum.getCell('A2').value, sum.getCell('B2').value, sum.getCell('C2').value]).toEqual([
      'KR_01',
      'NG',
      'ACU18',
    ]);
    expect(sum.getCell('A3').value).toBe('KR_02');
    expect(sum.getCell('B3').value).toBeNull(); // all untested → empty group cell
    const run = wb.getWorksheet('KR_01')!;
    expect([run.getCell('A1').value, run.getCell('B1').value]).toEqual(['KR_01', 'ACU18']);
    const row = (r: number) => (run.getRow(r).values as unknown[]).slice(1);
    expect(row(3)).toEqual([
      'PW-1',
      'High',
      'Smoke, Nightly',
      'REQ-1',
      15,
      'Tap power',
      'Unit ON',
      'NG',
      'Library note\nRetest',
      '2001',
    ]);
    expect(row(4).slice(0, 2)).toEqual([expect.stringMatching(/^UO-\d{3}$/), 'Medium']);
  });

  it('falls back from the plan template to the project default to the built-in one', async () => {
    // Project default.
    const def = await uploadTemplate(
      { name: 'Default', runSheet: 'Run', isDefault: 'true' },
      await xlsx(customTemplate),
    );
    expect(def.isDefault).toBe(true);
    let wb = await exportBook(`${P}/plans/${plan.id}/export.xlsx`);
    expect(wb.worksheets[0]!.name).toBe('Sum');
    wb = await exportBook(`${P}/plans/${plan.id}/export.xlsx?templateId=0`);
    expect(wb.worksheets[0]!.name).toBe('Sum');
    // A broken plan template (missing run sheet) → 422 TEMPLATE_INVALID.
    const broken = await uploadTemplate(
      { name: 'Broken', runSheet: 'Nope' },
      await xlsx((w) => {
        w.addWorksheet('Only').getCell('A1').value = '${plan.title}';
      }),
    );
    expectBody(await tester.patch(`${P}/plans/${plan.id}`, { templateId: broken.id }), 200);
    const res = await viewer.get(`${P}/plans/${plan.id}/export.xlsx`);
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({
      error: { code: 'TEMPLATE_INVALID', details: { reason: 'RUN_SHEET_NOT_FOUND' } },
    });
    // Explicit template wins over the plan's.
    wb = await exportBook(`${P}/plans/${plan.id}/export.xlsx?templateId=${custom.id}`);
    expect(wb.worksheets[0]!.name).toBe('Sum');
    // Templates of other projects are not found.
    const foreign = await uploadTemplate(
      { name: 'Foreign', runSheet: 'Run' },
      await xlsx(customTemplate),
      otherP,
    );
    const other = await viewer.get(`${P}/plans/${plan.id}/export.xlsx?templateId=${foreign.id}`);
    expect(other.status).toBe(404);
    expect(errorCode(other)).toBe('TEMPLATE_NOT_FOUND');
    // Back to no plan template and no project default → built-in.
    expectBody(await tester.patch(`${P}/plans/${plan.id}`, { templateId: null }), 200);
    expectBody(await lead.patch(`${P}/templates/${def.id}`, { isDefault: false }), 200);
    wb = await exportBook(`${P}/plans/${plan.id}/export.xlsx`);
    expect(wb.worksheets[0]!.name).toBe('Summary');
  });
});

describe('template check and placeholders', () => {
  it('checks the built-in template', async () => {
    const check = expectBody<TemplateCheckDTO>(await viewer.get(`${P}/templates/0/check`), 200);
    expect(check).toMatchObject({
      unknown: [],
      runSheetFound: true,
      sheets: ['Summary', 'RUN', 'refer'],
    });
    expect(check.placeholders).toEqual(expect.arrayContaining(['plan.docNo', 'table:cases.no']));
  });

  it('reports unknown placeholders and a missing run sheet of a project template', async () => {
    const tpl = await uploadTemplate(
      { name: 'Checked', runSheet: 'Missing' },
      await xlsx((w) => {
        const ws = w.addWorksheet('Run');
        ws.getCell('A1').value = '${table:cases.priority} ${table:cases.estimate}';
        ws.getCell('A2').value = '${plan.owner} ${table:cases.cf_register}';
      }),
    );
    const check = expectBody<TemplateCheckDTO>(
      await viewer.get(`${P}/templates/${tpl.id}/check`),
      200,
    );
    expect(check).toEqual({
      placeholders: [
        'table:cases.priority',
        'table:cases.estimate',
        'plan.owner',
        'table:cases.cf_register',
      ],
      unknown: ['plan.owner'],
      sheets: ['Run'],
      runSheetFound: false,
    });
    expect((await viewer.get(`${P}/templates/999999/check`)).status).toBe(404);
  });

  it('lists the placeholders of the project (fields, environment, groups, v1.1 case fields)', async () => {
    const ref = expectBody<{
      workbook: string[];
      runs: string[];
      run: string[];
      cases: string[];
    }>(await viewer.get(`${P}/templates/placeholders`), 200);
    expect(ref.workbook).toContain('${plan.docNo}');
    expect(ref.runs).toEqual(
      expect.arrayContaining([
        '${table:runs.code}',
        '${table:runs.env_unit_model}',
        '${table:runs.g_power}',
      ]),
    );
    expect(ref.run).toEqual(expect.arrayContaining(['${run.code}', '${env.platform}']));
    expect(ref.cases).toEqual(
      expect.arrayContaining([
        '${table:cases.priority}',
        '${table:cases.tags}',
        '${table:cases.references}',
        '${table:cases.estimate}',
        '${table:cases.cf_register}',
      ]),
    );
    expect((await outsider.get(`${P}/templates/placeholders`)).status).toBe(404);
  });
});

import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { beforeAll, describe, expect, it } from '@jest/globals';
import { ExcelJS, type Workbook } from '../src/cjs';
import { checkTemplate, inspectTemplate, renderReport, TemplateError } from '../src/export';
import { sampleReport, sampleRun } from './fixtures/report-data';
import { defaultTemplatePath } from '../src/assets';

const DEFAULT_TEMPLATE = readFileSync(defaultTemplatePath());

async function open(buf: Buffer): Promise<Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as Parameters<typeof wb.xlsx.load>[0]);
  return wb;
}

/** Raw OOXML of a sheet by name. */
async function sheetXml(zip: JSZip, name: string): Promise<string> {
  const wbXml = await zip.file('xl/workbook.xml')!.async('string');
  const rels = await zip.file('xl/_rels/workbook.xml.rels')!.async('string');
  const esc = name.replace(/&/g, '&amp;').replace(/'/g, '&apos;');
  const rid = new RegExp(
    `<sheet name="${esc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*r:id="([^"]+)"`,
  ).exec(wbXml)![1];
  const target = new RegExp(
    `Id="${rid}"[^>]*Target="([^"]+)"|Target="([^"]+)"[^>]*Id="${rid}"`,
  ).exec(rels)!;
  return zip.file(`xl/${(target[1] ?? target[2])!}`)!.async('string');
}

function merges(xml: string): string[] {
  return [...xml.matchAll(/<mergeCell ref="([^"]+)"/g)].map((m) => m[1]!);
}

describe('renderReport with the built-in template', () => {
  let out: Buffer;
  let wb: Workbook;
  let zip: JSZip;
  beforeAll(async () => {
    out = await renderReport(DEFAULT_TEMPLATE, { runSheet: 'RUN' }, sampleReport());
    wb = await open(out);
    zip = await JSZip.loadAsync(out);
  });

  it('puts one sheet per run where the run sheet was, named after the run code', () => {
    expect(wb.worksheets.map((ws) => ws.name)).toEqual([
      'Summary',
      'KR-01',
      'KR-02 iOS beta',
      'refer',
    ]);
  });

  it('fills workbook placeholders and the runs table on the summary', () => {
    const ws = wb.getWorksheet('Summary')!;
    expect(ws.getCell('B2').value).toBe('[Test Summary] Unit operation test');
    expect(ws.getCell('C4').value).toBe('QA-0001');
    expect(ws.getCell('C6').value).toBe('R1 & hotfix');
    expect(ws.getCell('F4').value).toEqual(new Date(Date.UTC(2026, 9, 23))); // date-formatted cell → real date
    expect(ws.getCell('C11').value).toBe('\\\\server\\share\\raw');
    expect(ws.getCell('D12').value).toBeNull(); // null judgement note → empty cell
    expect([ws.getCell('B15').value, ws.getCell('B16').value]).toEqual([
      'KR-01',
      'KR-02 iOS: [beta]',
    ]);
    expect([ws.getCell('G15').value, ws.getCell('H15').value, ws.getCell('I16').value]).toEqual([
      2, 1, 1,
    ]);
    expect(ws.getCell('E15').value).toEqual(new Date(Date.UTC(2026, 9, 21)));
    expect(String(ws.getCell('B18').value)).toMatch(/^Each run has its own sheet/); // note moved down one row
    expect(ws.getCell('B17').value).toBeNull();
  });

  it('fills the run sheet: header, environment list, cases', () => {
    const ws = wb.getWorksheet('KR-01')!;
    expect(ws.getCell('B2').value).toBe('Test Result — KR-01');
    expect(ws.getCell('D4').value).toBe('KR-01');
    expect(ws.getCell('G4').value).toBe('Unit operation (Android)');
    expect(ws.getCell('G5').value).toEqual(new Date(Date.UTC(2026, 9, 21)));
    expect(ws.getCell('D6').value).toBeNull();
    expect([9, 10, 11].map((r) => [ws.getCell(`B${r}`).value, ws.getCell(`D${r}`).value])).toEqual([
      ['Platform', 'Android'],
      ['Unit model', 'MODEL-01'],
      ['FW version', '1.2.3'],
    ]);
    expect(ws.getCell('B13').value).toBe('No.'); // header moved down by the 2 extra env rows
    const rows = [14, 15, 16, 17, 18];
    expect(rows.map((r) => ws.getCell(`B${r}`).value)).toEqual([1, 2, 3, 4, 5]);
    expect(rows.map((r) => ws.getCell(`J${r}`).value)).toEqual([
      'OK',
      'OK',
      'NG',
      'OK with condition',
      'N/A',
    ]);
    expect(rows.map((r) => ws.getCell(`C${r}`).value)).toEqual([
      'Login',
      'Login',
      'Mode / Cool',
      'Mode / Cool',
      'Mode / Heat',
    ]);
    expect(ws.getCell('K16').value).toBe('Unit did not respond');
    expect(ws.getCell('E18').value).toBe('Abnormal');
    expect(ws.getCell('G14').value).toBe('1. Open the app\n2. Tap the power button');
    expect(String(ws.getCell('B20').value)).toMatch(/^N\/A = not applicable/);
    expect(wb.getWorksheet('KR-02 iOS beta')!.getCell('D9').value).toBe('iOS');
  });

  it('repeats row merges, merges equal sections vertically and moves merges below', async () => {
    const m = merges(await sheetXml(zip, 'KR-01'));
    expect(m).toEqual(
      expect.arrayContaining([
        'B9:C9',
        'B10:C10',
        'B11:C11',
        'H13:I13',
        'B20:L20',
        'C14:C15',
        'C16:C17',
      ]),
    );
    for (const r of [14, 15, 16, 17, 18]) expect(m).toContain(`H${r}:I${r}`);
    expect(m).not.toContain('C18:C18');
    expect(m.filter((x) => x.startsWith('C1'))).toEqual(['C14:C15', 'C16:C17']);
  });

  it('extends data validation and conditional formatting to every case row', async () => {
    const xml = await sheetXml(zip, 'KR-01');
    expect(xml).toMatch(/<dataValidation [^>]*sqref="J14:J18"/);
    expect(xml).toMatch(/<conditionalFormatting sqref="J14:J18"/);
  });

  it('grows rows with long wrapped text, keeps the template height as minimum', async () => {
    const ws = wb.getWorksheet('KR-01')!;
    expect(ws.getRow(16).height).toBeGreaterThan(150);
    expect(ws.getRow(14).height).toBeGreaterThanOrEqual(20);
    expect(ws.getRow(14).height).toBeLessThan(ws.getRow(16).height);
  });

  it('copies print titles per run sheet and fills footers', async () => {
    const wbXml = await zip.file('xl/workbook.xml')!.async('string');
    expect(wbXml).toContain(
      `<definedName name="_xlnm.Print_Titles" localSheetId="1">&apos;KR-01&apos;!$13:$13</definedName>`,
    );
    expect(wbXml).toContain(`localSheetId="2">&apos;KR-02 iOS beta&apos;!$13:$13</definedName>`);
    expect(wbXml).not.toContain('RUN');
    expect(await sheetXml(zip, 'KR-01')).toContain(
      '<oddFooter>&amp;L&amp;8QA-0001&amp;R&amp;8Page &amp;P / &amp;N</oddFooter>',
    );
  });

  it('selects exactly one tab and asks Excel to recalculate', async () => {
    const wbXml = await zip.file('xl/workbook.xml')!.async('string');
    expect(wbXml).toMatch(/<calcPr[^>]*fullCalcOnLoad="1"/);
    let selected = 0;
    for (const ws of ['Summary', 'KR-01', 'KR-02 iOS beta', 'refer'])
      if (/tabSelected="1"/.test(await sheetXml(zip, ws))) selected++;
    expect(selected).toBe(1);
  });

  it('leaves no placeholder behind', async () => {
    const info = await inspectTemplate(out);
    expect(info.placeholders).toEqual([]);
  });
});

describe('renderReport edge cases', () => {
  it('without a run sheet fills workbook values and blanks run placeholders', async () => {
    const out = await renderReport(DEFAULT_TEMPLATE, {}, sampleReport());
    const wb = await open(out);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Summary', 'RUN', 'refer']);
    expect(wb.getWorksheet('RUN')!.getCell('D4').value).toBeNull();
    expect(wb.getWorksheet('RUN')!.getCell('B12').value).toBeNull();
    expect(wb.getWorksheet('Summary')!.getCell('B16').value).toBe('KR-02 iOS: [beta]');
  });

  it('keeps an empty run sheet when the plan has no runs', async () => {
    const data = { ...sampleReport(), runs: [] };
    const wb = await open(await renderReport(DEFAULT_TEMPLATE, { runSheet: 'RUN' }, data));
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Summary', 'RUN', 'refer']);
    expect(wb.getWorksheet('Summary')!.getCell('B15').value).toBeNull();
    expect(String(wb.getWorksheet('Summary')!.getCell('B17').value)).toMatch(/^Each run/);
  });

  it('makes run sheet names unique', async () => {
    const data = {
      ...sampleReport(),
      runs: [sampleRun('Summary', 'A'), sampleRun('summary', 'B'), sampleRun('x'.repeat(40), 'C')],
    };
    const wb = await open(await renderReport(DEFAULT_TEMPLATE, { runSheet: 'run' }, data));
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      'Summary',
      'Summary (2)',
      'summary (3)',
      'x'.repeat(31),
      'refer',
    ]);
  });

  it('rejects an unknown run sheet and files that are not workbooks', async () => {
    await expect(
      renderReport(DEFAULT_TEMPLATE, { runSheet: 'Nope' }, sampleReport()),
    ).rejects.toMatchObject({
      code: 'RUN_SHEET_NOT_FOUND',
    });
    await expect(renderReport(Buffer.from('hello'), {}, sampleReport())).rejects.toBeInstanceOf(
      TemplateError,
    );
  });
});

describe('inspectTemplate / checkTemplate', () => {
  it('lists sheets and placeholders of the built-in template', async () => {
    const info = await inspectTemplate(DEFAULT_TEMPLATE);
    expect(info.sheets).toEqual(['Summary', 'RUN', 'refer']);
    expect(info.placeholders).toEqual(
      expect.arrayContaining([
        'plan.title',
        'plan.docNo',
        'today',
        'table:runs.code',
        'table:runs.ok',
        'run.code',
        'run.testedDate',
        'table:envList.label',
        'table:cases.sectionMerged',
        'table:cases.expected',
      ]),
    );
    const check = await checkTemplate(DEFAULT_TEMPLATE, { runSheet: 'RUN' });
    expect(check).toMatchObject({
      unknown: [],
      runSheetFound: true,
      sheets: ['Summary', 'RUN', 'refer'],
    });
  });

  it('reports unknown placeholders', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Report');
    ws.getCell('A1').value = '${plan.title} ${plan.owner}';
    ws.getCell('A2').value = '${table:cases.cf_register}';
    ws.getCell('A3').value = '${table:cases.colour}';
    ws.getCell('A4').value = '${env.unit_model}';
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const check = await checkTemplate(buf, { runSheet: 'Run', fieldDefs: [{ key: 'register' }] });
    expect(check.placeholders).toEqual([
      'plan.title',
      'plan.owner',
      'table:cases.cf_register',
      'table:cases.colour',
      'env.unit_model',
    ]);
    expect(check.unknown).toEqual(['plan.owner', 'table:cases.colour']);
    expect(check.runSheetFound).toBe(false);
  });
});

describe('run sheet with pictures, notes, formulas and a hidden sheet', () => {
  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  );
  let zip: JSZip;
  let wb: Workbook;

  beforeAll(async () => {
    const t = new ExcelJS.Workbook();
    const sum = t.addWorksheet('Sum');
    sum.getCell('A1').value = 'Run';
    sum.getCell('A2').value = '${table:runs.code}';
    sum.getCell('B2').value = '${table:runs.total}';
    sum.getCell('C2').value = { formula: 'B2*2' };
    sum.getCell('A4').value = { formula: 'COUNTA(A2:A2)' };
    sum.getCell('B4').value = { formula: 'SUM(B2:B2)+$B$2' };
    const run = t.addWorksheet('Run');
    run.getCell('A1').value = '${run.code}';
    run.getCell('A2').value = '${table:cases.title}';
    run.getCell('B2').value = '${table:cases.result}';
    run.getCell('A4').value = 'Checked';
    run.getCell('A4').note = 'Checked by QA';
    const img = t.addImage({ buffer: PNG as unknown as ArrayBuffer, extension: 'png' } as never);
    run.addImage(img, { tl: { col: 2, row: 3 }, ext: { width: 20, height: 20 } });
    run.addImage(img, 'D1:E1');
    const hidden = t.addWorksheet('Lists', { state: 'hidden' });
    hidden.getCell('A1').value = 'OK';
    const template = Buffer.from(await t.xlsx.writeBuffer());
    const out = await renderReport(template, { runSheet: 'Run' }, sampleReport());
    zip = await JSZip.loadAsync(out);
    wb = await open(out);
  });

  it('keeps sheet order and hidden state', () => {
    expect(wb.worksheets.map((w) => `${w.name}:${w.state}`)).toEqual([
      'Sum:visible',
      'KR-01:visible',
      'KR-02 iOS beta:visible',
      'Lists:hidden',
    ]);
  });

  it('gives every run sheet its own drawing, VML and comments parts', async () => {
    for (const name of ['KR-01', 'KR-02 iOS beta']) {
      const xml = await sheetXml(zip, name);
      expect(xml).toMatch(/<drawing r:id=/);
      expect(xml).toMatch(/<legacyDrawing r:id=/);
    }
    const relFiles = Object.keys(zip.files).filter(
      (p) => p.startsWith('xl/worksheets/_rels/') && !zip.files[p]!.dir,
    );
    const targets: string[] = [];
    for (const f of relFiles) {
      const rels = await zip.file(f)!.async('string');
      for (const m of rels.matchAll(/Target="([^"]+)"/g))
        if (!m[1]!.includes('media')) targets.push(m[1]!);
    }
    expect(new Set(targets).size).toBe(targets.length);
    const vmls = Object.keys(zip.files).filter((p) => p.endsWith('.vml'));
    expect(vmls).toHaveLength(2);
    const blocks = await Promise.all(
      vmls.map(
        async (p) => /<o:idmap[^>]*data="([^"]+)"/.exec(await zip.file(p)!.async('string'))![1],
      ),
    );
    expect(new Set(blocks).size).toBe(2);
    expect(Object.keys(zip.files).filter((p) => /^xl\/comments\d*\.xml$/.test(p))).toHaveLength(2);
    const types = await zip.file('[Content_Types].xml')!.async('string');
    for (const p of Object.keys(zip.files).filter((x) =>
      /^xl\/(worksheets\/sheet|drawings\/drawing|comments)\d+\.xml$/.test(x),
    )) {
      expect(types).toContain(`PartName="/${p}"`);
    }
  });

  it('moves notes and pictures below the repeated rows', async () => {
    const ws = wb.getWorksheet('KR-01')!;
    expect(ws.getCell('A8').value).toBe('Checked'); // 5 cases → 4 extra rows
    expect(ws.getCell('A8').note).toBeDefined();
    const drawings = Object.keys(zip.files).filter((p) =>
      /^xl\/drawings\/drawing\d+\.xml$/.test(p),
    );
    expect(drawings).toHaveLength(2);
    for (const d of drawings) {
      const xml = await zip.file(d)!.async('string');
      const rows = [...xml.matchAll(/<xdr:from>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/g)].map((m) =>
        Number(m[1]),
      );
      expect(rows.sort()).toEqual([0, 7]); // D1 picture stays, the one at row 4 (0-based 3) moves to 8
    }
  });

  it('expands ranges in formulas and fills formulas down copied rows', async () => {
    const xml = await sheetXml(zip, 'Sum');
    expect(xml).toContain('<f>B2*2</f>');
    expect(xml).toContain('<f>B3*2</f>');
    expect(xml).toContain('<f>COUNTA(A2:A3)</f>');
    expect(xml).toContain('<f>SUM(B2:B3)+$B$2</f>');
    expect(wb.getWorksheet('Sum')!.getCell('B3').value).toBe(5);
  });
});

/**
 * Builds the built-in report template `packages/excel/assets/default-report.xlsx` (spec §8).
 * Synthetic layout modelled on the team's report structure — no customer content. Used until the
 * team uploads its controlled blank form.
 *
 *   npx tsx apps/server/scripts/build-default-template.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ExcelJS, type Worksheet } from '../src/cjs';

export const DEFAULT_TEMPLATE_RUN_SHEET = 'RUN';

type Style = Partial<import('exceljs').Style>;

const FONT = 'Calibri';
const thin = { style: 'thin' as const, color: { argb: 'FF808080' } };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };
const HEADER: Style = {
  font: { name: FONT, size: 10, bold: true, color: { argb: 'FFFFFFFF' } },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } },
  alignment: { vertical: 'middle', horizontal: 'center', wrapText: true },
  border: BORDER,
};
const LABEL: Style = {
  font: { name: FONT, size: 10, bold: true },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } },
  alignment: { vertical: 'middle', wrapText: true },
  border: BORDER,
};
const VALUE: Style = {
  font: { name: FONT, size: 10 },
  alignment: { vertical: 'middle', wrapText: true },
  border: BORDER,
};
const CELL: Style = {
  font: { name: FONT, size: 10 },
  alignment: { vertical: 'top', wrapText: true },
  border: BORDER,
};
const DATE_FMT = 'yyyy-mm-dd';
const RESULTS = ['OK', 'NG', 'OK with condition', 'Blocked', 'N/T', 'N/A'];

function set(
  ws: Worksheet,
  address: string,
  value: string | null,
  style: Style,
  merge?: string,
): void {
  const cell = ws.getCell(address);
  if (value !== null) cell.value = value;
  cell.style = { ...style };
  if (merge) {
    ws.mergeCells(merge);
    // Borders of merged areas live on every cell of the range.
    const [from, to] = merge.split(':') as [string, string];
    const a = ws.getCell(from);
    const b = ws.getCell(to);
    for (let r = Number(a.row); r <= Number(b.row); r++) {
      for (let c = Number(a.col); c <= Number(b.col); c++) ws.getCell(r, c).style = { ...style };
    }
  }
}

function landscape(ws: Worksheet, printTitles?: string): void {
  ws.pageSetup = {
    paperSize: 9,
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    ...(printTitles ? { printTitlesRow: printTitles } : {}),
  };
  ws.headerFooter = { oddFooter: '&L&8${plan.docNo}&R&8Page &P / &N' };
  ws.views = [{ showGridLines: false }];
}

function summarySheet(wb: InstanceType<typeof ExcelJS.Workbook>): void {
  const ws = wb.addWorksheet('Summary');
  ws.columns = [3, 16, 30, 16, 14, 20, 9, 9, 9, 9].map((width) => ({ width }));
  set(
    ws,
    'B2',
    '[Test Summary] ${plan.title}',
    { font: { name: FONT, size: 16, bold: true }, alignment: { vertical: 'middle' } },
    'B2:J2',
  );
  ws.getRow(2).height = 28;
  const pairs: [string, string, string, string?][] = [
    ['B4', 'Doc no.', 'C4', '${plan.docNo}'],
    ['B5', 'Project', 'C5', '${project.name}'],
    ['B6', 'Release', 'C6', '${release.name}'],
    ['E4', 'Export date', 'F4', '${today}'],
    ['E5', 'Plan status', 'F5', '${plan.status}'],
  ];
  for (const [l, label, v, value] of pairs) {
    set(ws, l, label, LABEL);
    set(ws, v, value ?? '', {
      ...VALUE,
      ...(v === 'F4'
        ? { numFmt: DATE_FMT, alignment: { horizontal: 'left', vertical: 'middle' } }
        : {}),
    });
  }
  const blocks: [number, string, string][] = [
    [8, 'Purpose', '${plan.purpose}'],
    [9, 'Test method', '${plan.testMethod}'],
    [10, 'Judgement criteria', '${plan.judgementCriteria}'],
    [11, 'Raw data', '${plan.rawDataPath}'],
  ];
  for (const [r, label, value] of blocks) {
    set(ws, `B${r}`, label, LABEL);
    set(ws, `C${r}`, value, VALUE, `C${r}:J${r}`);
    ws.getRow(r).height = 30;
  }
  set(ws, 'B12', 'Overall judgement', LABEL);
  set(ws, 'C12', '${plan.overallJudgement}', {
    ...VALUE,
    font: { name: FONT, size: 11, bold: true },
  });
  set(ws, 'D12', '${plan.judgementNote}', VALUE, 'D12:J12');
  ws.getRow(12).height = 24;

  const headers = [
    'Test ID',
    'Scenario',
    'Tester',
    'Tested date',
    'Judgement',
    'OK',
    'NG',
    'N/A',
    'N/T',
  ];
  const fields = ['code', 'scenario', 'tester', 'testedDate', 'judgement', 'ok', 'ng', 'na', 'nt'];
  headers.forEach((h, i) => set(ws, `${String.fromCharCode(66 + i)}14`, h, HEADER));
  fields.forEach((f, i) => {
    const style: Style = {
      ...VALUE,
      ...(f === 'testedDate' ? { numFmt: DATE_FMT } : {}),
      ...(i >= 5 ? { alignment: { horizontal: 'center', vertical: 'middle' } } : {}),
    };
    set(ws, `${String.fromCharCode(66 + i)}15`, `\${table:runs.${f}}`, style);
  });
  ws.getRow(14).height = 22;
  set(
    ws,
    'B17',
    'Each run has its own sheet with the case results. Abbreviations are explained on the "refer" sheet.',
    { font: { name: FONT, size: 9, italic: true } },
    'B17:J17',
  );
  landscape(ws);
}

function runSheet(wb: InstanceType<typeof ExcelJS.Workbook>): void {
  const ws = wb.addWorksheet(DEFAULT_TEMPLATE_RUN_SHEET);
  ws.columns = [2, 6, 18, 28, 10, 26, 34, 22, 22, 14, 26, 20].map((width) => ({ width }));
  set(
    ws,
    'B2',
    'Test Result — ${run.code}',
    { font: { name: FONT, size: 14, bold: true }, alignment: { vertical: 'middle' } },
    'B2:L2',
  );
  ws.getRow(2).height = 24;
  set(ws, 'B4', 'Test ID', LABEL, 'B4:C4');
  set(ws, 'D4', '${run.code}', VALUE);
  set(ws, 'E4', 'Scenario', LABEL, 'E4:F4');
  set(ws, 'G4', '${run.scenario}', VALUE, 'G4:I4');
  set(ws, 'J4', 'Judgement', LABEL);
  set(
    ws,
    'K4',
    '${run.judgement}',
    { ...VALUE, font: { name: FONT, size: 10, bold: true } },
    'K4:L4',
  );
  set(ws, 'B5', 'Tester', LABEL, 'B5:C5');
  set(ws, 'D5', '${run.tester}', VALUE);
  set(ws, 'E5', 'Tested date', LABEL, 'E5:F5');
  set(
    ws,
    'G5',
    '${run.testedDate}',
    { ...VALUE, numFmt: DATE_FMT, alignment: { horizontal: 'left', vertical: 'middle' } },
    'G5:I5',
  );
  set(ws, 'J5', 'Note', LABEL);
  set(ws, 'K5', '${run.judgementNote}', VALUE, 'K5:L5');
  set(ws, 'B6', 'Remark', LABEL, 'B6:C6');
  set(ws, 'D6', '${run.remark}', VALUE, 'D6:L6');

  set(ws, 'B8', 'Test environment', HEADER, 'B8:D8');
  set(ws, 'B9', '${table:envList.label}', LABEL, 'B9:C9');
  set(ws, 'D9', '${table:envList.value}', VALUE);

  const headers: [string, string, string?][] = [
    ['B11', 'No.'],
    ['C11', 'Section'],
    ['D11', 'Test topic'],
    ['E11', 'Type'],
    ['F11', 'Pre condition'],
    ['G11', 'Test procedure'],
    ['H11', 'Expected result', 'H11:I11'],
    ['J11', 'Result'],
    ['K11', 'Actual result'],
    ['L11', 'Remark'],
  ];
  for (const [a, h, merge] of headers) set(ws, a, h, HEADER, merge);
  ws.getRow(11).height = 22;
  const row: [string, string, Style?, string?][] = [
    ['B12', '${table:cases.no}', { ...CELL, alignment: { horizontal: 'center', vertical: 'top' } }],
    [
      'C12',
      '${table:cases.sectionMerged}',
      { ...CELL, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4D6' } } },
    ],
    ['D12', '${table:cases.title}'],
    [
      'E12',
      '${table:cases.type}',
      { ...CELL, alignment: { horizontal: 'center', vertical: 'top' } },
    ],
    ['F12', '${table:cases.precondition}'],
    ['G12', '${table:cases.procedure}'],
    ['H12', '${table:cases.expected}', undefined, 'H12:I12'],
    [
      'J12',
      '${table:cases.result}',
      { ...CELL, alignment: { horizontal: 'center', vertical: 'top' } },
    ],
    ['K12', '${table:cases.actual}'],
    ['L12', '${table:cases.remark}'],
  ];
  for (const [a, value, style, merge] of row) set(ws, a, value, style ?? CELL, merge);
  ws.getRow(12).height = 20;
  ws.getCell('J12').dataValidation = {
    type: 'list',
    allowBlank: true,
    showErrorMessage: true,
    formulae: [`"${RESULTS.join(',')}"`],
  };
  ws.addConditionalFormatting({
    ref: 'J12',
    rules: [
      {
        type: 'cellIs',
        operator: 'equal',
        formulae: ['"NG"'],
        priority: 1,
        style: {
          fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFC7CE' } },
          font: { color: { argb: 'FF9C0006' } },
        },
      },
      {
        type: 'cellIs',
        operator: 'equal',
        formulae: ['"OK"'],
        priority: 2,
        style: {
          fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFC6EFCE' } },
          font: { color: { argb: 'FF006100' } },
        },
      },
    ],
  });
  set(
    ws,
    'B14',
    'N/A = not applicable · N/T = not tested · OK with condition = passed with a noted limitation',
    { font: { name: FONT, size: 9, italic: true } },
    'B14:L14',
  );
  landscape(ws, '11:11');
}

function referSheet(wb: InstanceType<typeof ExcelJS.Workbook>): void {
  const ws = wb.addWorksheet('refer');
  ws.columns = [3, 14, 14, 14, 14, 14, 14, 3, 18, 44].map((width) => ({ width }));
  set(ws, 'B2', 'Document control', { font: { name: FONT, size: 14, bold: true } }, 'B2:G2');
  set(ws, 'B4', 'Doc no.', LABEL);
  set(ws, 'C4', '${plan.docNo}', VALUE, 'C4:G4');
  const boxes: [string, string, string, string][] = [
    ['B6', 'Approved', 'B6:C6', 'B7:C9'],
    ['D6', 'Checked', 'D6:E6', 'D7:E9'],
    ['F6', 'Made', 'F6:G6', 'F7:G9'],
  ];
  for (const [a, label, head, box] of boxes) {
    set(ws, a, label, HEADER, head);
    set(ws, box.split(':')[0]!, null, { border: BORDER }, box);
    const dateCell = `${box.split(':')[0]!.replace(/\d+/, '')}10`;
    set(
      ws,
      dateCell,
      'Date: ____ / ____ / ______',
      { font: { name: FONT, size: 9 }, alignment: { horizontal: 'center' }, border: BORDER },
      `${dateCell}:${box.split(':')[1]!.replace(/\d+/, '')}10`,
    );
  }
  for (const r of [7, 8, 9]) ws.getRow(r).height = 20;
  set(ws, 'I4', 'Legend', HEADER, 'I4:J4');
  const legend: [string, string][] = [
    ['OK', 'Test passed'],
    ['NG', 'Test failed — see the defect in Actual result'],
    ['OK with condition', 'Passed with a noted limitation'],
    ['Blocked', 'Could not be executed because of another problem'],
    ['N/T', 'Not tested in this run'],
    ['N/A', 'Not applicable to this unit / environment'],
  ];
  legend.forEach(([k, v], i) => {
    set(ws, `I${5 + i}`, k, LABEL);
    set(ws, `J${5 + i}`, v, VALUE);
  });
  landscape(ws);
}

export async function buildDefaultTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'TMT';
  summarySheet(wb);
  runSheet(wb);
  referSheet(wb);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const out = fileURLToPath(new URL('../assets/default-report.xlsx', import.meta.url));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, await buildDefaultTemplate());
  console.log(`wrote ${out}`);
}

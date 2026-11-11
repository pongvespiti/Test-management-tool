/**
 * Excel version of the run report, laid out like PractiTest's test-set report: a "Summary" sheet
 * (title block, key/value fields incl. the environment, a live status table over the "Results"
 * sheet, sections and defects), "Results" (one row per run case) and "Steps" (step cases only).
 */
import { ExcelJS } from '@tmt/excel';
import {
  CASE_PRIORITY_LABELS,
  DEFECT_SEVERITY_LABELS,
  DEFECT_STATUS_LABELS,
  JUDGEMENT_LABELS,
  PLAN_STATUS_LABELS,
  RESULT_EXPORT_LABELS,
  formatMinutes,
  passRateOf,
  totalOf,
  type Judgement,
  type ResultStatus,
  type RunReportDTO,
} from '@tmt/shared';
import type { Cell, CellValue, Column, PageSetup, Row, Worksheet } from 'exceljs';
import {
  dateTimeInZone,
  excelCalendarDate,
  excelLocalDate,
  formatDuration,
} from './report-time.js';

const RESULTS_SHEET = 'Results';
/** Column of the status in the Results sheet (referenced by the summary formulas). */
const STATUS_COL = 'H';

/** Executed statuses in report order; untested is derived (total − executed). */
const EXECUTED_ORDER: Exclude<ResultStatus, 'untested'>[] = [
  'ok',
  'ok_cond',
  'ng',
  'blocked',
  'nt',
  'na',
];

const STATUS_FILL: Partial<Record<ResultStatus, string>> = {
  ok: 'FFC6EFCE',
  ok_cond: 'FFFFF2CC',
  ng: 'FFFFC7CE',
  blocked: 'FFF8CBAD',
  nt: 'FFE7E6E6',
  na: 'FFEDEDED',
};

const HEADER_FILL = 'FFDDEBF7';
const LABEL_FILL = 'FFF2F2F2';
const BORDER = { style: 'thin' as const, color: { argb: 'FFBFBFBF' } };
const BOX = { top: BORDER, left: BORDER, bottom: BORDER, right: BORDER };
const TOP_WRAP = { vertical: 'top' as const, wrapText: true };

/** Tables print on landscape pages one page wide, with the header row repeated. */
const TABLE_PAGE: Partial<PageSetup> = {
  orientation: 'landscape',
  fitToPage: true,
  fitToWidth: 1,
  fitToHeight: 0,
  printTitlesRow: '1:1',
};

function fill(cell: Cell, argb: string): void {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function headerRow(ws: Worksheet, rowNo: number, labels: string[]): void {
  labels.forEach((label, i) => {
    const cell = ws.getCell(rowNo, 1 + i);
    cell.value = label;
    cell.font = { bold: true };
    cell.alignment = { vertical: 'middle', wrapText: true };
    cell.border = BOX;
    fill(cell, HEADER_FILL);
  });
}

function sectionTitle(ws: Worksheet, rowNo: number, text: string): void {
  const cell = ws.getCell(rowNo, 1);
  cell.value = text;
  cell.font = { bold: true, size: 12, color: { argb: 'FF1F4E79' } };
}

function statusLabel(status: ResultStatus): string {
  return status === 'untested' ? 'Untested' : RESULT_EXPORT_LABELS[status];
}

function judgementText(j: Judgement | null): string {
  return j ? JUDGEMENT_LABELS[j] : '';
}

function defectsText(c: RunReportDTO['cases'][number]): string {
  return c.defects.map((d) => (d.externalKey ? `${d.key} (${d.externalKey})` : d.key)).join(', ');
}

/** Status colour and borders of a table row (alignment is set right after `addRow`). */
function finishRow(row: Row, status: ResultStatus): void {
  const statusFill = STATUS_FILL[status];
  if (statusFill) fill(row.getCell('status'), statusFill);
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.border = BOX;
  });
}

function fillResults(ws: Worksheet, r: RunReportDTO): void {
  ws.columns = [
    { header: '#', key: 'no', width: 6 },
    { header: 'ID', key: 'id', width: 12 },
    { header: 'Code', key: 'code', width: 14 },
    { header: 'Section', key: 'section', width: 28 },
    { header: 'Title', key: 'title', width: 42 },
    { header: 'Type', key: 'type', width: 10 },
    { header: 'Priority', key: 'priority', width: 10 },
    { header: 'Status', key: 'status', width: 18 },
    { header: 'Assignee', key: 'assignee', width: 18 },
    { header: 'Executed by', key: 'executedBy', width: 18 },
    { header: 'Executed at', key: 'executedAt', width: 17 },
    { header: 'Elapsed', key: 'elapsed', width: 10 },
    { header: 'Actual result', key: 'actual', width: 42 },
    { header: 'Remark', key: 'remark', width: 30 },
    { header: 'Defects', key: 'defects', width: 22 },
  ];
  headerRow(
    ws,
    1,
    ws.columns.map((c) => String(c.header)),
  );
  r.cases.forEach((c, i) => {
    const row = ws.addRow({
      no: i + 1,
      id: c.displayId,
      code: c.code ?? '',
      section: c.sectionPath.join(' / '),
      title: c.title,
      type: c.caseType,
      priority: CASE_PRIORITY_LABELS[c.priority],
      // Untested stays empty (the team's Excel wording); the summary counts it as total − executed.
      status: c.status === 'untested' ? null : RESULT_EXPORT_LABELS[c.status],
      assignee: c.assignee?.displayName ?? '',
      executedBy: c.executedBy?.displayName ?? '',
      executedAt: excelLocalDate(c.executedAt, r.timezone),
      elapsed: c.elapsedSec === null ? null : c.elapsedSec / 86_400,
      actual: c.actualResult ?? '',
      remark: c.resultRemark ?? '',
      defects: defectsText(c),
    });
    row.alignment = { ...TOP_WRAP };
    row.getCell('executedAt').numFmt = 'yyyy-mm-dd hh:mm';
    row.getCell('elapsed').numFmt = '[h]:mm:ss';
    finishRow(row, c.status);
  });
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, r.cases.length + 1), column: ws.columns.length },
  };
}

function fillSteps(ws: Worksheet, r: RunReportDTO): void {
  ws.columns = [
    { header: '#', key: 'no', width: 6 },
    { header: 'ID', key: 'id', width: 12 },
    { header: 'Title', key: 'title', width: 36 },
    { header: 'Step', key: 'step', width: 7 },
    { header: 'Shared step', key: 'shared', width: 20 },
    { header: 'Action', key: 'action', width: 44 },
    { header: 'Expected', key: 'expected', width: 40 },
    { header: 'Status', key: 'status', width: 18 },
    { header: 'Actual', key: 'actual', width: 36 },
  ];
  headerRow(
    ws,
    1,
    ws.columns.map((c) => String(c.header)),
  );
  r.cases.forEach((c, i) => {
    c.steps.forEach((s, k) => {
      const row = ws.addRow({
        no: i + 1,
        id: c.displayId,
        title: c.title,
        step: k + 1,
        shared: s.sharedStepName ?? '',
        action: s.action,
        expected: s.expected,
        status: s.status === 'untested' ? null : RESULT_EXPORT_LABELS[s.status],
        actual: s.actual,
      });
      row.alignment = { ...TOP_WRAP };
      finishRow(row, s.status);
    });
  });
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, ws.rowCount), column: ws.columns.length },
  };
}

/** Writes the Summary sheet top-down; `row` is the next free row. */
class SummaryWriter {
  row = 4;

  constructor(private readonly ws: Worksheet) {}

  keyValue(key: string, value: CellValue, numFmt?: string): void {
    this.ws.mergeCells(this.row, 2, this.row, 10);
    const k = this.ws.getCell(this.row, 1);
    k.value = key;
    k.font = { bold: true };
    k.alignment = { vertical: 'top' };
    k.border = BOX;
    fill(k, LABEL_FILL);
    const v = this.ws.getCell(this.row, 2);
    v.value = value === '' ? null : value;
    v.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
    v.border = BOX;
    if (numFmt) v.numFmt = numFmt;
    this.row++;
  }

  title(text: string): void {
    this.row++;
    sectionTitle(this.ws, this.row++, text);
  }

  header(labels: string[]): void {
    headerRow(this.ws, this.row++, labels);
  }

  /** Bold label + percentage formula (cached result for viewers that do not recalculate). */
  ratio(text: string, formula: string, value: number | null): void {
    const a = this.ws.getCell(this.row, 1);
    a.value = text;
    a.font = { bold: true };
    a.border = BOX;
    const b = this.ws.getCell(this.row, 2);
    b.value = { formula, result: value ?? '—' };
    b.numFmt = '0.0%';
    b.font = { bold: true };
    b.border = BOX;
    this.row++;
  }
}

/**
 * Status table: live formulas over the Results sheet (cached values for viewers that do not
 * recalculate). Untested = total − executed, so an empty run counts 0 everywhere.
 */
function statusTable(w: SummaryWriter, ws: Worksheet, r: RunReportDTO): void {
  w.title('Results by status');
  w.header(['Status', 'Count', 'Share']);
  const last = Math.max(2, r.cases.length + 1);
  const statusRange = `${RESULTS_SHEET}!$${STATUS_COL}$2:$${STATUS_COL}$${last}`;
  const total = totalOf(r.counts);
  const first = w.row;
  const rowOf = {} as Record<ResultStatus | 'total', number>;
  for (const [i, s] of EXECUTED_ORDER.entries()) rowOf[s] = first + i;
  rowOf.untested = first + EXECUTED_ORDER.length;
  rowOf.total = rowOf.untested + 1;
  const statusRow = (key: ResultStatus | 'total', text: string, formula: string, value: number) => {
    const rr = rowOf[key];
    const a = ws.getCell(rr, 1);
    a.value = text;
    a.border = BOX;
    const b = ws.getCell(rr, 2);
    b.value = { formula, result: value };
    b.border = BOX;
    const c = ws.getCell(rr, 3);
    c.value = {
      formula: `IF($B$${rowOf.total}=0,0,B${rr}/$B$${rowOf.total})`,
      result: total === 0 ? 0 : value / total,
    };
    c.numFmt = '0.0%';
    c.border = BOX;
    if (key === 'total') {
      a.font = { bold: true };
      b.font = { bold: true };
    } else if (STATUS_FILL[key]) {
      fill(a, STATUS_FILL[key]);
    }
  };
  for (const s of EXECUTED_ORDER) {
    statusRow(
      s,
      statusLabel(s),
      `COUNTIF(${statusRange},"${RESULT_EXPORT_LABELS[s]}")`,
      r.counts[s],
    );
  }
  statusRow(
    'untested',
    'Untested',
    `B${rowOf.total}-SUM(B${first}:B${rowOf.untested - 1})`,
    r.counts.untested,
  );
  statusRow('total', 'Total', `COUNTA(${RESULTS_SHEET}!$A$2:$A$${last})`, total);
  w.row = rowOf.total + 1;
  const passed = `B${rowOf.ok}+B${rowOf.ok_cond}`;
  const judged = `${passed}+B${rowOf.ng}+B${rowOf.blocked}`;
  w.ratio('Pass rate', `IF((${judged})=0,"—",(${passed})/(${judged}))`, passRateOf(r.counts));
  w.ratio(
    'Progress',
    `IF(B${rowOf.total}=0,0,(B${rowOf.total}-B${rowOf.untested})/B${rowOf.total})`,
    r.progress,
  );
}

function sectionTable(w: SummaryWriter, ws: Worksheet, r: RunReportDTO): void {
  if (r.sections.length === 0) return;
  w.title('Results by section');
  w.header([
    'Section',
    'Total',
    ...EXECUTED_ORDER.map((s) => statusLabel(s)),
    'Untested',
    'Pass rate',
  ]);
  for (const s of r.sections) {
    const values: (string | number | null)[] = [
      s.path.join(' / ') || '(No section)',
      totalOf(s.counts),
      ...EXECUTED_ORDER.map((st) => s.counts[st]),
      s.counts.untested,
      passRateOf(s.counts),
    ];
    values.forEach((v, i) => {
      const cell = ws.getCell(w.row, i + 1);
      cell.value = v === null ? '—' : v;
      cell.border = BOX;
      if (i === values.length - 1 && v !== null) cell.numFmt = '0.0%';
    });
    w.row++;
  }
}

function defectTable(w: SummaryWriter, ws: Worksheet, r: RunReportDTO): void {
  if (r.defects.length === 0) return;
  w.title('Defects');
  // Columns: A defect key, B:E title (merged), F status, G severity, H:I Jira (merged).
  const defectRow = (values: [string, string, string, string, string], header: boolean) => {
    ws.mergeCells(w.row, 2, w.row, 5);
    ws.mergeCells(w.row, 8, w.row, 9);
    ([1, 2, 6, 7, 8] as const).forEach((col, i) => {
      const cell = ws.getCell(w.row, col);
      cell.value = values[i] === '' ? null : values[i];
      cell.border = BOX;
      cell.alignment = { vertical: 'top', wrapText: true };
      if (header) {
        cell.font = { bold: true };
        fill(cell, HEADER_FILL);
      }
    });
    w.row++;
  };
  defectRow(['Defect', 'Title', 'Status', 'Severity', 'Jira'], true);
  for (const d of r.defects) {
    const jira = d.externalKey
      ? `${d.externalKey}${d.externalStatus ? ` (${d.externalStatus})` : ''}`
      : '';
    defectRow(
      [d.key, d.title, DEFECT_STATUS_LABELS[d.status], DEFECT_SEVERITY_LABELS[d.severity], jira],
      false,
    );
  }
}

function fillSummary(ws: Worksheet, r: RunReportDTO): void {
  const tz = r.timezone;
  ws.columns = [{ width: 24 }, ...Array.from({ length: 9 }, () => ({ width: 13 }))] as Column[];
  ws.mergeCells('A1:J1');
  const title = ws.getCell('A1');
  title.value = `Test run report — ${r.run.code}`;
  title.font = { bold: true, size: 16, color: { argb: 'FF1F4E79' } };
  ws.getRow(1).height = 26;
  ws.mergeCells('A2:J2');
  const subtitle = ws.getCell('A2');
  subtitle.value = `${r.plan.docNo} — ${r.plan.title}`;
  subtitle.font = { italic: true, color: { argb: 'FF595959' } };

  const w = new SummaryWriter(ws);
  w.keyValue('Project', `${r.project.key} — ${r.project.name}`);
  w.keyValue('Test plan', `${r.plan.docNo} — ${r.plan.title}`);
  w.keyValue('Plan status', PLAN_STATUS_LABELS[r.plan.status]);
  w.keyValue('Release', r.plan.release?.name ?? '');
  w.keyValue('Test run', r.run.code);
  w.keyValue('Scenario', r.run.scenario ?? '');
  w.keyValue('Build', r.run.build?.name ?? '');
  w.keyValue('Suite', `${r.run.suite.name} (${r.run.suite.prefix})`);
  w.keyValue('Re-run of', r.run.sourceRun?.code ?? '');
  w.keyValue('Tester', r.run.tester?.displayName ?? '');
  w.keyValue('Tested date', excelCalendarDate(r.run.testedDate), 'yyyy-mm-dd');
  w.keyValue('Judgement', judgementText(r.run.judgement));
  w.keyValue('Suggested judgement', judgementText(r.run.suggestedJudgement));
  w.keyValue('Judgement note', r.run.judgementNote ?? '');
  w.keyValue('Remark', r.run.remark ?? '');
  w.keyValue('Created', excelLocalDate(r.run.createdAt, tz), 'yyyy-mm-dd hh:mm');
  w.keyValue('First executed', excelLocalDate(r.firstExecutedAt, tz), 'yyyy-mm-dd hh:mm');
  w.keyValue('Last executed', excelLocalDate(r.lastExecutedAt, tz), 'yyyy-mm-dd hh:mm');
  w.keyValue(
    'Estimate',
    `${formatMinutes(r.estimate.totalMinutes) || '0m'} total, ${formatMinutes(r.estimate.remainingMinutes) || '0m'} remaining`,
  );
  w.keyValue('Actual duration', formatDuration(r.actualDurationSec) || '0:00');
  w.keyValue('Generated', `${dateTimeInZone(r.generatedAt, tz)} by ${r.generatedBy.displayName}`);
  w.keyValue('Time zone', tz);

  w.title('Environment');
  if (r.run.environment.length === 0) w.keyValue('(none)', '');
  for (const e of r.run.environment) w.keyValue(e.label, e.value);

  statusTable(w, ws, r);
  sectionTable(w, ws, r);
  defectTable(w, ws, r);
}

/** The run report workbook (Summary, Results and — with step cases — Steps). */
export async function runReportWorkbook(r: RunReportDTO): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Test Management Tool';
  wb.created = new Date();
  wb.title = `Run report ${r.run.code}`;
  const summary = wb.addWorksheet('Summary', {
    views: [{ showGridLines: false }],
    pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  const results = wb.addWorksheet(RESULTS_SHEET, {
    views: [{ state: 'frozen', ySplit: 1 }],
    pageSetup: TABLE_PAGE,
  });
  const steps = r.cases.some((c) => c.steps.length > 0)
    ? wb.addWorksheet('Steps', { views: [{ state: 'frozen', ySplit: 1 }], pageSetup: TABLE_PAGE })
    : null;
  fillResults(results, r);
  if (steps) fillSteps(steps, r);
  fillSummary(summary, r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

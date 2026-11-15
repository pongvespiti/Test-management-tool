import { ExcelJS, type Worksheet } from '@tmt/excel';

/** One stand read from the lab's stand sheet. */
export interface SheetStand {
  zone: string;
  code: string;
  model: string | null;
  inCharge: string | null;
  /** Request / Replace / Target of the sheet, kept as a note. */
  note: string | null;
}

export interface SheetReadResult {
  stands: SheetStand[];
  warnings: string[];
}

const LABELS = {
  stand: /^stand\s*no\.?$/i,
  model: /^model(\s*name)?$/i,
  inCharge: /^in\s*charge$/i,
  request: /^request$/i,
  replace: /^replace$/i,
  target: /^target$/i,
};
const ZONE = /^zone\b/i;
/** Columns of a block (label column included) when a row has only one block. */
const DEFAULT_BLOCK_WIDTH = 7;
/** Values the lab writes for "nothing". */
const EMPTY = /^[-.\s]*$/;

function text(ws: Worksheet, row: number, col: number): string {
  const cell = ws.getRow(row).getCell(col);
  // A value merged down over several rows (a grey "IoT" block) belongs to its first row only.
  if (cell.isMerged && Number(cell.master.row) !== row) return '';
  const v = cell.isMerged ? cell.master.value : cell.value;
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    const d = v;
    return `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`;
  }
  if (typeof v === 'object') {
    if ('richText' in v)
      return v.richText
        .map((t) => t.text)
        .join('')
        .trim();
    if ('result' in v && v.result !== undefined) return String(v.result).trim();
    if ('text' in v) return String(v.text).trim();
    return '';
  }
  return String(v).trim();
}

const valueOrNull = (s: string) => (EMPTY.test(s) ? null : s);

/** Columns of the cells in `row` that start a value (merged cells count once). */
function masterColumns(ws: Worksheet, row: number, from: number, to: number): number[] {
  const cols: number[] = [];
  for (let c = from; c <= to; c++) {
    const cell = ws.getRow(row).getCell(c);
    if (cell.isMerged && cell.master.address !== cell.address) continue;
    if (text(ws, row, c) !== '') cols.push(c);
  }
  return cols;
}

/**
 * Reads the lab's stand sheet: blocks with "Stand No." in a label column, the stand codes to its
 * right and Model Name / In charge / Request / Replace / Target below; the zone is the nearest
 * "Zone …" heading above the block. Empty stand blocks (no code) are skipped.
 */
export function readStandSheet(ws: Worksheet): SheetReadResult {
  const stands: SheetStand[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  const lastRow = Math.min(ws.rowCount, 2000);
  const lastCol = Math.min(ws.columnCount, 200);

  for (let r = 1; r <= lastRow; r++) {
    const labelCols: number[] = [];
    for (let c = 1; c <= lastCol; c++) if (LABELS.stand.test(text(ws, r, c))) labelCols.push(c);
    // Blocks of a row are equally wide; the last one is as wide as the others, so a table further
    // right on the sheet (e.g. an install history) is not read as stands.
    const gaps = labelCols.slice(1).map((c, i) => c - labelCols[i]!);
    const width = gaps.length > 0 ? Math.min(...gaps) : DEFAULT_BLOCK_WIDTH;
    labelCols.forEach((labelCol, i) => {
      const end = Math.min((labelCols[i + 1] ?? lastCol + 1) - 1, labelCol + width - 1);
      // Rows of the labels below "Stand No." in the label column.
      const rowOf: Partial<Record<keyof typeof LABELS, number>> = {};
      for (let rr = r + 1; rr <= Math.min(r + 8, lastRow); rr++) {
        const label = text(ws, rr, labelCol);
        for (const [key, re] of Object.entries(LABELS) as [keyof typeof LABELS, RegExp][]) {
          if (key !== 'stand' && rowOf[key] === undefined && re.test(label)) rowOf[key] = rr;
        }
      }
      const codeCols = masterColumns(ws, r, labelCol + 1, end).filter(
        (c) => valueOrNull(text(ws, r, c)) !== null,
      );
      if (codeCols.length === 0) return;
      const zone = zoneAbove(ws, r, [labelCol, ...codeCols]);
      for (const col of codeCols) {
        const code = text(ws, r, col);
        if (seen.has(code.toLowerCase())) {
          warnings.push(`Stand ${code} appears more than once; the first one is used`);
          continue;
        }
        seen.add(code.toLowerCase());
        const at = (key: keyof typeof LABELS) =>
          rowOf[key] === undefined ? null : valueOrNull(text(ws, rowOf[key]!, col));
        const noteParts = [
          ['Request', at('request')],
          ['Replace', at('replace')],
          ['Target', at('target')],
        ]
          .filter(([, v]) => v !== null)
          .map(([k, v]) => `${k}: ${v}`);
        if (!zone) warnings.push(`No "Zone …" heading above stand ${code}`);
        stands.push({
          zone: zone ?? 'No zone',
          code: code.slice(0, 40),
          model: at('model')?.slice(0, 80) ?? null,
          inCharge: at('inCharge')?.slice(0, 100) ?? null,
          note: noteParts.length > 0 ? noteParts.join('; ') : null,
        });
      }
    });
  }
  return { stands, warnings };
}

function zoneAbove(ws: Worksheet, row: number, cols: number[]): string | null {
  for (let r = row - 1; r >= 1 && r >= row - 40; r--) {
    for (const c of cols) {
      const v = text(ws, r, c);
      if (ZONE.test(v)) return v.slice(0, 60);
    }
  }
  return null;
}

/** The sheet named "Stand" (any case), else the first sheet. */
export async function readStandWorkbook(buffer: Buffer): Promise<SheetReadResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const ws = wb.worksheets.find((w) => w.name.trim().toLowerCase() === 'stand') ?? wb.worksheets[0];
  if (!ws) return { stands: [], warnings: ['The workbook has no sheets'] };
  return readStandSheet(ws);
}

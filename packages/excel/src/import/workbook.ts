import type { ImportSheetInfo } from '@tmt/shared';
import { ExcelJS, type Worksheet } from '../cjs';
import { cellText } from './cell-text';
import { parseCsv } from './csv';
import { ImportFormatError } from './errors';
import { Grid, parseRange, type MergeRange } from './grid';
import { assertSafeZip, looksLikeZip } from './zip-guard';

/** Import limits: larger sheets are cut and reported as truncated. */
export const MAX_IMPORT_ROWS = 20_000;
export const MAX_IMPORT_COLS = 200;

export type SheetState = ImportSheetInfo['state'];

interface SheetSource {
  name: string;
  state: SheetState;
  build(): Grid;
}

/** A parsed upload: one or more sheets, each readable as a {@link Grid}. */
export class SourceWorkbook {
  readonly fileName: string;
  readonly kind: 'xlsx' | 'csv';
  private readonly sources: SheetSource[];
  private readonly cache = new Map<string, Grid>();

  constructor(fileName: string, kind: 'xlsx' | 'csv', sources: SheetSource[]) {
    this.fileName = fileName;
    this.kind = kind;
    this.sources = sources;
  }

  get sheetNames(): string[] {
    return this.sources.map((s) => s.name);
  }

  hasSheet(name: string): boolean {
    return this.sources.some((s) => s.name === name);
  }

  sheetState(name: string): SheetState {
    return this.source(name).state;
  }

  grid(name: string): Grid {
    let g = this.cache.get(name);
    if (!g) {
      g = this.source(name).build();
      this.cache.set(name, g);
    }
    return g;
  }

  private source(name: string): SheetSource {
    const s = this.sources.find((x) => x.name === name);
    if (!s)
      throw new ImportFormatError('SHEET_NOT_FOUND', `Sheet "${name}" was not found in the file`);
    return s;
  }
}

/** Reads an uploaded `.xlsx`/`.xlsm` or `.csv` file. */
export async function readUpload(buffer: Buffer, fileName: string): Promise<SourceWorkbook> {
  const ext = (/\.[^.]+$/.exec(fileName.toLowerCase())?.[0] ?? '').trim();
  if (ext === '.csv' || ext === '.txt') return readCsv(buffer, fileName);
  if (ext === '.xls') {
    throw new ImportFormatError(
      'UNSUPPORTED_FILE_TYPE',
      'Old .xls workbooks cannot be imported — open the file in Excel and save it as .xlsx',
    );
  }
  if (ext === '.xlsx' || ext === '.xlsm' || (ext === '' && looksLikeZip(buffer))) {
    return readXlsx(buffer, fileName);
  }
  throw new ImportFormatError('UNSUPPORTED_FILE_TYPE', 'Only .xlsx and .csv files can be imported');
}

/** Sheet list for the import wizard. */
export function listSheets(wb: SourceWorkbook): ImportSheetInfo[] {
  return wb.sheetNames.map((name) => {
    const g = wb.grid(name);
    return { name, state: wb.sheetState(name), rowCount: g.rowCount, columnCount: g.colCount };
  });
}

/** Grid of one sheet (merged cells resolved). */
export function getGrid(wb: SourceWorkbook, sheetName: string): Grid {
  return wb.grid(sheetName);
}

async function readXlsx(buffer: Buffer, fileName: string): Promise<SourceWorkbook> {
  if (!looksLikeZip(buffer)) {
    throw new ImportFormatError('CORRUPT_FILE', 'The file is not a valid .xlsx workbook');
  }
  const entries = assertSafeZip(buffer);
  if (!entries.some((name) => name.toLowerCase() === 'xl/workbook.xml')) {
    throw new ImportFormatError('CORRUPT_FILE', 'The file is not a valid .xlsx workbook');
  }
  const wb = new ExcelJS.Workbook();
  try {
    // ExcelJS's typings expect its own Buffer type; a Node Buffer is what it actually reads.
    await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0]);
  } catch {
    throw new ImportFormatError(
      'CORRUPT_FILE',
      'The workbook could not be read — is it a valid .xlsx file?',
    );
  }
  const sources: SheetSource[] = wb.worksheets.map((ws) => ({
    name: ws.name,
    state: normaliseState(ws.state),
    build: () => gridFromWorksheet(ws),
  }));
  if (sources.length === 0) throw new ImportFormatError('EMPTY_FILE', 'The workbook has no sheets');
  return new SourceWorkbook(fileName, 'xlsx', sources);
}

function normaliseState(state: string | undefined): SheetState {
  if (state === 'hidden') return 'hidden';
  if (state === 'veryHidden') return 'veryHidden';
  return 'visible';
}

function readCsv(buffer: Buffer, fileName: string): SourceWorkbook {
  const text = decodeText(buffer);
  const rows = parseCsv(text);
  const name = fileName.replace(/\.[^.]+$/, '').slice(0, 100) || 'CSV';
  const capped = rows.slice(0, MAX_IMPORT_ROWS).map((r) => r.slice(0, MAX_IMPORT_COLS));
  const truncated = rows.length > MAX_IMPORT_ROWS || rows.some((r) => r.length > MAX_IMPORT_COLS);
  return new SourceWorkbook(fileName, 'csv', [
    {
      name,
      state: 'visible',
      build: () => {
        const g = Grid.fromRows(capped);
        if (!truncated) return g;
        return new Grid({
          values: gridValues(g),
          merges: [],
          rowCount: g.rowCount,
          colCount: g.colCount,
          truncated: true,
        });
      },
    },
  ]);
}

function gridValues(g: Grid): Map<number, string> {
  const values = new Map<number, string>();
  for (let r = 1; r <= g.rowCount; r++) {
    for (let c = 1; c <= g.colCount; c++) {
      const t = g.ownText(r, c);
      if (t !== '') values.set(Grid.key(r, c), t);
    }
  }
  return values;
}

/** UTF-8 (with or without BOM); falls back to Windows-874 (Thai Excel "CSV") and then Latin-1. */
function decodeText(buffer: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    for (const enc of ['windows-874', 'latin1']) {
      try {
        return new TextDecoder(enc).decode(buffer);
      } catch {
        // encoding not available in this runtime — try the next one
      }
    }
    return buffer.toString('latin1');
  }
}

function worksheetMerges(ws: Worksheet): MergeRange[] {
  const internal = (ws as unknown as { _merges?: Record<string, { model?: MergeRange }> })._merges;
  if (internal && typeof internal === 'object') {
    const out: MergeRange[] = [];
    for (const range of Object.values(internal)) {
      const m = range?.model;
      if (m && m.top && m.left && m.bottom && m.right) {
        out.push({ top: m.top, left: m.left, bottom: m.bottom, right: m.right });
      }
    }
    return out;
  }
  const model = (ws as unknown as { model?: { merges?: string[] } }).model;
  return (model?.merges ?? []).map(parseRange);
}

function gridFromWorksheet(ws: Worksheet): Grid {
  const merges = worksheetMerges(ws);
  const slave = new Set<number>();
  for (const m of merges) {
    for (let r = m.top; r <= m.bottom; r++) {
      for (let c = m.left; c <= m.right; c++) {
        if (r !== m.top || c !== m.left) slave.add(Grid.key(r, c));
      }
    }
  }
  const values = new Map<number, string>();
  let rowCount = 0;
  let colCount = 0;
  let truncated = false;
  ws.eachRow({ includeEmpty: false }, (row, r) => {
    if (r > MAX_IMPORT_ROWS) {
      truncated = true;
      return;
    }
    row.eachCell({ includeEmpty: false }, (cell, c) => {
      if (c > MAX_IMPORT_COLS) {
        truncated = true;
        return;
      }
      if (slave.has(Grid.key(r, c))) return;
      const text = cellText(cell.value, cell.numFmt);
      if (text.trim() === '') return;
      values.set(Grid.key(r, c), text);
      if (r > rowCount) rowCount = r;
      if (c > colCount) colCount = c;
    });
  });
  const kept = merges.filter((m) => m.top <= MAX_IMPORT_ROWS && m.left <= MAX_IMPORT_COLS);
  return new Grid({ values, merges: kept, rowCount, colCount, truncated });
}

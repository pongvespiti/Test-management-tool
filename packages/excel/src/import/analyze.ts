import {
  normalizeLine,
  slugKey,
  type ColumnMapping,
  type FieldDef,
  type ImportAnalysisDTO,
  type ImportColumnInfo,
  type ImportTarget,
} from '@tmt/shared';
import {
  detectEnvBlock,
  detectHeaderRow,
  tableShape,
  type TableColumn,
  type TableShape,
} from './detect';
import { ImportFormatError } from './errors';
import type { Grid } from './grid';
import { canon, detectLayout, targetFor } from './synonyms';
import { listSheets, type SourceWorkbook } from './workbook';

export type SheetAnalysis = Omit<ImportAnalysisDTO, 'uploadId' | 'fileName'>;

export interface AnalyzeOptions {
  sheet?: string;
  headerRow?: number;
  /** Custom fields of the target suite, so matching headers map to existing fields. */
  fieldDefs?: FieldDef[];
}

/** Targets that may be suggested for one column only. */
const SINGLE_USE = new Set<ImportTarget>([
  'section',
  'section_code',
  'code',
  'title',
  'type',
  'precondition',
  'procedure',
  'expected',
  'remark',
  'summary_group',
  'priority',
  'tags',
  'estimate',
  'references',
]);

const SAMPLE_COUNT = 3;
const SAMPLE_LENGTH = 80;

/** Analyses one sheet for the import wizard: header row, layout, column suggestions, env block. */
export function analyzeSheet(wb: SourceWorkbook, opts: AnalyzeOptions = {}): SheetAnalysis {
  const sheets = listSheets(wb);
  const sheet = opts.sheet ?? pickSheet(wb);
  if (!wb.hasSheet(sheet)) {
    throw new ImportFormatError('SHEET_NOT_FOUND', `Sheet "${sheet}" was not found in the file`);
  }
  const grid = wb.grid(sheet);
  const detection = detectHeaderRow(grid);
  const headerRow = opts.headerRow ?? detection.row;
  const shape = tableShape(grid, headerRow);
  const layout = detectLayout(shape.columns.map((c) => c.header).filter((h) => h !== ''));
  const columns = suggestColumns(grid, shape, layout, opts.fieldDefs ?? []);
  const headerCandidates = detection.candidates.includes(headerRow)
    ? detection.candidates
    : [headerRow, ...detection.candidates].slice(0, 5);
  return {
    sheets,
    sheet,
    headerRow,
    headerCandidates,
    layout,
    columns,
    envBlock: detectEnvBlock(grid, headerRow),
    dataRowCount: countDataRows(grid, shape),
  };
}

/** Sheet names the team uses for summaries, references and covers (listed, never auto-selected). */
const AUX_SHEET = /summary|refer|cover|evident|history|revision|^env$/i;

/**
 * Most likely sheet with test cases: visible first, then not a summary/refer/cover sheet, then a
 * detectable header (≥ 3 known headers), best header score, most data rows, first in the file.
 */
export function pickSheet(wb: SourceWorkbook): string {
  const ranked = wb.sheetNames.map((name, index) => {
    const grid = wb.grid(name);
    const det = detectHeaderRow(grid);
    const shape = tableShape(grid, det.row);
    return {
      name,
      index,
      visible: wb.sheetState(name) === 'visible',
      aux: AUX_SHEET.test(name),
      score: det.score,
      rows: Math.max(0, shape.lastDataRow - shape.dataStart + 1),
    };
  });
  ranked.sort(
    (a, b) =>
      Number(b.visible) - Number(a.visible) ||
      Number(a.aux) - Number(b.aux) ||
      Number(b.score >= 3) - Number(a.score >= 3) ||
      b.score - a.score ||
      b.rows - a.rows ||
      a.index - b.index,
  );
  return ranked[0]!.name;
}

function countDataRows(grid: Grid, shape: TableShape): number {
  let n = 0;
  for (let r = shape.dataStart; r <= shape.lastDataRow; r++) {
    if (!grid.rowIsEmpty(r, shape.firstCol, shape.lastCol)) n++;
  }
  return n;
}

function suggestColumns(
  grid: Grid,
  shape: TableShape,
  layout: ReturnType<typeof detectLayout>,
  fieldDefs: FieldDef[],
): ImportColumnInfo[] {
  const used = new Set<ImportTarget>();
  const firstLabeled = shape.columns.find((c) => c.header !== '')?.col ?? Number.MAX_SAFE_INTEGER;
  return shape.columns.map((col) => {
    const suggested = suggestFor(grid, shape, layout, col, fieldDefs, used, firstLabeled);
    if (SINGLE_USE.has(suggested.target)) used.add(suggested.target);
    return {
      col: col.col,
      letter: col.letter,
      header: col.header,
      span: col.span,
      samples: sampleValues(grid, shape, col.col),
      suggested,
    };
  });
}

function suggestFor(
  grid: Grid,
  shape: TableShape,
  layout: ReturnType<typeof detectLayout>,
  col: TableColumn,
  fieldDefs: FieldDef[],
  used: Set<ImportTarget>,
  firstLabeled: number,
): ImportColumnInfo['suggested'] {
  if (col.header === '') {
    if (col.col < firstLabeled && !used.has('section') && looksLikeCategory(grid, shape, col.col)) {
      return { target: 'section' };
    }
    return { target: 'ignore' };
  }
  const target = targetFor(layout, col.header);
  const existing = fieldDefs.find(
    (f) => canon(f.label) === canon(col.header) || f.key === slugKey(col.header),
  );
  if (target === null || target === 'new_custom') {
    if (existing) return { target: 'custom', customKey: existing.key };
    return { target: 'new_custom', newFieldLabel: col.header };
  }
  if (SINGLE_USE.has(target) && used.has(target)) {
    if (existing) return { target: 'custom', customKey: existing.key };
    return { target: 'new_custom', newFieldLabel: col.header };
  }
  // "Type" in other tools means Functional/Regression/…: keep it as a field instead of the case type.
  if (target === 'type' && !looksLikeCaseType(grid, shape, col.col)) {
    if (existing) return { target: 'custom', customKey: existing.key };
    return { target: 'new_custom', newFieldLabel: col.header };
  }
  return { target };
}

/** True unless most filled cells hold something other than Normal/Abnormal. */
function looksLikeCaseType(grid: Grid, shape: TableShape, col: number): boolean {
  let filled = 0;
  let other = 0;
  for (let r = shape.dataStart; r <= shape.lastDataRow; r++) {
    const t = normalizeLine(grid.text(r, col));
    if (!t) continue;
    filled++;
    if (!/^(ab)?normal\b/i.test(t)) other++;
  }
  return filled === 0 || other * 2 <= filled;
}

/** Turns the suggested targets of an analysis into a column mapping (the wizard's default). */
export function mappingFromAnalysis(columns: ImportColumnInfo[]): ColumnMapping[] {
  return columns.map((c) => {
    const m: ColumnMapping = { col: c.col, target: c.suggested.target };
    if (c.suggested.customKey) m.customKey = c.suggested.customKey;
    if (c.suggested.newFieldLabel) m.newFieldLabel = c.suggested.newFieldLabel;
    return m;
  });
}

/** A column looks like a category when it has vertical merges or repeats its values. */
function looksLikeCategory(grid: Grid, shape: TableShape, col: number): boolean {
  let nonEmpty = 0;
  const distinct = new Set<string>();
  for (let r = shape.dataStart; r <= shape.lastDataRow; r++) {
    const m = grid.merge(r, col);
    if (m && m.bottom > m.top && m.left === col && m.right === col) return true;
    const t = grid.ownText(r, col);
    if (t !== '') {
      nonEmpty++;
      distinct.add(t);
    }
  }
  return nonEmpty > 1 && distinct.size < nonEmpty;
}

function sampleValues(grid: Grid, shape: TableShape, col: number): string[] {
  const out: string[] = [];
  for (let r = shape.dataStart; r <= shape.lastDataRow && out.length < SAMPLE_COUNT; r++) {
    const t = normalizeLine(grid.text(r, col));
    if (!t) continue;
    const s = t.length > SAMPLE_LENGTH ? `${t.slice(0, SAMPLE_LENGTH - 1)}…` : t;
    if (!out.includes(s)) out.push(s);
  }
  return out;
}

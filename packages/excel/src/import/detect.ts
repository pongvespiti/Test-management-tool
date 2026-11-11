import type { ImportEnvBlock } from '@tmt/shared';
import { normalizeLine } from '@tmt/shared';
import { columnLetter, type Grid } from './grid';
import { canon, isEnvLabel, isKnownHeader, isRunLevelLabel } from './synonyms';

const HEADER_SCAN_ROWS = 80;
const MIN_HEADER_SCORE = 3;

export interface HeaderDetection {
  /** Best header row (1-based). */
  row: number;
  /** Best candidate rows, best first (at most 5). */
  candidates: number[];
  /** Number of known headers on the best row. */
  score: number;
}

/** Scores the first rows by known header words and returns the most likely header row (spec §7.3). */
export function detectHeaderRow(grid: Grid): HeaderDetection {
  const scored: { row: number; score: number }[] = [];
  const last = Math.min(grid.rowCount, HEADER_SCAN_ROWS);
  for (let r = 1; r <= last; r++) {
    let score = 0;
    for (let c = 1; c <= grid.colCount; c++) {
      const t = grid.ownText(r, c);
      if (t !== '' && t.length <= 80 && isKnownHeader(t)) score++;
    }
    if (score > 0) scored.push({ row: r, score });
  }
  scored.sort((a, b) => b.score - a.score || a.row - b.row);
  const good = scored.filter((s) => s.score >= MIN_HEADER_SCORE);
  if (good.length > 0) {
    return {
      row: good[0]!.row,
      candidates: good.slice(0, 5).map((s) => s.row),
      score: good[0]!.score,
    };
  }
  // Fallback: first row that has at least two filled cells (plain CSVs with unknown headers).
  for (let r = 1; r <= last; r++) {
    let filled = 0;
    for (let c = 1; c <= grid.colCount; c++) if (grid.ownText(r, c) !== '') filled++;
    if (filled >= 2) return { row: r, candidates: [r], score: 0 };
  }
  return { row: 1, candidates: [1], score: 0 };
}

export interface TableColumn {
  col: number;
  letter: string;
  /** Header text ('' for unlabeled data columns). */
  header: string;
  /** Sheet columns covered by a merged header. */
  span: number;
}

export interface TableShape {
  headerRow: number;
  /** Last row that belongs to the header (multi-row headers). */
  headerBottom: number;
  dataStart: number;
  lastDataRow: number;
  columns: TableColumn[];
  firstCol: number;
  lastCol: number;
}

/**
 * Works out the table under a header row: labeled columns (merged headers count once with their
 * span), unlabeled columns that hold data, multi-row headers, and the data row range.
 */
export function tableShape(grid: Grid, headerRow: number): TableShape {
  let headerBottom = headerRow;
  for (let c = 1; c <= grid.colCount; c++) {
    const m = grid.merge(headerRow, c);
    if (m && m.top === headerRow && grid.ownText(headerRow, c) !== '') {
      headerBottom = Math.max(headerBottom, m.bottom);
    }
  }
  const labeled: TableColumn[] = [];
  const covered = new Set<number>();
  if (headerBottom > headerRow) {
    // Multi-row header: one column per sheet column, header = parent / child texts.
    for (let c = 1; c <= grid.colCount; c++) {
      const parts: string[] = [];
      for (let r = headerRow; r <= headerBottom; r++) {
        const t = normalizeLine(grid.text(r, c));
        if (t && !parts.includes(t)) parts.push(t);
      }
      if (parts.length) {
        labeled.push({ col: c, letter: columnLetter(c), header: parts.join(' / '), span: 1 });
        covered.add(c);
      }
    }
  } else {
    for (let c = 1; c <= grid.colCount; c++) {
      const m = grid.merge(headerRow, c);
      if (m && m.left !== c) continue; // part of a merged header
      const header = normalizeLine(grid.ownText(headerRow, c));
      if (!header) continue;
      const span = m ? m.right - m.left + 1 : 1;
      labeled.push({ col: c, letter: columnLetter(c), header, span });
      for (let k = c; k < c + span; k++) covered.add(k);
    }
  }
  const dataStart = headerBottom + 1;
  const labeledFirst = labeled.length ? labeled[0]!.col : 1;
  const labeledLast = labeled.length
    ? Math.max(...labeled.map((col) => col.col + col.span - 1))
    : grid.colCount;

  // Last row that has any text inside the table columns (plus one column of slack on the left).
  let lastDataRow = headerBottom;
  for (let r = grid.rowCount; r >= dataStart; r--) {
    if (!grid.rowIsEmpty(r, Math.max(1, labeledFirst - 1), labeledLast)) {
      lastDataRow = r;
      break;
    }
  }

  // Unlabeled columns that carry data (e.g. a category column without a header).
  const unlabeled: TableColumn[] = [];
  for (let c = 1; c <= grid.colCount; c++) {
    if (covered.has(c)) continue;
    let hasData = false;
    for (let r = dataStart; r <= lastDataRow && !hasData; r++) {
      if (grid.ownText(r, c) !== '') {
        const m = grid.merge(r, c);
        // Ignore cells that are only the continuation of a wider merge starting in a labeled column.
        if (!m || m.left === c) hasData = true;
      }
    }
    if (hasData) unlabeled.push({ col: c, letter: columnLetter(c), header: '', span: 1 });
  }
  const columns = [...labeled, ...unlabeled].sort((a, b) => a.col - b.col);
  const firstCol = columns.length ? columns[0]!.col : 1;
  const lastCol = columns.length
    ? Math.max(...columns.map((col) => col.col + col.span - 1))
    : grid.colCount;
  return { headerRow, headerBottom, dataStart, lastDataRow, columns, firstCol, lastCol };
}

/**
 * Finds a "Test Result Information" block above the header: a column of environment labels with
 * one or more value columns to its right (spec §7.9). Run-level labels (tester, date, judgement,
 * remark) are dropped because runs have dedicated fields for them.
 */
export function detectEnvBlock(grid: Grid, headerRow: number): ImportEnvBlock | null {
  const lastRow = headerRow - 1;
  if (lastRow < 1) return null;
  let bestCol = -1;
  let bestHits: number[] = [];
  for (let c = 1; c <= grid.colCount; c++) {
    const hits: number[] = [];
    for (let r = 1; r <= lastRow; r++) {
      const t = grid.ownText(r, c);
      if (t !== '' && t.length <= 60 && isEnvLabel(t)) hits.push(r);
    }
    if (hits.length > bestHits.length) {
      bestHits = hits;
      bestCol = c;
    }
  }
  if (bestCol < 0 || bestHits.length < 3) return null;
  const top = bestHits[0]!;
  const bottom = bestHits[bestHits.length - 1]!;

  const labelRows: { row: number; label: string }[] = [];
  for (let r = top; r <= bottom; r++) {
    const label = normalizeLine(grid.ownText(r, bestCol));
    if (label && label.length <= 60) labelRows.push({ row: r, label });
  }

  const valueCols: number[] = [];
  let emptyRun = 0;
  for (let c = bestCol + 1; c <= Math.min(grid.colCount, bestCol + 12); c++) {
    const has = labelRows.some((lr) => grid.ownText(lr.row, c) !== '');
    if (has) {
      valueCols.push(c);
      emptyRun = 0;
    } else if (valueCols.length > 0 && ++emptyRun >= 2) {
      break;
    }
  }

  const kept = labelRows.filter((lr) => !isRunLevelLabel(lr.label));
  const seen = new Set<string>();
  const unique = kept.filter((lr) => {
    const k = canon(lr.label);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (unique.length === 0) return null;
  return {
    labels: unique.map((lr) => lr.label),
    columns: valueCols.map((c) => unique.map((lr) => normalizeLine(grid.ownText(lr.row, c)) ?? '')),
  };
}

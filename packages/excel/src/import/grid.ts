/** A merged cell range, 1-based and inclusive. */
export interface MergeRange {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

/** A merged range seen from one of its cells. */
export interface MergeInfo extends MergeRange {
  rowSpan: number;
  colSpan: number;
  /** True for the top-left cell, which holds the value. */
  isMaster: boolean;
}

const KEY_STRIDE = 16_385; // > max Excel column count

function key(r: number, c: number): number {
  return r * KEY_STRIDE + c;
}

export interface GridInit {
  /** Text of cells that hold a value (merge masters and normal cells). */
  values: Map<number, string>;
  merges: MergeRange[];
  rowCount: number;
  colCount: number;
  truncated: boolean;
}

/**
 * Read-only view of one sheet as text. Every cell inside a merged range reports the text of the
 * range's top-left (master) cell, so vertically merged categories and horizontally merged
 * "Expected Result" columns read naturally (spec §7.2).
 */
export class Grid {
  readonly rowCount: number;
  readonly colCount: number;
  /** True when the sheet was larger than the import limits and was cut. */
  readonly truncated: boolean;
  readonly merges: readonly MergeRange[];
  private readonly values: Map<number, string>;
  private readonly mergeIndex: Map<number, MergeRange>;

  constructor(init: GridInit) {
    this.values = init.values;
    this.merges = init.merges;
    this.rowCount = init.rowCount;
    this.colCount = init.colCount;
    this.truncated = init.truncated;
    this.mergeIndex = new Map();
    for (const m of init.merges) {
      for (let r = m.top; r <= m.bottom; r++) {
        for (let c = m.left; c <= m.right; c++) this.mergeIndex.set(key(r, c), m);
      }
    }
  }

  /** Builds a grid from plain rows (CSV, tests). Row/column numbers are 1-based. */
  static fromRows(rows: string[][], merges: MergeRange[] = []): Grid {
    const values = new Map<number, string>();
    let rowCount = 0;
    let colCount = 0;
    rows.forEach((row, ri) => {
      row.forEach((v, ci) => {
        const text = v.replace(/\r\n?/g, '\n');
        if (text !== '') {
          values.set(key(ri + 1, ci + 1), text);
          rowCount = Math.max(rowCount, ri + 1);
          colCount = Math.max(colCount, ci + 1);
        }
      });
    });
    return new Grid({ values, merges, rowCount, colCount, truncated: false });
  }

  static key(r: number, c: number): number {
    return key(r, c);
  }

  /** Text shown in the cell; cells inside a merged range return the master cell's text. */
  text(r: number, c: number): string {
    const m = this.mergeIndex.get(key(r, c));
    if (m) return this.values.get(key(m.top, m.left)) ?? '';
    return this.values.get(key(r, c)) ?? '';
  }

  /** Text stored in this very cell (non-master cells of a merge are empty). */
  ownText(r: number, c: number): string {
    const m = this.mergeIndex.get(key(r, c));
    if (m && (m.top !== r || m.left !== c)) return '';
    return this.values.get(key(r, c)) ?? '';
  }

  /** The merged range containing the cell, or null. */
  merge(r: number, c: number): MergeRange | null {
    return this.mergeIndex.get(key(r, c)) ?? null;
  }

  /** Merge information (range, row/column span, master flag) for a cell, or null when not merged. */
  mergeAt(r: number, c: number): MergeInfo | null {
    const m = this.merge(r, c);
    if (!m) return null;
    return {
      ...m,
      rowSpan: m.bottom - m.top + 1,
      colSpan: m.right - m.left + 1,
      isMaster: m.top === r && m.left === c,
    };
  }

  isMergeMaster(r: number, c: number): boolean {
    const m = this.merge(r, c);
    return m !== null && m.top === r && m.left === c;
  }

  /** True when no cell between `fromCol` and `toCol` (inclusive) has text. */
  rowIsEmpty(r: number, fromCol = 1, toCol = this.colCount): boolean {
    for (let c = fromCol; c <= toCol; c++) if (this.text(r, c).trim() !== '') return false;
    return true;
  }
}

/** Column number → letters (1 → A, 27 → AA). */
export function columnLetter(col: number): string {
  let n = col;
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Letters → column number (A → 1). */
export function columnNumber(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

/** Parses `B3` / `$B$3` into row/column numbers. */
export function parseAddress(address: string): { row: number; col: number } {
  const m = /^\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(address.trim());
  if (!m) throw new Error(`Invalid cell address: ${address}`);
  return { col: columnNumber(m[1]!), row: Number(m[2]) };
}

/** Parses `B3:D5` (or a single address) into a range. */
export function parseRange(ref: string): MergeRange {
  const [a, b] = ref.split(':');
  const start = parseAddress(a!);
  const end = b ? parseAddress(b) : start;
  return {
    top: Math.min(start.row, end.row),
    left: Math.min(start.col, end.col),
    bottom: Math.max(start.row, end.row),
    right: Math.max(start.col, end.col),
  };
}

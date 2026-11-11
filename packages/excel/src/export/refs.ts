/** Cell references, ranges and the row shifting caused by repeated table rows. */

export const MAX_ROWS = 1_048_576;

export function colToNumber(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

export function numberToCol(n: number): string {
  let s = '';
  let v = n;
  while (v > 0) {
    const rem = (v - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    v = Math.floor((v - 1) / 26);
  }
  return s;
}

export interface CellRef {
  col: number;
  row: number;
  colAbs: boolean;
  rowAbs: boolean;
}

export function parseCellRef(ref: string): CellRef | null {
  const m = /^(\$?)([A-Za-z]{1,3})(\$?)(\d+)$/.exec(ref.trim());
  if (!m) return null;
  return { colAbs: m[1] === '$', col: colToNumber(m[2]!), rowAbs: m[3] === '$', row: Number(m[4]) };
}

export function formatCellRef(c: CellRef): string {
  return `${c.colAbs ? '$' : ''}${numberToCol(c.col)}${c.rowAbs ? '$' : ''}${c.row}`;
}

export function cellAddress(col: number, row: number): string {
  return `${numberToCol(col)}${row}`;
}

/** A rectangular range, 1-based and inclusive. */
export interface Box {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

/** `A1:B3` or `A1` → box (no `$`, no sheet name). */
export function parseBox(ref: string): Box | null {
  const [a, b] = ref.split(':');
  const s = parseCellRef(a ?? '');
  const e = b === undefined ? s : parseCellRef(b);
  if (!s || !e) return null;
  return {
    top: Math.min(s.row, e.row),
    left: Math.min(s.col, e.col),
    bottom: Math.max(s.row, e.row),
    right: Math.max(s.col, e.col),
  };
}

export function formatBox(b: Box): string {
  const a = cellAddress(b.left, b.top);
  return b.top === b.bottom && b.left === b.right ? a : `${a}:${cellAddress(b.right, b.bottom)}`;
}

/**
 * Row mapping of one sheet after table rows were repeated: original template row `row` became
 * `count` rows; everything below moved down. `start(r)` is the first output row of original row r,
 * `end(r)` its last (they differ only for template rows).
 */
export class RowMap {
  private readonly blocks: { row: number; count: number }[];

  constructor(blocks: { row: number; count: number }[] = []) {
    this.blocks = [...blocks].sort((a, b) => a.row - b.row);
  }

  get isIdentity(): boolean {
    return this.blocks.every((b) => b.count === 1);
  }

  get inserted(): number {
    return this.blocks.reduce((n, b) => n + b.count - 1, 0);
  }

  start(row: number): number {
    let r = row;
    for (const b of this.blocks) {
      if (b.row < row) r += b.count - 1;
      else break;
    }
    return r;
  }

  end(row: number): number {
    const block = this.blocks.find((b) => b.row === row);
    return this.start(row) + (block ? block.count - 1 : 0);
  }

  /** Ranges grow when they include a repeated row, and move with the rows below. */
  mapBox(b: Box): Box {
    return { top: this.start(b.top), bottom: this.end(b.bottom), left: b.left, right: b.right };
  }

  /** Space-separated list of ranges (`sqref`). */
  mapSqref(sqref: string): string {
    if (this.isIdentity) return sqref;
    return sqref
      .split(/\s+/)
      .filter(Boolean)
      .map((ref) => {
        const box = parseBox(ref.replace(/\$/g, ''));
        return box ? formatBox(this.mapBox(box)) : ref;
      })
      .join(' ');
  }
}

// ------------------------------------------------------------------ formulas

/** Cell, cell range, row range or column range, optionally sheet-qualified, outside string literals. */
const TOKEN_RE =
  /(?<![\w.$'\]!])((?:'(?:[^']|'')+'|[A-Za-z_][\w.]*)!)?(\$?[A-Z]{1,3}\$?\d+(?::\$?[A-Z]{1,3}\$?\d+)?|\$?\d+:\$?\d+|\$?[A-Z]{1,3}:\$?[A-Z]{1,3})(?![\w(!:])/g;

function mapOutsideStrings(formula: string, fn: (segment: string) => string): string {
  let out = '';
  let pos = 0;
  for (const m of formula.matchAll(/"(?:[^"]|"")*"/g)) {
    out += fn(formula.slice(pos, m.index)) + m[0];
    pos = m.index! + m[0].length;
  }
  return out + fn(formula.slice(pos));
}

function unquote(qualifier: string): string {
  const q = qualifier.slice(0, -1); // drop '!'
  return q.startsWith("'") ? q.slice(1, -1).replace(/''/g, "'") : q;
}

interface ShiftOptions {
  /** Shift only references qualified with one of these sheet names (defined names); default: only unqualified ones. */
  sheets?: string[];
}

/**
 * Moves references after rows were inserted (like Excel's "insert rows"): absolute and relative
 * references to moved rows are updated; ranges that include a repeated row grow.
 */
export function shiftFormula(formula: string, map: RowMap, opts: ShiftOptions = {}): string {
  if (map.isIdentity) return formula;
  const wanted = opts.sheets?.map((s) => s.toLowerCase());
  return mapOutsideStrings(formula, (seg) =>
    seg.replace(TOKEN_RE, (m, qualifier: string | undefined, ref: string) => {
      if (wanted) {
        if (!qualifier || !wanted.includes(unquote(qualifier).toLowerCase())) return m;
      } else if (qualifier) {
        return m;
      }
      return (qualifier ?? '') + shiftRef(ref, map);
    }),
  );
}

function shiftRef(ref: string, map: RowMap): string {
  const rows = /^(\$?)(\d+):(\$?)(\d+)$/.exec(ref);
  if (rows) {
    return `${rows[1]}${map.start(Number(rows[2]))}:${rows[3]}${map.end(Number(rows[4]))}`;
  }
  if (/^\$?[A-Z]{1,3}:\$?[A-Z]{1,3}$/.test(ref)) return ref;
  const [a, b] = ref.split(':');
  const s = parseCellRef(a!)!;
  if (b === undefined) return formatCellRef({ ...s, row: map.start(s.row) });
  const e = parseCellRef(b)!;
  return `${formatCellRef({ ...s, row: map.start(s.row) })}:${formatCellRef({ ...e, row: map.end(e.row) })}`;
}

/** Copies a formula `dRow` rows down / `dCol` columns right (relative parts only), like fill-down. */
export function translateFormula(formula: string, dRow: number, dCol: number): string {
  if (dRow === 0 && dCol === 0) return formula;
  return mapOutsideStrings(formula, (seg) =>
    seg.replace(TOKEN_RE, (m, qualifier: string | undefined, ref: string) => {
      const out = translateRef(ref, dRow, dCol);
      return out === null ? '#REF!' : (qualifier ?? '') + out;
    }),
  );
}

function translateRef(ref: string, dRow: number, dCol: number): string | null {
  const rows = /^(\$?)(\d+):(\$?)(\d+)$/.exec(ref);
  if (rows) {
    const r1 = rows[1] ? Number(rows[2]) : Number(rows[2]) + dRow;
    const r2 = rows[3] ? Number(rows[4]) : Number(rows[4]) + dRow;
    return r1 < 1 || r2 < 1 ? null : `${rows[1]}${r1}:${rows[3]}${r2}`;
  }
  const cols = /^(\$?)([A-Z]{1,3}):(\$?)([A-Z]{1,3})$/.exec(ref);
  if (cols) {
    const c1 = cols[1] ? colToNumber(cols[2]!) : colToNumber(cols[2]!) + dCol;
    const c2 = cols[3] ? colToNumber(cols[4]!) : colToNumber(cols[4]!) + dCol;
    return c1 < 1 || c2 < 1 ? null : `${cols[1]}${numberToCol(c1)}:${cols[3]}${numberToCol(c2)}`;
  }
  const parts = ref.split(':').map((p) => {
    const c = parseCellRef(p)!;
    const moved = {
      ...c,
      row: c.rowAbs ? c.row : c.row + dRow,
      col: c.colAbs ? c.col : c.col + dCol,
    };
    return moved.row < 1 || moved.col < 1 || moved.row > MAX_ROWS ? null : formatCellRef(moved);
  });
  return parts.includes(null) ? null : parts.join(':');
}

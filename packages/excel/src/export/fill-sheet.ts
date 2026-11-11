import { findPlaceholders, PLACEHOLDER_RE, type Placeholder } from './placeholders';
import {
  cellAddress,
  colToNumber,
  formatBox,
  parseBox,
  RowMap,
  shiftFormula,
  translateFormula,
  type Box,
} from './refs';
import type { CellScalar, TableItem } from './report-data';
import type { StyleBook } from './styles';
import {
  escapeXml,
  findElement,
  getAttr,
  openTagAttrs,
  replaceElements,
  setAttr,
  stringItemText,
  unescapeXml,
  withOpenTagAttrs,
} from './xml';

/** Values for one sheet: dotted scalars (`plan.title`) and tables (`cases`, `runs`, `envList`). */
export interface FillContext {
  scalars: Record<string, unknown>;
  tables: Record<string, TableItem[]>;
}

export interface FillEnv {
  /** Shared string texts by index. */
  sst: string[];
  styles: StyleBook;
  date1904: boolean;
}

export interface FillResult {
  xml: string;
  rowMap: RowMap;
  /** Number of repeated table rows written (for logs/tests). */
  tableRows: number;
}

interface Cell {
  col: number;
  /** Attributes without `r`. */
  attrs: string;
  /** Inner XML (`<v>…</v>`, `<is>…</is>`, `<f>…</f>…`) or null for an empty cell. */
  inner: string | null;
}

interface Row {
  r: number;
  attrs: string;
  cells: Cell[];
}

const EXCEL_MAX_TEXT = 32_767;
const MAX_ROW_HEIGHT = 409.5;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Fills one worksheet: scalar placeholders, repeated table rows (`${table:…}`), then moves or
 * grows everything that refers to rows — merges, conditional formats, data validations,
 * hyperlinks, page breaks, formulas — exactly like inserting rows in Excel. Rows created from a
 * template row keep its cells (styles, borders, static texts), merges and row attributes; their
 * height grows to fit wrapped text (the template row's height is the minimum).
 */
export function fillSheetXml(sourceXml: string, ctx: FillContext, env: FillEnv): FillResult {
  const xml = fillHeaderFooter(sourceXml, ctx);
  const sd = findElement(xml, 'sheetData');
  if (!sd || sd.text.endsWith('/>')) return { xml, rowMap: new RowMap(), tableRows: 0 };
  const innerStart = sd.text.indexOf('>') + 1;
  const rows = expandSharedFormulas(
    parseRows(sd.text.slice(innerStart, sd.text.length - '</sheetData>'.length)),
  );
  const metrics = sheetMetrics(xml);

  // 1) Which rows repeat, and for which table.
  const plans = rows.map((row) => {
    const texts = new Map<number, string>();
    let table: string | null = null;
    for (const c of row.cells) {
      const t = cellText(c, env.sst);
      if (t === null || !t.includes('${')) continue;
      const phs = findPlaceholders(t);
      if (phs.length === 0) continue;
      texts.set(c.col, t);
      if (table === null) {
        const first = phs.find((p) => p.table);
        if (first) table = first.path.split('.')[0]!;
      }
    }
    return { row, texts, table };
  });
  if (plans.every((p) => p.texts.size === 0)) return { xml, rowMap: new RowMap(), tableRows: 0 }; // nothing to fill
  const rowMap = new RowMap(
    plans
      .filter((p) => p.table !== null)
      .map((p) => ({ row: p.row.r, count: Math.max(1, ctx.tables[p.table!]?.length ?? 0) })),
  );

  // 2) Output rows.
  const merges = parseMerges(xml);
  const out: Row[] = [];
  const sectionBlocks: { first: number; values: string[]; cols: number[] }[] = [];
  let tableRows = 0;
  for (const plan of plans) {
    const { row } = plan;
    const start = rowMap.start(row.r);
    if (plan.table === null) {
      out.push({
        r: start,
        attrs: row.attrs,
        cells: row.cells.map((c) => fillCell(c, plan.texts.get(c.col), null, 0, rowMap, ctx, env)),
      });
      continue;
    }
    const items = ctx.tables[plan.table] ?? [];
    const n = Math.max(1, items.length);
    const rowMerges = merges.filter((m) => m.top === row.r && m.bottom === row.r);
    for (let i = 0; i < n; i++) {
      const cells = row.cells.map((c) =>
        fillCell(
          c,
          plan.texts.get(c.col),
          { index: i, empty: items.length === 0 },
          i,
          rowMap,
          ctx,
          env,
        ),
      );
      const attrs =
        items.length === 0
          ? row.attrs
          : withHeight(row.attrs, cells, rowMerges, metrics, env.styles);
      out.push({ r: start + i, attrs, cells });
    }
    tableRows += items.length;
    const sectionCols = [...plan.texts.entries()]
      .filter(([, t]) =>
        findPlaceholders(t).some((p) => p.table && p.path === `${plan.table}.sectionMerged`),
      )
      .map(([col]) => col);
    if (sectionCols.length && items.length > 1) {
      sectionBlocks.push({
        first: start,
        values: items.map((it) => toText(it.sectionMerged)),
        cols: sectionCols,
      });
    }
  }

  // 3) Merges: single-row merges of a repeated row are repeated; others move/grow.
  let newMerges: Box[] = [];
  for (const m of merges) {
    if (m.top === m.bottom && rowMap.end(m.top) > rowMap.start(m.top)) {
      for (let r = rowMap.start(m.top); r <= rowMap.end(m.top); r++)
        newMerges.push({ ...m, top: r, bottom: r });
    } else {
      newMerges.push(rowMap.mapBox(m));
    }
  }
  // 4) Section cells: name on the first row of each run of equal sections, merged vertically.
  const byRow = new Map(out.map((r) => [r.r, r]));
  for (const block of sectionBlocks) {
    let i = 0;
    while (i < block.values.length) {
      let j = i;
      while (
        j + 1 < block.values.length &&
        block.values[j + 1] === block.values[i] &&
        block.values[i] !== ''
      )
        j++;
      if (j > i) {
        const top = block.first + i;
        const bottom = block.first + j;
        for (const col of block.cols) {
          const rowMerge = newMerges.find(
            (m) => m.top === top && m.bottom === top && m.left <= col && col <= m.right,
          );
          const left = rowMerge?.left ?? col;
          const right = rowMerge?.right ?? col;
          newMerges = newMerges.filter(
            (m) => !(m.top >= top && m.bottom <= bottom && m.left <= right && m.right >= left),
          );
          newMerges.push({ top, bottom, left, right });
          for (let r = top + 1; r <= bottom; r++) {
            const row = byRow.get(r);
            const cell = row?.cells.find((c) => c.col === col);
            if (cell) {
              cell.attrs = setAttr(cell.attrs, 't', null);
              cell.inner = null;
            }
          }
        }
      }
      i = j + 1;
    }
  }

  // 5) Write back.
  let result =
    xml.slice(0, sd.start) +
    `<sheetData>${out.map(serializeRow).join('')}</sheetData>` +
    xml.slice(sd.end);
  result = writeMerges(result, newMerges, merges.length > 0);
  if (!rowMap.isIdentity) result = shiftSheetRefs(result, rowMap);
  return { xml: result, rowMap, tableRows };
}

/** Page header/footer texts (e.g. the document number in the footer) take scalar placeholders. */
const HEADER_FOOTER_TAGS = [
  'oddHeader',
  'oddFooter',
  'evenHeader',
  'evenFooter',
  'firstHeader',
  'firstFooter',
];

function fillHeaderFooter(xml: string, ctx: FillContext): string {
  if (!xml.includes('<headerFooter')) return xml;
  let out = xml;
  for (const tag of HEADER_FOOTER_TAGS) {
    out = out.replace(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g'), (m, body: string) => {
      const text = unescapeXml(body);
      if (!text.includes('${')) return m;
      // In header/footer codes a literal "&" is written "&&".
      const filled = text.replace(PLACEHOLDER_RE, (ph) => {
        const p = findPlaceholders(ph)[0]!;
        return p.table ? '' : toText(asScalar(lookup(ctx.scalars, p.path))).replace(/&/g, '&&');
      });
      return `<${tag}>${escapeXml(filled)}</${tag}>`;
    });
  }
  return out;
}

// ------------------------------------------------------------------ cells

function fillCell(
  c: Cell,
  text: string | undefined,
  table: { index: number; empty: boolean } | null,
  copyIndex: number,
  rowMap: RowMap,
  ctx: FillContext,
  env: FillEnv,
): Cell {
  if (text !== undefined) {
    const resolve = (p: Placeholder): CellScalar => {
      if (!p.table) return asScalar(lookup(ctx.scalars, p.path));
      if (!table || table.empty) return null;
      const [collection, ...field] = p.path.split('.');
      const item = ctx.tables[collection!]?.[table.index];
      return item ? (item[field.join('.')] ?? null) : null;
    };
    const phs = findPlaceholders(text);
    if (phs.length === 1 && text.trim() === `\${${phs[0]!.inner}}`)
      return writeValue(c, resolve(phs[0]!), env);
    const replaced = text.replace(PLACEHOLDER_RE, (m) => toText(resolve(findPlaceholders(m)[0]!)));
    return writeValue(c, replaced, env, false);
  }
  if (c.inner && c.inner.includes('<f')) {
    const inner = c.inner.replace(
      /<f\b([^>]*?)(?:\/>|>([\s\S]*?)<\/f>)/,
      (_m, attrs: string, body: string | undefined) => {
        let a = attrs;
        const ref = getAttr(a, 'ref');
        if (ref) {
          const box = parseBox(ref);
          if (box) a = setAttr(a, 'ref', formatBox(shiftBox(rowMap.mapBox(box), copyIndex)));
        }
        if (body === undefined) return `<f${a}/>`;
        let f = shiftFormula(unescapeXml(body), rowMap);
        if (copyIndex > 0) f = translateFormula(f, copyIndex, 0);
        return `<f${a}>${escapeXml(f)}</f>`;
      },
    );
    return { ...c, inner };
  }
  return { ...c };
}

function shiftBox(b: Box, d: number): Box {
  return d === 0 ? b : { ...b, top: b.top + d, bottom: b.bottom + d };
}

function cellText(c: Cell, sst: string[]): string | null {
  const t = getAttr(c.attrs, 't');
  if (t === 's') {
    const idx = /<v>\s*(\d+)\s*<\/v>/.exec(c.inner ?? '')?.[1];
    return idx === undefined ? null : (sst[Number(idx)] ?? null);
  }
  if (t === 'inlineStr') {
    const is = /<is>([\s\S]*?)<\/is>/.exec(c.inner ?? '')?.[1];
    return is === undefined ? null : stringItemText(is);
  }
  return null;
}

function writeValue(c: Cell, value: CellScalar, env: FillEnv, typed = true): Cell {
  const attrs = setAttr(c.attrs, 't', null);
  if (value === null || value === undefined || value === '') return { ...c, attrs, inner: null };
  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? { ...c, attrs, inner: `<v>${value}</v>` }
      : inline(c, attrs, String(value));
  }
  if (typeof value === 'boolean')
    return { ...c, attrs: setAttr(attrs, 't', 'b'), inner: `<v>${value ? 1 : 0}</v>` };
  if (value instanceof Date)
    return { ...c, attrs, inner: `<v>${excelSerial(value, env.date1904)}</v>` };
  const iso = typed ? ISO_DATE.exec(value) : null;
  if (iso && env.styles.get(Number(getAttr(c.attrs, 's') ?? 0)).isDate) {
    const d = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
    if (!Number.isNaN(d.getTime()))
      return { ...c, attrs, inner: `<v>${excelSerial(d, env.date1904)}</v>` };
  }
  return inline(c, attrs, value);
}

function inline(c: Cell, attrs: string, text: string): Cell {
  const clean = text.replace(/\r\n?/g, '\n');
  const cut = clean.length > EXCEL_MAX_TEXT ? clean.slice(0, EXCEL_MAX_TEXT) : clean;
  return {
    ...c,
    attrs: setAttr(attrs, 't', 'inlineStr'),
    inner: `<is><t xml:space="preserve">${escapeXml(cut)}</t></is>`,
  };
}

function excelSerial(d: Date, date1904: boolean): number {
  const days = (d.getTime() - Date.UTC(1899, 11, 30)) / 86_400_000;
  return date1904 ? days - 1462 : days;
}

function lookup(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const key of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

function asScalar(v: unknown): CellScalar {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || v instanceof Date)
    return v;
  return null;
}

export function toText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  return '';
}

// ------------------------------------------------------------------ rows

function parseRows(inner: string): Row[] {
  const rows: Row[] = [];
  let lastRow = 0;
  for (const m of inner.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const attrs = m[1]!;
    const r = Number(getAttr(attrs, 'r') ?? lastRow + 1);
    lastRow = r;
    const cells: Cell[] = [];
    let lastCol = 0;
    for (const cm of (m[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ca = cm[1]!;
      const ref = getAttr(ca, 'r');
      const col = ref ? colToNumber(/^[A-Za-z]+/.exec(ref)?.[0] ?? 'A') : lastCol + 1;
      lastCol = col;
      cells.push({ col, attrs: setAttr(ca, 'r', null), inner: cm[2] ?? null });
    }
    rows.push({ r, attrs: setAttr(attrs, 'r', null), cells });
  }
  return rows;
}

function serializeRow(row: Row): string {
  const cells = row.cells
    .map((c) => {
      const ref = cellAddress(c.col, row.r);
      return c.inner === null || c.inner === ''
        ? `<c r="${ref}"${c.attrs}/>`
        : `<c r="${ref}"${c.attrs}>${c.inner}</c>`;
    })
    .join('');
  return cells ? `<row r="${row.r}"${row.attrs}>${cells}</row>` : `<row r="${row.r}"${row.attrs}/>`;
}

/** Turns shared formulas into plain formulas so rows can be copied and moved independently. */
function expandSharedFormulas(rows: Row[]): Row[] {
  const masters = new Map<string, { formula: string; row: number; col: number }>();
  for (const row of rows) {
    for (const c of row.cells) {
      const m = /<f\b([^>]*?)>([\s\S]*?)<\/f>/.exec(c.inner ?? '');
      if (m && getAttr(m[1]!, 't') === 'shared' && getAttr(m[1]!, 'si') !== undefined) {
        masters.set(getAttr(m[1]!, 'si')!, { formula: unescapeXml(m[2]!), row: row.r, col: c.col });
      }
    }
  }
  if (masters.size === 0) return rows;
  for (const row of rows) {
    for (const c of row.cells) {
      if (!c.inner?.includes('<f')) continue;
      c.inner = c.inner.replace(/<f\b([^>]*?)(?:\/>|>([\s\S]*?)<\/f>)/, (whole, attrs: string) => {
        if (getAttr(attrs, 't') !== 'shared') return whole;
        const master = masters.get(getAttr(attrs, 'si') ?? '');
        if (!master) return '';
        return `<f>${escapeXml(translateFormula(master.formula, row.r - master.row, c.col - master.col))}</f>`;
      });
    }
  }
  return rows;
}

// ------------------------------------------------------------------ merges

function parseMerges(xml: string): Box[] {
  const el = findElement(xml, 'mergeCells');
  if (!el) return [];
  const out: Box[] = [];
  for (const m of el.text.matchAll(/<mergeCell\b([^>]*?)\/?>/g)) {
    const box = parseBox((getAttr(m[1]!, 'ref') ?? '').replace(/\$/g, ''));
    if (box) out.push(box);
  }
  return out;
}

/** Elements that may precede `<mergeCells>` in a worksheet (schema order). */
const BEFORE_MERGES = [
  'customSheetViews',
  'dataConsolidate',
  'sortState',
  'autoFilter',
  'scenarios',
  'protectedRanges',
  'sheetProtection',
  'sheetCalcPr',
  'sheetData',
];

function writeMerges(xml: string, merges: Box[], had: boolean): string {
  const body = merges.map((m) => `<mergeCell ref="${formatBox(m)}"/>`).join('');
  const el = findElement(xml, 'mergeCells');
  if (el) {
    const replacement = merges.length
      ? `<mergeCells count="${merges.length}">${body}</mergeCells>`
      : '';
    return xml.slice(0, el.start) + replacement + xml.slice(el.end);
  }
  if (!merges.length || had) return xml;
  for (const tag of BEFORE_MERGES) {
    const anchor = findElement(xml, tag);
    if (anchor)
      return (
        xml.slice(0, anchor.end) +
        `<mergeCells count="${merges.length}">${body}</mergeCells>` +
        xml.slice(anchor.end)
      );
  }
  return xml;
}

// ------------------------------------------------------------------ everything else that points at rows

function shiftSheetRefs(xml: string, map: RowMap): string {
  let out = xml;
  out = replaceElements(out, 'dimension', (el) => {
    const ref = getAttr(openTagAttrs(el), 'ref');
    const box = ref ? parseBox(ref) : null;
    return box
      ? withOpenTagAttrs(el, setAttr(openTagAttrs(el), 'ref', formatBox(map.mapBox(box))))
      : el;
  });
  const withSqref = (el: string) => {
    const attrs = openTagAttrs(el);
    const sqref = getAttr(attrs, 'sqref');
    return sqref ? withOpenTagAttrs(el, setAttr(attrs, 'sqref', map.mapSqref(sqref))) : el;
  };
  const shiftFormulas = (el: string, tags: string[]) => {
    let r = el;
    for (const tag of tags) {
      r = r.replace(
        new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g'),
        (_m, f: string) => `<${tag}>${escapeXml(shiftFormula(unescapeXml(f), map))}</${tag}>`,
      );
    }
    return r;
  };
  out = replaceElements(out, 'conditionalFormatting', (el) =>
    shiftFormulas(withSqref(el), ['formula']),
  );
  out = replaceElements(out, 'dataValidation', (el) =>
    shiftFormulas(withSqref(el), ['formula1', 'formula2']),
  );
  out = replaceElements(out, 'ignoredError', withSqref);
  out = replaceElements(out, 'protectedRange', withSqref);
  const withRef = (el: string) => {
    const attrs = openTagAttrs(el);
    const ref = getAttr(attrs, 'ref');
    const box = ref ? parseBox(ref.replace(/\$/g, '')) : null;
    return box ? withOpenTagAttrs(el, setAttr(attrs, 'ref', formatBox(map.mapBox(box)))) : el;
  };
  out = replaceElements(out, 'hyperlink', withRef);
  out = replaceElements(out, 'autoFilter', withRef);
  out = replaceElements(out, 'sortState', withRef);
  out = replaceElements(out, 'sortCondition', withRef);
  out = replaceElements(out, 'rowBreaks', (el) =>
    el.replace(/<brk\b([^>]*?)\/>/g, (m, attrs: string) => {
      const id = getAttr(attrs, 'id');
      return id ? `<brk${setAttr(attrs, 'id', String(map.end(Number(id))))}/>` : m;
    }),
  );
  // x14 extensions (conditional formats / validations defined in <extLst>).
  out = out.replace(
    /<xm:sqref>([^<]*)<\/xm:sqref>/g,
    (_m, s: string) => `<xm:sqref>${map.mapSqref(s)}</xm:sqref>`,
  );
  out = out.replace(
    /<xm:f>([\s\S]*?)<\/xm:f>/g,
    (_m, f: string) => `<xm:f>${escapeXml(shiftFormula(unescapeXml(f), map))}</xm:f>`,
  );
  return out;
}

// ------------------------------------------------------------------ row heights

interface SheetMetrics {
  widths: Map<number, number>;
  defaultWidth: number;
  defaultHeight: number;
}

function sheetMetrics(xml: string): SheetMetrics {
  const fmt = /<sheetFormatPr\b([^>]*?)\/?>/.exec(xml)?.[1] ?? '';
  const defaultWidth = Number(
    getAttr(fmt, 'defaultColWidth') ?? Number(getAttr(fmt, 'baseColWidth') ?? 8) + 0.71,
  );
  const defaultHeight = Number(getAttr(fmt, 'defaultRowHeight') ?? 15);
  const widths = new Map<number, number>();
  const cols = findElement(xml, 'cols');
  for (const m of (cols?.text ?? '').matchAll(/<col\b([^>]*?)\/?>/g)) {
    const a = m[1]!;
    const min = Number(getAttr(a, 'min'));
    const max = Math.min(Number(getAttr(a, 'max')), min + 16_384);
    const hidden = getAttr(a, 'hidden') === '1';
    const width = hidden ? 0 : Number(getAttr(a, 'width') ?? defaultWidth);
    for (let c = min; c <= max; c++) widths.set(c, width);
  }
  return {
    widths,
    defaultWidth: Number.isFinite(defaultWidth) ? defaultWidth : 8.71,
    defaultHeight: Number.isFinite(defaultHeight) ? defaultHeight : 15,
  };
}

/** Height (pt) a wrapped text needs: lines × line height of its font, lines from column width. */
export function textHeight(text: string, widthChars: number, fontSize: number): number {
  const scale = fontSize / 11;
  const capacity = Math.max(1, (widthChars - 0.8) / scale);
  let lines = 0;
  for (const para of text.split('\n')) lines += Math.max(1, Math.ceil(textUnits(para) / capacity));
  return lines * fontSize * 1.3 + 3;
}

/** Display width of a text in "0"-character units (wide CJK/full-width = 2, combining marks = 0). */
function textUnits(s: string): number {
  let n = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (
      (cp >= 0x0e31 && cp <= 0x0e3a && cp !== 0x0e32 && cp !== 0x0e33) ||
      (cp >= 0x0e47 && cp <= 0x0e4e) ||
      (cp >= 0x0300 && cp <= 0x036f)
    )
      continue;
    if (
      (cp >= 0x1100 && cp <= 0x115f) ||
      (cp >= 0x2e80 && cp <= 0xa4cf) ||
      (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe30 && cp <= 0xfe4f) ||
      (cp >= 0xff00 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6) ||
      cp >= 0x20000
    ) {
      n += 2;
    } else {
      n += 1;
    }
  }
  return n;
}

function withHeight(
  attrs: string,
  cells: Cell[],
  rowMerges: Box[],
  metrics: SheetMetrics,
  styles: StyleBook,
): string {
  let needed = 0;
  for (const c of cells) {
    const text = c.inner && getAttr(c.attrs, 't') === 'inlineStr' ? stringItemText(c.inner) : null;
    if (!text) continue;
    const style = styles.get(Number(getAttr(c.attrs, 's') ?? 0));
    if (!style.wrap) continue;
    const merge = rowMerges.find((m) => m.left === c.col);
    let width = 0;
    for (let col = c.col; col <= (merge?.right ?? c.col); col++)
      width += metrics.widths.get(col) ?? metrics.defaultWidth;
    needed = Math.max(needed, textHeight(text, width, style.fontSize));
  }
  if (needed === 0) return attrs;
  const current = Number(getAttr(attrs, 'ht') ?? metrics.defaultHeight);
  const height = Math.min(MAX_ROW_HEIGHT, Math.max(current, Math.ceil(needed * 4) / 4));
  if (height === current && getAttr(attrs, 'ht') !== undefined) return attrs;
  return setAttr(setAttr(attrs, 'ht', String(height)), 'customHeight', '1');
}

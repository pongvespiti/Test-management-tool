import { TemplateError } from './errors';
import {
  OoxmlPackage,
  parseRels,
  relativeTarget,
  relsPathFor,
  resolveTarget,
  serializeRels,
  type Relationship,
  type SheetEntry,
  type WorkbookModel,
} from './package';
import { RowMap, formatBox, parseBox } from './refs';
import { quoteSheetName } from './sheet-name';
import { escapeXml, getAttr, newGuid, setAttr, unescapeXml } from './xml';

const WORKSHEET_CT = 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml';
/** Relationship kinds a run sheet may not contain (they would need deep copies with renamed objects). */
const UNSUPPORTED = new Set(['table', 'pivotTable', 'slicer', 'timeline', 'queryTable']);

// ------------------------------------------------------------------ shifting parts that belong to a sheet

/** Moves pictures/shapes anchored below repeated rows (they keep their size; they are not repeated). */
export function shiftDrawingXml(xml: string, map: RowMap): string {
  if (map.isIdentity) return xml;
  return xml.replace(/<xdr:(twoCellAnchor|oneCellAnchor)\b[\s\S]*?<\/xdr:\1>/g, (anchor) => {
    const from = /<xdr:from>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/.exec(anchor);
    if (!from) return anchor;
    const row0 = Number(from[1]);
    const delta = map.start(row0 + 1) - 1 - row0;
    if (delta === 0) return anchor;
    return anchor.replace(
      /(<xdr:(?:from|to)>[\s\S]*?<xdr:row>)(\d+)(<\/xdr:row>)/g,
      (_m, a: string, r: string, b: string) => `${a}${Number(r) + delta}${b}`,
    );
  });
}

/** Same for legacy VML shapes (comments, form controls, camera pictures). */
export function shiftVmlXml(xml: string, map: RowMap): string {
  if (map.isIdentity) return xml;
  return xml.replace(/<v:shape\b[\s\S]*?<\/v:shape>/g, (shape) => {
    let out = shape.replace(/<x:Anchor>([^<]*)<\/x:Anchor>/, (m, body: string) => {
      const parts = body.split(',').map((p) => p.trim());
      if (parts.length !== 8) return m;
      const top = Number(parts[2]);
      const delta = map.start(top + 1) - 1 - top;
      if (!delta) return m;
      parts[2] = String(top + delta);
      parts[6] = String(Number(parts[6]) + delta);
      return `<x:Anchor>\n    ${parts.join(', ')}</x:Anchor>`;
    });
    out = out.replace(
      /<x:Row>(\d+)<\/x:Row>/,
      (_m, r: string) => `<x:Row>${map.start(Number(r) + 1) - 1}</x:Row>`,
    );
    return out;
  });
}

/** Moves the cell references of (threaded) comments. */
export function shiftCommentsXml(xml: string, map: RowMap): string {
  if (map.isIdentity) return xml;
  return xml.replace(
    /<(comment|threadedComment)\b([^>]*?)(\/?)>/g,
    (m, tag: string, attrs: string, close: string) => {
      const ref = getAttr(attrs, 'ref');
      const box = ref ? parseBox(ref) : null;
      if (!box) return m;
      const r = map.start(box.top);
      return `<${tag}${setAttr(attrs, 'ref', formatBox({ ...box, top: r, bottom: r + box.bottom - box.top }))}${close}>`;
    },
  );
}

/** Applies a sheet's row map to the drawing, VML and comment parts it owns. */
export async function shiftSheetParts(
  pkg: OoxmlPackage,
  sheet: SheetEntry,
  map: RowMap,
): Promise<void> {
  if (map.isIdentity) return;
  for (const rel of parseRels(await pkg.text(relsPathFor(sheet.part)))) {
    if (rel.external) continue;
    const path = resolveTarget(sheet.part, rel.target);
    const xml = await pkg.text(path);
    if (xml === null) continue;
    if (rel.kind === 'drawing') pkg.setText(path, shiftDrawingXml(xml, map));
    else if (rel.kind === 'vmlDrawing') pkg.setText(path, shiftVmlXml(xml, map));
    else if (rel.kind === 'comments' || rel.kind === 'threadedComment')
      pkg.setText(path, shiftCommentsXml(xml, map));
  }
}

// ------------------------------------------------------------------ cloning a sheet

/** Highest VML shape block (`<o:idmap data="…">`) used anywhere in the package. */
async function maxVmlBlock(pkg: OoxmlPackage): Promise<number> {
  let max = 0;
  for (const p of pkg.paths()) {
    if (!p.endsWith('.vml')) continue;
    const xml = (await pkg.text(p)) ?? '';
    for (const m of xml.matchAll(/<o:idmap\b[^>]*data="([^"]*)"/g)) {
      for (const n of m[1]!.split(','))
        if (Number.isFinite(Number(n))) max = Math.max(max, Number(n));
    }
  }
  return max;
}

/** Gives a copied VML part its own shape-id block(s) so ids stay unique in the workbook. */
async function renumberVml(pkg: OoxmlPackage, xml: string): Promise<string> {
  const ids = [...new Set([...xml.matchAll(/_x0000_s(\d+)/g)].map((m) => m[1]!))];
  const blocks = Math.max(1, Math.ceil((ids.length + 1) / 1023));
  const first = (await maxVmlBlock(pkg)) + 1;
  const map = new Map(
    ids.map((id, i) => [id, String((first + Math.floor(i / 1023)) * 1024 + 1 + (i % 1023))]),
  );
  const data = Array.from({ length: blocks }, (_v, i) => first + i).join(',');
  return xml
    .replace(/(<o:idmap\b[^>]*data=")[^"]*(")/g, `$1${data}$2`)
    .replace(/_x0000_s(\d+)/g, (_m, id: string) => `_x0000_s${map.get(id) ?? id}`);
}

/** `xl/drawings/drawing4.xml` → next free `xl/drawings/drawing<N>.xml`. */
function nextLike(pkg: OoxmlPackage, path: string): string {
  const m = /^(.*?)(\d*)(\.[^./]+)$/.exec(path);
  return m ? pkg.nextPartPath(m[1]!, m[3]!) : pkg.nextPartPath(`${path}_`, '');
}

async function copyRelsFor(
  pkg: OoxmlPackage,
  from: string,
  to: string,
  map?: (rel: Relationship) => Promise<Relationship>,
): Promise<void> {
  const relsXml = await pkg.text(relsPathFor(from));
  if (relsXml === null) return;
  const rels = parseRels(relsXml);
  const out: Relationship[] = [];
  for (const rel of rels) {
    // Targets are relative to the owning part; the copy lives in the same folder.
    out.push(map ? await map(rel) : rel);
  }
  pkg.setText(relsPathFor(to), serializeRels(out));
}

/**
 * Copies a worksheet (with its drawing, VML, comments and printer settings, each as its own part)
 * and inserts it into the workbook right after `after`. Pictures are shared, not duplicated.
 */
export async function cloneSheet(
  pkg: OoxmlPackage,
  book: WorkbookModel,
  src: SheetEntry,
  name: string,
  after: SheetEntry,
): Promise<SheetEntry> {
  const part = pkg.nextPartPath('xl/worksheets/sheet', '.xml');
  let xml = await pkg.requireText(src.part);
  xml = xml.replace(
    /(\sxr\d*:uid=")\{[0-9A-Fa-f-]+\}(")/g,
    (_m, a: string, b: string) => `${a}${newGuid()}${b}`,
  );
  pkg.setText(part, xml);

  const guidMap = new Map<string, string>();
  const relsXml = await pkg.text(relsPathFor(src.part));
  const newRels: Relationship[] = [];
  const deferredComments: { from: string; to: string }[] = [];
  for (const rel of parseRels(relsXml)) {
    if (rel.external) {
      newRels.push(rel);
      continue;
    }
    if (UNSUPPORTED.has(rel.kind)) {
      throw new TemplateError(
        'UNSUPPORTED_TEMPLATE',
        `The run sheet "${src.name}" contains a ${rel.kind}, which cannot be repeated per run — remove it from the run sheet`,
      );
    }
    const target = resolveTarget(src.part, rel.target);
    if (rel.kind === 'image' || !pkg.has(target)) {
      newRels.push(rel);
      continue;
    }
    const copy = nextLike(pkg, target);
    if (rel.kind === 'drawing') {
      pkg.setText(copy, await pkg.requireText(target));
      await copyRelsFor(pkg, target, copy, async (r) => {
        if (r.kind === 'chart' || r.kind === 'chartEx') {
          throw new TemplateError(
            'UNSUPPORTED_TEMPLATE',
            `The run sheet "${src.name}" contains a chart, which cannot be repeated per run — move it to another sheet`,
          );
        }
        return r;
      });
    } else if (rel.kind === 'vmlDrawing') {
      pkg.setText(copy, await renumberVml(pkg, await pkg.requireText(target)));
      await copyRelsFor(pkg, target, copy);
    } else if (rel.kind === 'threadedComment') {
      let t = await pkg.requireText(target);
      t = t.replace(/(\sid=")(\{[0-9A-Fa-f-]+\})(")/g, (_m, a: string, g: string, b: string) => {
        const fresh = newGuid();
        guidMap.set(g.toUpperCase(), fresh);
        return `${a}${fresh}${b}`;
      });
      pkg.setText(copy, t);
    } else if (rel.kind === 'comments') {
      deferredComments.push({ from: target, to: copy }); // needs the GUID map of the threaded comments
      pkg.setText(copy, await pkg.requireText(target));
    } else {
      await pkg.copyPart(target, copy);
      await copyRelsFor(pkg, target, copy);
    }
    await pkg.registerLike(copy, target);
    newRels.push({ ...rel, target: relativeTarget(part, copy) });
  }
  for (const c of deferredComments) {
    let t = await pkg.requireText(c.to);
    for (const [from, to] of guidMap) t = t.split(from).join(to).split(from.toLowerCase()).join(to);
    pkg.setText(c.to, t);
  }
  // Threaded comment replies point to their parent by id.
  for (const rel of newRels) {
    if (rel.kind !== 'threadedComment') continue;
    const path = resolveTarget(part, rel.target);
    let t = await pkg.requireText(path);
    t = t.replace(/(\sparentId=")(\{[0-9A-Fa-f-]+\})(")/g, (m, a: string, g: string, b: string) => {
      const fresh = guidMap.get(g.toUpperCase());
      return fresh ? `${a}${fresh}${b}` : m;
    });
    pkg.setText(path, t);
  }
  if (newRels.length) pkg.setText(relsPathFor(part), serializeRels(newRels));
  await pkg.addOverride(part, WORKSHEET_CT);

  const relId = book.nextRelId();
  book.rels.push({
    id: relId,
    type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet',
    kind: 'worksheet',
    target: relativeTarget(book.path, part),
    external: false,
  });
  const entry: SheetEntry = {
    name,
    sheetId: book.nextSheetId(),
    relId,
    state: 'visible',
    part,
    extraAttrs: src.extraAttrs,
  };
  book.sheets.splice(book.sheets.indexOf(after) + 1, 0, entry);

  // Sheet-level names (print area, print titles, filter database) follow the copy.
  const srcQualifier = quoteSheetName(src.name);
  const newQualifier = quoteSheetName(name);
  // Iterate a snapshot: the loop appends the copied names.
  for (const n of book.names.slice()) {
    if (n.sheet !== src) continue;
    book.names.push({
      attrs: n.attrs,
      text: replaceQualifier(n.text, src.name, srcQualifier, newQualifier),
      sheet: entry,
    });
  }
  return entry;
}

/** Replaces references to one sheet in a (still XML-escaped) formula. */
export function replaceQualifier(
  escapedFormula: string,
  sheetName: string,
  from: string,
  to: string,
): string {
  const formula = unescapeXml(escapedFormula);
  const variants = new Set([from, `'${sheetName.replace(/'/g, "''")}'`]);
  let out = formula;
  for (const v of variants) out = out.split(`${v}!`).join(`${to}!`);
  return escapeXml(out);
}

/** Removes a sheet and the parts only it used; names local to it go, other names pointing at it become #REF!. */
export async function removeSheet(
  pkg: OoxmlPackage,
  book: WorkbookModel,
  sheet: SheetEntry,
): Promise<void> {
  const usedElsewhere = new Set<string>();
  for (const other of book.sheets) {
    if (other === sheet) continue;
    for (const r of parseRels(await pkg.text(relsPathFor(other.part)))) {
      if (!r.external) usedElsewhere.add(resolveTarget(other.part, r.target));
    }
  }
  const rels = parseRels(await pkg.text(relsPathFor(sheet.part)));
  for (const rel of rels) {
    if (rel.external || rel.kind === 'image') continue;
    const target = resolveTarget(sheet.part, rel.target);
    if (usedElsewhere.has(target)) continue;
    if (
      ![
        'drawing',
        'vmlDrawing',
        'comments',
        'threadedComment',
        'printerSettings',
        'ctrlProp',
      ].includes(rel.kind)
    )
      continue;
    pkg.remove(relsPathFor(target));
    pkg.remove(target);
    await pkg.removeOverride(target);
  }
  pkg.remove(relsPathFor(sheet.part));
  pkg.remove(sheet.part);
  await pkg.removeOverride(sheet.part);
  book.rels = book.rels.filter((r) => r.id !== sheet.relId);
  book.sheets.splice(book.sheets.indexOf(sheet), 1);
  for (const n of book.names) {
    if (n.sheet === sheet) continue;
    if (refersToSheet(unescapeXml(n.text), sheet.name)) n.text = '#REF!';
  }
}

/** True when a formula contains a reference qualified with this sheet's name. */
export function refersToSheet(formula: string, sheetName: string): boolean {
  const quoted = `'${sheetName.replace(/'/g, "''")}'!`;
  if (formula.toLowerCase().includes(quoted.toLowerCase())) return true;
  const plain = quoteSheetName(sheetName);
  if (plain.startsWith("'")) return false;
  return new RegExp(`(^|[^\\w.'\\]])${plain.replace(/[.]/g, '\\.')}!`, 'i').test(formula);
}

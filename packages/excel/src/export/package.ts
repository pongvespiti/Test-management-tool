import JSZip from 'jszip';
import { ImportFormatError } from '../import/errors';
import { assertSafeZip, looksLikeZip } from '../import/zip-guard';
import { TemplateError } from './errors';
import { escapeXml, findElement, getAttr, setAttr, unescapeXml } from './xml';

export const REL_TYPES = {
  officeDocument:
    'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument',
  worksheet: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet',
  sharedStrings:
    'http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings',
  styles: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles',
  calcChain: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/calcChain',
} as const;

const CONTENT_TYPES = '[Content_Types].xml';

export interface Relationship {
  id: string;
  /** Last segment of the relationship type URI (`worksheet`, `drawing`, …). */
  kind: string;
  type: string;
  target: string;
  external: boolean;
}

export function parseRels(xml: string | null): Relationship[] {
  if (!xml) return [];
  return [...xml.matchAll(/<Relationship\b([^>]*?)\/?>/g)].map((m) => {
    const attrs = m[1]!;
    const type = getAttr(attrs, 'Type') ?? '';
    return {
      id: getAttr(attrs, 'Id') ?? '',
      type,
      kind: type.split('/').pop() ?? '',
      target: unescapeXml(getAttr(attrs, 'Target') ?? ''),
      external: getAttr(attrs, 'TargetMode') === 'External',
    };
  });
}

export function serializeRels(rels: Relationship[]): string {
  const items = rels
    .map(
      (r) =>
        `<Relationship Id="${escapeXml(r.id)}" Type="${escapeXml(r.type)}" Target="${escapeXml(r.target)}"${r.external ? ' TargetMode="External"' : ''}/>`,
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items}</Relationships>`;
}

/** `xl/worksheets/sheet1.xml` → `xl/worksheets/_rels/sheet1.xml.rels`. */
export function relsPathFor(partPath: string): string {
  const i = partPath.lastIndexOf('/');
  return `${partPath.slice(0, i + 1)}_rels/${partPath.slice(i + 1)}.rels`;
}

/** Resolves a relationship target against the part that owns the relationship. */
export function resolveTarget(fromPart: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const base = fromPart.split('/').slice(0, -1);
  for (const seg of target.split('/')) {
    if (seg === '..') base.pop();
    else if (seg !== '.' && seg !== '') base.push(seg);
  }
  return base.join('/');
}

/** Relative target from one part to another (both package paths without a leading slash). */
export function relativeTarget(fromPart: string, toPart: string): string {
  const from = fromPart.split('/').slice(0, -1);
  const to = toPart.split('/');
  let i = 0;
  while (i < from.length && i < to.length - 1 && from[i] === to[i]) i++;
  return [...Array(from.length - i).fill('..'), ...to.slice(i)].join('/');
}

/**
 * An OOXML package held in memory. Text parts are cached and written back on {@link generate},
 * so parts the engine never touches keep their original bytes.
 */
export class OoxmlPackage {
  private readonly zip: JSZip;
  private readonly texts = new Map<string, string>();
  private readonly dirty = new Set<string>();
  private contentTypes: string | null = null;

  private constructor(zip: JSZip) {
    this.zip = zip;
  }

  static async load(buffer: Buffer): Promise<OoxmlPackage> {
    if (!looksLikeZip(buffer))
      throw new TemplateError('INVALID_TEMPLATE', 'The template is not an .xlsx file');
    let entries: string[];
    try {
      entries = assertSafeZip(buffer);
    } catch (e) {
      if (e instanceof ImportFormatError)
        throw new TemplateError(
          e.code === 'FILE_TOO_LARGE' ? 'TOO_LARGE' : 'INVALID_TEMPLATE',
          e.message,
        );
      throw e;
    }
    if (!entries.includes(CONTENT_TYPES))
      throw new TemplateError('INVALID_TEMPLATE', 'The template is not an .xlsx file');
    try {
      return new OoxmlPackage(await JSZip.loadAsync(buffer));
    } catch {
      throw new TemplateError('INVALID_TEMPLATE', 'The template could not be read');
    }
  }

  has(path: string): boolean {
    return this.texts.has(path) || this.zip.file(path) !== null;
  }

  /** Every part path, including parts created in memory and not yet written to the zip. */
  paths(): string[] {
    const inZip = Object.keys(this.zip.files).filter((p) => !this.zip.files[p]!.dir);
    return [...new Set([...inZip, ...this.texts.keys()])];
  }

  async text(path: string): Promise<string | null> {
    const cached = this.texts.get(path);
    if (cached !== undefined) return cached;
    const f = this.zip.file(path);
    if (!f) return null;
    const t = await f.async('string');
    this.texts.set(path, t);
    return t;
  }

  async requireText(path: string): Promise<string> {
    const t = await this.text(path);
    if (t === null) throw new TemplateError('INVALID_TEMPLATE', `The template is missing ${path}`);
    return t;
  }

  setText(path: string, text: string): void {
    this.texts.set(path, text);
    this.dirty.add(path);
  }

  async binary(path: string): Promise<Uint8Array | null> {
    const f = this.zip.file(path);
    return f ? f.async('uint8array') : null;
  }

  setBinary(path: string, data: Uint8Array): void {
    this.zip.file(path, data);
    this.texts.delete(path);
    this.dirty.delete(path);
  }

  remove(path: string): void {
    this.zip.remove(path);
    this.texts.delete(path);
    this.dirty.delete(path);
  }

  /** Copies a part as raw bytes (images, printer settings…). */
  async copyPart(from: string, to: string): Promise<void> {
    const data = await this.binary(from);
    if (data) this.setBinary(to, data);
  }

  /** First free `prefix<N>suffix` path, e.g. `xl/worksheets/sheet7.xml`. */
  nextPartPath(prefix: string, suffix: string): string {
    const re = new RegExp(
      `^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)${suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
    );
    let max = 0;
    for (const p of this.paths()) {
      const m = re.exec(p);
      if (m) max = Math.max(max, Number(m[1]));
    }
    return `${prefix}${max + 1}${suffix}`;
  }

  // ---------------------------------------------------------------- content types

  private async types(): Promise<string> {
    if (this.contentTypes === null) this.contentTypes = await this.requireText(CONTENT_TYPES);
    return this.contentTypes;
  }

  async contentTypeOf(path: string): Promise<{ type: string; override: boolean } | null> {
    const xml = await this.types();
    const override = new RegExp(
      `<Override\\b[^>]*PartName="/${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>`,
    ).exec(xml);
    if (override)
      return { type: unescapeXml(getAttr(override[0], 'ContentType') ?? ''), override: true };
    const ext = path.split('.').pop()?.toLowerCase() ?? '';
    for (const m of xml.matchAll(/<Default\b([^>]*)\/?>/g)) {
      if ((getAttr(m[1]!, 'Extension') ?? '').toLowerCase() === ext) {
        return { type: unescapeXml(getAttr(m[1]!, 'ContentType') ?? ''), override: false };
      }
    }
    return null;
  }

  /** Registers a new part with the same content type as an existing one. */
  async registerLike(newPath: string, likePath: string): Promise<void> {
    const ct = await this.contentTypeOf(likePath);
    if (!ct || !ct.override) return; // covered by a <Default Extension=…>
    await this.addOverride(newPath, ct.type);
  }

  async addOverride(path: string, contentType: string): Promise<void> {
    const xml = await this.types();
    if (xml.includes(`PartName="/${path}"`)) return;
    this.contentTypes = xml.replace(
      '</Types>',
      `<Override PartName="/${escapeXml(path)}" ContentType="${escapeXml(contentType)}"/></Types>`,
    );
  }

  async removeOverride(path: string): Promise<void> {
    const xml = await this.types();
    this.contentTypes = xml.replace(
      new RegExp(
        `<Override\\b[^>]*PartName="/${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*/>`,
      ),
      '',
    );
  }

  async generate(): Promise<Buffer> {
    if (this.contentTypes !== null) this.setText(CONTENT_TYPES, this.contentTypes);
    for (const path of this.dirty) this.zip.file(path, this.texts.get(path)!);
    return this.zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });
  }
}

// ------------------------------------------------------------------ workbook model

export interface SheetEntry {
  name: string;
  sheetId: number;
  relId: string;
  state: 'visible' | 'hidden' | 'veryHidden';
  /** Package path, e.g. `xl/worksheets/sheet1.xml`. */
  part: string;
  /** Other attributes of the `<sheet>` element, kept as written. */
  extraAttrs: string;
}

export interface DefinedName {
  /** Attributes other than localSheetId, raw. */
  attrs: string;
  /** Formula text (escaped as in the XML). */
  text: string;
  /** Sheet the name is local to (null = workbook-wide). */
  sheet: SheetEntry | null;
}

/** `xl/workbook.xml` + its relationships, as far as the export needs them. */
export class WorkbookModel {
  readonly path: string;
  readonly relsPath: string;
  readonly sheets: SheetEntry[];
  readonly names: DefinedName[];
  rels: Relationship[];
  private xml: string;
  private readonly hadDefinedNames: boolean;

  private constructor(
    path: string,
    xml: string,
    rels: Relationship[],
    sheets: SheetEntry[],
    names: DefinedName[],
  ) {
    this.path = path;
    this.relsPath = relsPathFor(path);
    this.xml = xml;
    this.rels = rels;
    this.sheets = sheets;
    this.names = names;
    this.hadDefinedNames = findElement(xml, 'definedNames') !== null;
  }

  static async read(pkg: OoxmlPackage): Promise<WorkbookModel> {
    const rootRels = parseRels(await pkg.text('_rels/.rels'));
    const office = rootRels.find(
      (r) => r.type === REL_TYPES.officeDocument || r.kind === 'officeDocument',
    );
    const path = office ? resolveTarget('', office.target) : 'xl/workbook.xml';
    const xml = await pkg.requireText(path);
    const rels = parseRels(await pkg.text(relsPathFor(path)));
    const sheets: SheetEntry[] = [];
    const sheetsEl = findElement(xml, 'sheets');
    for (const m of (sheetsEl?.text ?? '').matchAll(/<sheet\b([^>]*?)\/?>/g)) {
      const attrs = m[1]!;
      const relId = getAttr(attrs, 'r:id') ?? '';
      const rel = rels.find((r) => r.id === relId);
      if (!rel) continue;
      const state = getAttr(attrs, 'state');
      sheets.push({
        name: unescapeXml(getAttr(attrs, 'name') ?? ''),
        sheetId: Number(getAttr(attrs, 'sheetId') ?? 0),
        relId,
        state: state === 'hidden' || state === 'veryHidden' ? state : 'visible',
        part: resolveTarget(path, rel.target),
        extraAttrs: ['name', 'sheetId', 'r:id', 'state'].reduce(
          (a, n) => setAttr(a, n, null),
          attrs,
        ),
      });
    }
    const names: DefinedName[] = [];
    const namesEl = findElement(xml, 'definedNames');
    for (const m of (namesEl?.text ?? '').matchAll(
      /<definedName\b([^>]*?)(?:\/>|>([\s\S]*?)<\/definedName>)/g,
    )) {
      const attrs = m[1]!;
      const local = getAttr(attrs, 'localSheetId');
      names.push({
        attrs: setAttr(attrs, 'localSheetId', null),
        text: m[2] ?? '',
        sheet: local === undefined ? null : (sheets[Number(local)] ?? null),
      });
    }
    return new WorkbookModel(path, xml, rels, sheets, names);
  }

  sheetByName(name: string): SheetEntry | undefined {
    return (
      this.sheets.find((s) => s.name === name) ??
      this.sheets.find((s) => s.name.toLowerCase() === name.toLowerCase())
    );
  }

  /** Index of the active tab (from `<workbookView activeTab>`), as a sheet entry. */
  activeSheet(): SheetEntry | undefined {
    const view = /<workbookView\b([^>]*?)\/?>/.exec(this.xml);
    const idx = Number(getAttr(view?.[1] ?? '', 'activeTab') ?? 0);
    return this.sheets[idx] ?? this.sheets[0];
  }

  nextRelId(): string {
    let max = 0;
    for (const r of this.rels) {
      const m = /^rId(\d+)$/.exec(r.id);
      if (m) max = Math.max(max, Number(m[1]));
    }
    return `rId${max + 1}`;
  }

  nextSheetId(): number {
    return Math.max(0, ...this.sheets.map((s) => s.sheetId)) + 1;
  }

  /** Serialises sheets, defined names, active tab and calc settings back into workbook.xml. */
  write(pkg: OoxmlPackage, opts: { activeSheet?: SheetEntry; fullCalcOnLoad?: boolean }): void {
    let xml = this.xml;
    const sheetsXml = this.sheets
      .map((s) => {
        const state = s.state === 'visible' ? '' : ` state="${s.state}"`;
        return `<sheet name="${escapeXml(s.name)}" sheetId="${s.sheetId}"${state}${s.extraAttrs} r:id="${escapeXml(s.relId)}"/>`;
      })
      .join('');
    const sheetsEl = findElement(xml, 'sheets')!;
    xml = xml.slice(0, sheetsEl.start) + `<sheets>${sheetsXml}</sheets>` + xml.slice(sheetsEl.end);

    const kept = this.names.filter((n) => n.sheet === null || this.sheets.includes(n.sheet));
    const namesXml = kept
      .map((n) => {
        const local = n.sheet ? ` localSheetId="${this.sheets.indexOf(n.sheet)}"` : '';
        return `<definedName${insertLocal(n.attrs, local)}>${n.text}</definedName>`;
      })
      .join('');
    const namesEl = findElement(xml, 'definedNames');
    if (namesEl) {
      xml =
        xml.slice(0, namesEl.start) +
        (kept.length ? `<definedNames>${namesXml}</definedNames>` : '') +
        xml.slice(namesEl.end);
    } else if (kept.length && !this.hadDefinedNames) {
      const after = findElement(xml, 'sheets')!;
      xml =
        xml.slice(0, after.end) + `<definedNames>${namesXml}</definedNames>` + xml.slice(after.end);
    }

    if (opts.activeSheet) {
      const idx = Math.max(0, this.sheets.indexOf(opts.activeSheet));
      xml = xml.replace(/<workbookView\b([^>]*?)(\/?)>/, (_m, attrs: string, close: string) => {
        let a = setAttr(attrs, 'activeTab', idx === 0 ? null : String(idx));
        const first = Number(getAttr(a, 'firstSheet') ?? 0);
        if (first >= this.sheets.length || first > idx) a = setAttr(a, 'firstSheet', null);
        return `<workbookView${a}${close}>`;
      });
    }
    if (opts.fullCalcOnLoad) {
      if (/<calcPr\b/.test(xml)) {
        xml = xml.replace(
          /<calcPr\b([^>]*?)(\/?)>/,
          (_m, attrs: string, close: string) =>
            `<calcPr${setAttr(attrs, 'fullCalcOnLoad', '1')}${close}>`,
        );
      } else {
        const anchor = findElement(xml, 'definedNames') ?? findElement(xml, 'sheets')!;
        xml = xml.slice(0, anchor.end) + '<calcPr fullCalcOnLoad="1"/>' + xml.slice(anchor.end);
      }
    }
    this.xml = xml;
    pkg.setText(this.path, xml);
    pkg.setText(this.relsPath, serializeRels(this.rels));
  }
}

/** Puts ` localSheetId="n"` right after the name attribute (Excel's attribute order). */
function insertLocal(attrs: string, local: string): string {
  if (!local) return attrs;
  const m = /^(\s+name="[^"]*")/.exec(attrs);
  return m ? m[1] + local + attrs.slice(m[1]!.length) : local + attrs;
}

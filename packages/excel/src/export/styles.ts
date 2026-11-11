import { findElement, getAttr, unescapeXml } from './xml';

/** What the engine needs to know about a cell style (`s` attribute). */
export interface StyleInfo {
  /** Number format shows a date/time → ISO dates are written as Excel dates. */
  isDate: boolean;
  /** Font size in points. */
  fontSize: number;
  /** Wrap text is on → long text needs taller rows. */
  wrap: boolean;
}

const BUILTIN_DATE_FORMATS = new Set([
  14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51,
  52, 53, 54, 55, 56, 57, 58,
]);

export function isDateFormatCode(code: string): boolean {
  const cleaned = code
    .split(';')[0]!
    .replace(/"[^"]*"/g, '')
    .replace(/\\./g, '')
    .replace(/\[[^\]]*\]/g, '')
    .toLowerCase();
  if (cleaned.trim() === '' || cleaned === 'general' || cleaned === '@') return false;
  return /[ymdhs]/.test(cleaned) && !/^[#0.,%e+\-\s]*$/.test(cleaned);
}

/** Cell styles of a workbook (`xl/styles.xml`), parsed once per export. */
export class StyleBook {
  readonly defaultFontSize: number;
  private readonly infos: StyleInfo[];

  private constructor(infos: StyleInfo[], defaultFontSize: number) {
    this.infos = infos;
    this.defaultFontSize = defaultFontSize;
  }

  static parse(xml: string | null): StyleBook {
    if (!xml) return new StyleBook([], 11);
    const numFmts = new Map<number, string>();
    const numFmtsEl = findElement(xml, 'numFmts');
    if (numFmtsEl) {
      for (const m of numFmtsEl.text.matchAll(/<numFmt\b([^>]*)\/?>/g)) {
        const id = Number(getAttr(m[1]!, 'numFmtId'));
        const code = getAttr(m[1]!, 'formatCode');
        if (Number.isFinite(id) && code !== undefined) numFmts.set(id, unescapeXml(code));
      }
    }
    const fontSizes: number[] = [];
    const fontsEl = findElement(xml, 'fonts');
    if (fontsEl) {
      for (const m of fontsEl.text.matchAll(/<font\b[^>]*?(?:\/>|>([\s\S]*?)<\/font>)/g)) {
        const sz = /<sz\b[^>]*val="([\d.]+)"/.exec(m[1] ?? '')?.[1];
        fontSizes.push(sz ? Number(sz) : 11);
      }
    }
    const defaultFontSize = fontSizes[0] ?? 11;
    const infos: StyleInfo[] = [];
    const xfsEl = findElement(xml, 'cellXfs');
    if (xfsEl) {
      for (const m of xfsEl.text.matchAll(/<xf\b([^>]*?)(?:\/>|>([\s\S]*?)<\/xf>)/g)) {
        const attrs = m[1]!;
        const numFmtId = Number(getAttr(attrs, 'numFmtId') ?? 0);
        const fontId = Number(getAttr(attrs, 'fontId') ?? 0);
        const code = numFmts.get(numFmtId);
        const isDate =
          code !== undefined ? isDateFormatCode(code) : BUILTIN_DATE_FORMATS.has(numFmtId);
        const alignment = /<alignment\b([^>]*)\/?>/.exec(m[2] ?? '')?.[1] ?? '';
        const wrap =
          getAttr(alignment, 'wrapText') === '1' || getAttr(alignment, 'wrapText') === 'true';
        infos.push({ isDate, fontSize: fontSizes[fontId] ?? defaultFontSize, wrap });
      }
    }
    return new StyleBook(infos, defaultFontSize);
  }

  get(style: number): StyleInfo {
    return this.infos[style] ?? { isDate: false, fontSize: this.defaultFontSize, wrap: false };
  }
}

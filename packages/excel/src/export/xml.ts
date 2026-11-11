/**
 * Small string-level XML helpers for SpreadsheetML parts. The export engine edits the template's
 * XML in place (only the elements it has to change) so everything else stays byte-identical.
 */
import { randomUUID } from 'node:crypto';

const XML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

/** Escapes text for an attribute value or element content. */
export function escapeXml(s: string): string {
  return stripInvalidXmlChars(s).replace(/[&<>"']/g, (ch) => XML_ESCAPES[ch]!);
}

/** Removes characters that are not allowed in XML 1.0 (control characters except tab/CR/LF). */
export function stripInvalidXmlChars(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '');
}

export function unescapeXml(s: string): string {
  return s.replace(/&(lt|gt|amp|quot|apos|#x[0-9a-fA-F]+|#\d+);/g, (m, ent: string) => {
    switch (ent) {
      case 'lt':
        return '<';
      case 'gt':
        return '>';
      case 'amp':
        return '&';
      case 'quot':
        return '"';
      case 'apos':
        return "'";
      default: {
        const code =
          ent[1] === 'x' ? Number.parseInt(ent.slice(2), 16) : Number.parseInt(ent.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
    }
  });
}

/** Decodes OOXML `_xHHHH_` escapes used in shared strings (e.g. `_x000D_` for CR). */
export function decodeOoxmlEscapes(s: string): string {
  return s.replace(/_x([0-9A-Fa-f]{4})_/g, (_m, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  );
}

/** Raw (still escaped) value of an attribute in an attribute string, or undefined. */
export function getAttr(attrs: string, name: string): string | undefined {
  const re = new RegExp(`(?:^|\\s)${name.replace(/[:.]/g, '\\$&')}="([^"]*)"`);
  return re.exec(attrs)?.[1];
}

/**
 * Sets (or with `null` removes) an attribute in an attribute string. `value` is raw: escape it
 * first when it may contain special characters.
 */
export function setAttr(attrs: string, name: string, value: string | null): string {
  const re = new RegExp(`(\\s)${name.replace(/[:.]/g, '\\$&')}="[^"]*"`);
  if (re.test(attrs)) {
    return value === null ? attrs.replace(re, '') : attrs.replace(re, `$1${name}="${value}"`);
  }
  if (value === null) return attrs;
  return `${attrs} ${name}="${value}"`;
}

/** Text content of all `<t>` elements of a string item (`<si>`/`<is>`), skipping phonetic runs. */
export function stringItemText(xml: string): string {
  const withoutPhonetic = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
  let out = '';
  for (const m of withoutPhonetic.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>|<t\b[^>]*\/>/g))
    out += m[1] ?? '';
  return decodeOoxmlEscapes(unescapeXml(out));
}

/** Finds the first element `<tag …>…</tag>` or `<tag …/>`; returns its span in the string. */
export function findElement(
  xml: string,
  tag: string,
  from = 0,
): { start: number; end: number; text: string } | null {
  const re = new RegExp(`<${tag.replace(/[:.]/g, '\\$&')}(?=[\\s/>])`, 'g');
  re.lastIndex = from;
  const m = re.exec(xml);
  if (!m) return null;
  const start = m.index;
  const openEnd = xml.indexOf('>', start);
  if (openEnd < 0) return null;
  if (xml[openEnd - 1] === '/')
    return { start, end: openEnd + 1, text: xml.slice(start, openEnd + 1) };
  const close = `</${tag}>`;
  const closeAt = xml.indexOf(close, openEnd);
  if (closeAt < 0) return null;
  const end = closeAt + close.length;
  return { start, end, text: xml.slice(start, end) };
}

/** Replaces every element `<tag …>…</tag>` / `<tag …/>` using `fn` (return the new text, '' removes it). */
export function replaceElements(xml: string, tag: string, fn: (text: string) => string): string {
  let out = '';
  let pos = 0;
  for (;;) {
    const el = findElement(xml, tag, pos);
    if (!el) break;
    out += xml.slice(pos, el.start) + fn(el.text);
    pos = el.end;
  }
  return out + xml.slice(pos);
}

/** Attribute string of an element's opening tag (`<tag a="1" b="2">` → ` a="1" b="2"`). */
export function openTagAttrs(elementText: string): string {
  const m = /^<[\w:.]+((?:\s+[\w:.-]+="[^"]*")*)\s*\/?>/.exec(elementText);
  return m ? m[1]! : '';
}

/** Replaces the attribute string of an element's opening tag. */
export function withOpenTagAttrs(elementText: string, attrs: string): string {
  return elementText.replace(
    /^<([\w:.]+)((?:\s+[\w:.-]+="[^"]*")*)(\s*\/?>)/,
    (_m, tag: string, _a, end: string) => `<${tag}${attrs}${end}`,
  );
}

/** Random GUID in Excel's `{XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}` form. */
export function newGuid(): string {
  return `{${randomUUID().toUpperCase()}}`;
}

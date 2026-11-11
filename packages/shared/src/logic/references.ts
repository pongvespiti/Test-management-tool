/**
 * Requirement / Jira / spec references of a test case (free text in `refs`).
 *
 * Items are separated by comma, semicolon or a new line. An item that looks like an id —
 * letters then a number, in any spelling ("req 1", "REQ_01", "Req-1") — gets one canonical form
 * (`REQ-1`, `REQ-01`); anything else (a section number, a short note) is kept as typed, so the
 * same requirement is counted once however it was written.
 */
const ID_LIKE = /^([A-Za-z][A-Za-z0-9]*)[\s_-]*(\d[\w.]*)$/;
const SEPARATOR = /[,;\n\r]+/;

/** Canonical form of one reference item ('' for blank input). */
export function normalizeReference(item: string): string {
  const text = item.trim().replace(/\s+/g, ' ');
  const m = ID_LIKE.exec(text);
  return m ? `${m[1]!.toUpperCase()}-${m[2]!.toUpperCase()}` : text;
}

/** Distinct canonical references of a `refs` text, in the order written. */
export function parseReferences(text: string | null | undefined): string[] {
  if (!text) return [];
  const seen = new Set<string>();
  for (const part of text.split(SEPARATOR)) {
    const ref = normalizeReference(part);
    if (ref) seen.add(ref);
  }
  return [...seen];
}

/** `refs` text rewritten with canonical items joined by ", " (null when there is none). */
export function normalizeReferences(text: string | null | undefined): string | null {
  const refs = parseReferences(text);
  return refs.length > 0 ? refs.join(', ') : null;
}

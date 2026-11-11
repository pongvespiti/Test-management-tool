/**
 * Turns a label into a placeholder/field key: lower-case ASCII letters, digits and `_`.
 * `"Expected result of device"` → `expected_result_of_device`, `"OS(ver)"` → `os_ver`.
 */
export function slugKey(label: string, maxLength = 40): string {
  let s = label
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (s === '') s = 'field';
  if (/^[0-9]/.test(s)) s = `f_${s}`;
  return s.slice(0, maxLength).replace(/_+$/g, '');
}

/** Makes `key` unique against `taken` by appending `_2`, `_3`, … */
export function uniqueKey(key: string, taken: Iterable<string>): string {
  const set = new Set(taken);
  if (!set.has(key)) return key;
  for (let i = 2; ; i++) {
    const candidate = `${key}_${i}`;
    if (!set.has(candidate)) return candidate;
  }
}

/**
 * Normalises multi-line text from Excel/forms: CRLF → LF, trailing spaces trimmed per line,
 * leading/trailing blank lines removed, 3+ blank lines collapsed. Returns null for empty text.
 */
export function normalizeText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const lines = String(value)
    .replace(/\r\n?/g, '\n')
    .replace(/ /g, ' ')
    .split('\n')
    .map((l) => l.replace(/[ \t]+$/g, ''));
  while (lines.length && lines[0]!.trim() === '') lines.shift();
  while (lines.length && lines[lines.length - 1]!.trim() === '') lines.pop();
  const out = lines.join('\n').replace(/\n{3,}/g, '\n\n');
  return out === '' ? null : out;
}

/** Single-line version: whitespace (incl. line breaks) collapsed to one space. */
export function normalizeLine(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).replace(/\s+/g, ' ').trim();
  return s === '' ? null : s;
}

/** System id shown in the UI, e.g. `MBS-036`. */
export function displayId(prefix: string, seq: number): string {
  return `${prefix}-${String(seq).padStart(3, '0')}`;
}

export function defectKey(seq: number): string {
  return `BUG-${seq}`;
}

/** Safe file name for downloads (keeps letters/digits incl. Thai, removes path characters). */
export function safeFileName(name: string, fallback = 'download'): string {
  const s = name
    // Control characters are not allowed in file names, so matching them is intended.
    // oxlint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 150);
  return s === '' ? fallback : s;
}

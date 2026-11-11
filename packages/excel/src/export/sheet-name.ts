/** Excel's limits for sheet names. */
export const MAX_SHEET_NAME = 31;
const INVALID = /[\\/?*[\]:]/g;

/**
 * Makes a valid, unique sheet name from a run code: removes `\ / ? * [ ] :` and control characters,
 * trims spaces and apostrophes at both ends, cuts to 31 characters, avoids the reserved name
 * "History", and appends " (2)", " (3)"… when the name is taken (case-insensitive, like Excel).
 */
export function sanitizeSheetName(
  name: string,
  taken: Iterable<string> = [],
  fallback = 'Run',
): string {
  let base = name
    // Control characters are not allowed in sheet names, so matching them is intended.
    // oxlint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(INVALID, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^'+|'+$/g, '')
    .trim();
  if (base === '') base = fallback;
  if (base.toLowerCase() === 'history') base = `${base} (1)`;
  base = cut(base, MAX_SHEET_NAME);
  const used = new Set([...taken].map((t) => t.toLowerCase()));
  if (!used.has(base.toLowerCase())) return base;
  for (let i = 2; ; i++) {
    const suffix = ` (${i})`;
    const candidate = `${cut(base, MAX_SHEET_NAME - suffix.length)
      .replace(/'+$/, '')
      .trimEnd()}${suffix}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
}

/** Cuts by code points so surrogate pairs (emoji, rare CJK) are never split. */
function cut(s: string, max: number): string {
  const chars = [...s];
  return chars.length <= max ? s : chars.slice(0, max).join('').trimEnd();
}

/** Sheet name as it appears in formulas and defined names (`'My sheet'!A1`, `Data!A1`). */
export function quoteSheetName(name: string): string {
  if (
    /^[A-Za-z_][A-Za-z0-9_.]*$/.test(name) &&
    !/^[A-Za-z]{1,3}\d+$/.test(name) &&
    !/^(r|c|rc)\d*$/i.test(name)
  ) {
    return name;
  }
  return `'${name.replace(/'/g, "''")}'`;
}

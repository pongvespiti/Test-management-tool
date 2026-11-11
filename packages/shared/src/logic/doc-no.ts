/**
 * Document number helper. Pattern tokens: `{YY}`, `{YYYY}`, `{MM}`, `{SEQ}`.
 * Default pattern follows the team's controlled documents: `26TR-TEAM-10-61`.
 */
export const DEFAULT_DOC_NO_PATTERN = '{YY}TR-TEAM-{MM}-{SEQ}';

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Fills the date tokens and returns the prefix before `{SEQ}` (and the suffix after it). */
function expand(pattern: string, date: Date): { before: string; after: string } {
  const yyyy = String(date.getFullYear());
  const yy = yyyy.slice(2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const filled = pattern
    .replace(/\{YYYY\}/g, yyyy)
    .replace(/\{YY\}/g, yy)
    .replace(/\{MM\}/g, mm);
  const idx = filled.indexOf('{SEQ}');
  if (idx === -1) return { before: filled, after: '' };
  return { before: filled.slice(0, idx), after: filled.slice(idx + '{SEQ}'.length) };
}

/**
 * Suggests the next document number for `date`: the highest sequence already used with the same
 * prefix (ignoring spaces, as in "25TR-TEAM-10- 46") plus one. Users can always overwrite it — the
 * official number comes from document control.
 */
export function suggestDocNo(
  existing: Iterable<string>,
  date: Date,
  pattern: string = DEFAULT_DOC_NO_PATTERN,
): string {
  const effective = pattern.trim() || DEFAULT_DOC_NO_PATTERN;
  const { before, after } = expand(effective, date);
  if (!effective.includes('{SEQ}')) return before;
  const re = new RegExp(`^${escapeRegExp(before)}\\s*(\\d+)${escapeRegExp(after)}$`);
  let max = 0;
  for (const doc of existing) {
    const m = re.exec(doc.trim());
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${before}${max + 1}${after}`;
}

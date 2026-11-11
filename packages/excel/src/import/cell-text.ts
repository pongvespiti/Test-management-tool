/**
 * Converts an ExcelJS cell value to the text a user sees in Excel (spec §7.2):
 * rich text joined, formulas → cached result, dates → ISO date, numbers without float noise
 * (respecting fixed-decimal and percent formats), booleans → TRUE/FALSE, CRLF → LF.
 */
export function cellText(value: unknown, numFmt?: string | null): string {
  return normaliseNewlines(rawText(value, numFmt));
}

function normaliseNewlines(s: string): string {
  return s.replace(/\r\n?/g, '\n');
}

function rawText(value: unknown, numFmt?: string | null): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return formatNumber(value, numFmt);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (value instanceof Date) return formatDate(value, numFmt);
  if (typeof value === 'object') {
    const v = value as Record<string, unknown>;
    if (Array.isArray(v.richText)) {
      return (v.richText as { text?: unknown }[]).map((run) => String(run.text ?? '')).join('');
    }
    if ('result' in v || 'formula' in v || 'sharedFormula' in v) {
      return rawText(v.result, numFmt);
    }
    if ('hyperlink' in v || 'text' in v) {
      return rawText(v.text, numFmt);
    }
    if ('error' in v) return String(v.error ?? '');
  }
  return '';
}

/** Number → text: fixed decimals from formats like `0.0`/`#,##0.00`, percent formats, else ≤15 significant digits. */
export function formatNumber(n: number, numFmt?: string | null): string {
  if (!Number.isFinite(n)) return String(n);
  const fmt = (numFmt ?? '').split(';')[0] ?? '';
  if (fmt && fmt !== 'General' && fmt !== '@') {
    const decimals = /0\.(0+)/.exec(fmt)?.[1]?.length ?? 0;
    if (fmt.includes('%')) return `${(n * 100).toFixed(decimals)}%`;
    if (/0\.0+/.test(fmt)) return n.toFixed(decimals);
  }
  // Remove binary floating point noise: 0.1 + 0.2 → 0.3
  const clean = Number.parseFloat(n.toPrecision(15));
  return String(clean);
}

function formatDate(d: Date, numFmt?: string | null): string {
  if (Number.isNaN(d.getTime())) return '';
  const iso = d.toISOString();
  const fmt = (numFmt ?? '').toLowerCase();
  // A time part is shown when the format has hours or seconds (minutes alone are ambiguous with months).
  const hasTime = /h|s/.test(fmt.replace(/"[^"]*"/g, ''));
  if (hasTime) return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
  return iso.slice(0, 10);
}

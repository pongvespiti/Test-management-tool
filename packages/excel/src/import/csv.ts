/**
 * Minimal RFC-4180 CSV parser: BOM, quoted fields with "" escapes and embedded line breaks,
 * CRLF/LF/CR line endings, delimiter auto-detection (`,` `;` tab).
 */
export function parseCsv(input: string, delimiter?: string): string[][] {
  let text = input;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const delim = delimiter ?? detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < n) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"' && field === '') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === delim) {
      endField();
      i++;
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      endRow();
      if (ch === '\r' && text[i + 1] === '\n') i++;
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  // Last row (unless the file ended with a newline and nothing after it).
  if (field !== '' || row.length > 0) endRow();

  // Drop trailing completely empty rows.
  while (rows.length && rows[rows.length - 1]!.every((c) => c === '')) rows.pop();
  return rows;
}

/** Picks the delimiter that occurs most often (outside quotes) in the first non-empty line. */
export function detectDelimiter(text: string): string {
  const candidates = [',', ';', '\t'];
  const counts = new Map<string, number>(candidates.map((c) => [c, 0]));
  let inQuotes = false;
  let seenContent = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (inQuotes) continue;
    if (ch === '\n' || ch === '\r') {
      if (seenContent) break;
      continue;
    }
    seenContent = true;
    if (counts.has(ch)) counts.set(ch, counts.get(ch)! + 1);
  }
  let best = ',';
  let bestCount = 0;
  for (const c of candidates) {
    const k = counts.get(c)!;
    if (k > bestCount) {
      best = c;
      bestCount = k;
    }
  }
  return best;
}

/** Saves text generated in the browser (e.g. a CSV) through a temporary link. */
export function saveTextFile(name: string, text: string, mime = 'text/csv;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** One CSV cell: quoted when it holds a comma, quote or line break. */
export function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** CSV text with a UTF-8 byte-order mark so Excel reads Thai and other non-ASCII text. */
export function toCsv(rows: readonly (readonly (string | number)[])[]): string {
  return `﻿${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

/** Pure helpers of the summary tab: the view in the URL, labels, saved-view matching, CSV. */
import {
  RESULT_LABELS,
  RESULT_STATUSES,
  filtersToParams,
  paramsToFilters,
  passRateOf,
  type SavedViewDTO,
  type SummaryDTO,
  type SummaryFilters,
} from '@tmt/shared';
import type { SummaryView } from '@/lib/api/reports';

export const NOT_SET_LABEL = '(not set)';

/** A row or column value as text ('' = the runs do not say). */
export function valueLabel(value: string): string {
  return value === '' ? NOT_SET_LABEL : value;
}

/** Label of a dimension key: environment labels as they are, built-ins by name. */
export function dimensionLabel(data: SummaryDTO | undefined, key: string): string {
  return data?.dimensions.find((d) => d.key === key)?.label ?? key.replace(/^@/, '');
}

export function readView(params: URLSearchParams): SummaryView {
  return {
    rows: params.get('rows') || null,
    cols: params.get('cols') || null,
    filters: paramsToFilters(params.getAll('f')),
  };
}

/** Writes the view into the URL params (other params such as `tab` and `release` are kept). */
export function writeView(prev: URLSearchParams, view: SummaryView): URLSearchParams {
  const next = new URLSearchParams(prev);
  next.delete('rows');
  next.delete('cols');
  next.delete('f');
  if (view.rows) next.set('rows', view.rows);
  if (view.cols) next.set('cols', view.cols);
  for (const f of filtersToParams(view.filters)) next.append('f', f);
  return next;
}

/** Filters without the keys that have no value chosen. */
export function cleanFilters(filters: SummaryFilters): SummaryFilters {
  return Object.fromEntries(Object.entries(filters).filter(([, v]) => v.length > 0));
}

export function filterCount(view: SummaryView): number {
  return Object.keys(cleanFilters(view.filters)).length;
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  const sortedB = b.toSorted();
  return a.length === b.length && a.toSorted().every((v, i) => v === sortedB[i]);
}

/** True when the saved view is exactly what is on screen. */
export function sameView(a: SummaryView, b: SummaryView): boolean {
  if (a.rows !== b.rows || a.cols !== b.cols) return false;
  const fa = cleanFilters(a.filters);
  const fb = cleanFilters(b.filters);
  const keys = Object.keys(fa);
  return (
    keys.length === Object.keys(fb).length && keys.every((k) => fb[k] && sameList(fa[k]!, fb[k]!))
  );
}

export function activeSavedView(
  views: readonly SavedViewDTO[],
  view: SummaryView,
): SavedViewDTO | null {
  return views.find((v) => sameView(v.config, view)) ?? null;
}

/** Pass rate of a cell as text: "75%", or "—" when nothing counts. */
export function rateText(rate: number | null): string {
  return rate === null ? '—' : `${Math.round(rate * 100)}%`;
}

function esc(v: string | number): string {
  const t = String(v);
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

/** Table as CSV: a row per row value; with columns, a pair of columns (runs, pass rate) per value. */
export function summaryCsv(data: SummaryDTO): string {
  const rowName = data.rows ? dimensionLabel(data, data.rows) : 'All runs';
  const lines: string[] = [];
  if (!data.cols) {
    lines.push(
      [rowName, 'Runs', 'Pass rate', ...RESULT_STATUSES.map((s) => RESULT_LABELS[s])]
        .map(esc)
        .join(','),
    );
    for (const row of data.rowValues) {
      const cell = data.cells.find((c) => c.row === row);
      if (!cell) continue;
      lines.push(
        [
          valueLabel(row),
          cell.runs.length,
          rateText(passRateOf(cell.counts)),
          ...RESULT_STATUSES.map((s) => cell.counts[s]),
        ]
          .map(esc)
          .join(','),
      );
    }
    return lines.join('\n') + '\n';
  }
  const colName = dimensionLabel(data, data.cols);
  lines.push(
    [
      `${rowName} \\ ${colName}`,
      ...data.colValues.flatMap((c) => [`${valueLabel(c)} runs`, `${valueLabel(c)} pass rate`]),
    ]
      .map(esc)
      .join(','),
  );
  for (const row of data.rowValues) {
    const cells = data.colValues.map((col) =>
      data.cells.find((c) => c.row === row && c.col === col),
    );
    lines.push(
      [
        valueLabel(row),
        ...cells.flatMap((c) => (c ? [c.runs.length, rateText(passRateOf(c.counts))] : ['', ''])),
      ]
        .map(esc)
        .join(','),
    );
  }
  return lines.join('\n') + '\n';
}

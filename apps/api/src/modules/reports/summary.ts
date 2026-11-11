import {
  SUMMARY_BUILD,
  SUMMARY_RELEASE,
  SUMMARY_TOPIC,
  addCounts,
  emptyCounts,
  envKey,
  type EnvEntryDTO,
  type StatusCounts,
  type SummaryCellDTO,
  type SummaryDTO,
  type SummaryDimensionDTO,
  type SummaryFilters,
} from '@tmt/shared';

/** One run with its result counts, as the summary sees it. */
export interface SummaryRun {
  id: number;
  planId: number;
  code: string;
  environment: readonly EnvEntryDTO[];
  topic: string | null;
  release: string | null;
  build: string | null;
  counts: StatusCounts;
}

export interface SummaryOptions {
  rows: string | null;
  cols: string | null;
  filters: SummaryFilters;
  /** Labels of the project's environment lists, in list order (decides the order of dimensions). */
  labelOrder: readonly string[];
}

const BUILTINS: readonly { key: string; label: string }[] = [
  { key: SUMMARY_TOPIC, label: 'Topic' },
  { key: SUMMARY_RELEASE, label: 'Release' },
  { key: SUMMARY_BUILD, label: 'Build' },
];

/** The value a run has on one dimension; '' when the run does not say. */
export function valueOfRun(run: SummaryRun, key: string): string {
  if (key === SUMMARY_TOPIC) return run.topic?.trim() ?? '';
  if (key === SUMMARY_RELEASE) return run.release?.trim() ?? '';
  if (key === SUMMARY_BUILD) return run.build?.trim() ?? '';
  const k = envKey(key);
  const entry = run.environment.find((e) => envKey(e.label) === k);
  return entry?.value.trim() ?? '';
}

/** Natural order (2 < 10, 15 < 15.1), the empty value last. */
export function compareValues(a: string, b: string): number {
  if (a === b) return 0;
  if (a === '') return 1;
  if (b === '') return -1;
  return a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });
}

function matches(run: SummaryRun, filters: SummaryFilters, skip?: string): boolean {
  for (const [key, values] of Object.entries(filters)) {
    if (key === skip || values.length === 0) continue;
    const v = envKey(valueOfRun(run, key));
    if (!values.some((x) => envKey(x) === v)) return false;
  }
  return true;
}

/** Labels offered as dimensions: the lists' labels, then any other label used by a run. */
function environmentLabels(runs: readonly SummaryRun[], order: readonly string[]): string[] {
  const seen = new Map<string, string>();
  for (const label of order) if (!seen.has(envKey(label))) seen.set(envKey(label), label);
  const extra: string[] = [];
  for (const r of runs) {
    for (const e of r.environment) {
      const k = envKey(e.label);
      if (k && !seen.has(k)) {
        seen.set(k, e.label.trim());
        extra.push(k);
      }
    }
  }
  const listed = order.map((l) => seen.get(envKey(l))!).filter((l, i, a) => a.indexOf(l) === i);
  return [...listed, ...extra.toSorted().map((k) => seen.get(k)!)];
}

/**
 * Filters the runs, offers the dimensions with the values seen (counted with the filters of the
 * other dimensions applied, so choosing Android narrows the OS versions) and sums the result
 * counts per row/column value. A dimension no run carries is not offered.
 */
export function summaryOf(runs: readonly SummaryRun[], opts: SummaryOptions): SummaryDTO {
  const filters = opts.filters;
  const dims: { key: string; label: string; builtin: boolean }[] = [
    ...environmentLabels(runs, opts.labelOrder).map((label) => ({
      key: label,
      label,
      builtin: false,
    })),
    ...BUILTINS.map((b) => ({ ...b, builtin: true })),
  ];
  const dimensions: SummaryDimensionDTO[] = dims
    .map((d) => {
      const counts = new Map<string, number>();
      for (const r of runs) {
        if (!matches(r, filters, d.key)) continue;
        const v = valueOfRun(r, d.key);
        counts.set(v, (counts.get(v) ?? 0) + 1);
      }
      for (const [key, values] of Object.entries(filters)) {
        if (envKey(key) !== envKey(d.key)) continue;
        for (const v of values)
          if (![...counts.keys()].some((c) => envKey(c) === envKey(v))) counts.set(v, 0);
      }
      const options = [...counts.entries()]
        .map(([value, n]) => ({ value, runs: n }))
        .toSorted((a, b) => compareValues(a.value, b.value));
      return { ...d, options };
    })
    // A dimension no run carries is of no use as a filter or grouping.
    .filter((d) => runs.some((r) => valueOfRun(r, d.key) !== ''));

  const kept = runs.filter((r) => matches(r, filters));
  const cells = new Map<string, SummaryCellDTO>();
  const rowSet = new Set<string>();
  const colSet = new Set<string>();
  let total = emptyCounts();
  for (const r of kept) {
    const row = opts.rows ? valueOfRun(r, opts.rows) : '';
    const col = opts.cols ? valueOfRun(r, opts.cols) : '';
    rowSet.add(row);
    colSet.add(col);
    const id = `${row}\u0000${col}`;
    let cell = cells.get(id);
    if (!cell) {
      cell = { row, col, counts: emptyCounts(), runs: [] };
      cells.set(id, cell);
    }
    cell.counts = addCounts(cell.counts, r.counts);
    cell.runs.push({ id: r.id, planId: r.planId, code: r.code });
    total = addCounts(total, r.counts);
  }
  return {
    dimensions,
    rows: opts.rows,
    cols: opts.cols,
    rowValues: [...rowSet].toSorted(compareValues),
    colValues: [...colSet].toSorted(compareValues),
    cells: [...cells.values()],
    totals: { counts: total, runs: kept.length },
    scopeRuns: runs.length,
  };
}

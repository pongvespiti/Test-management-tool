/** Filters of a summary view ⇄ the repeated `f=key=value` query parameters. */

export type SummaryFilters = Record<string, string[]>;

/** `{ Platform: ['Android'] }` → `['Platform=Android']`; empty lists are dropped. */
export function filtersToParams(filters: SummaryFilters): string[] {
  const out: string[] = [];
  for (const key of Object.keys(filters).toSorted()) {
    for (const v of filters[key] ?? []) out.push(`${key}=${v}`);
  }
  return out;
}

/** Inverse of {@link filtersToParams}; splits at the first "=" so values may contain one. */
export function paramsToFilters(params: readonly string[]): SummaryFilters {
  const out: SummaryFilters = {};
  for (const p of params) {
    const i = p.indexOf('=');
    if (i <= 0) continue;
    const key = p.slice(0, i);
    const value = p.slice(i + 1);
    const list = (out[key] ??= []);
    if (!list.includes(value)) list.push(value);
  }
  return out;
}

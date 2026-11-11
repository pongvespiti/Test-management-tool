import { addCounts, emptyCounts, totalOf, type StatusCounts, type TopicState } from '@tmt/shared';

/** Not started = nothing recorded; done = nothing left untested; otherwise in progress. */
export function stateOf(counts: StatusCounts): TopicState {
  const total = totalOf(counts);
  if (total === 0 || counts.untested === total) return 'not_started';
  return counts.untested === 0 ? 'done' : 'in_progress';
}

/** Past the due date (`YYYY-MM-DD`, compared as text) while the work is not done. */
export function isOverdue(dueDate: string | null, today: string, state: TopicState): boolean {
  return dueDate !== null && state !== 'done' && dueDate < today;
}

export function sumCounts(list: readonly StatusCounts[]): StatusCounts {
  return list.reduce((sum, c) => addCounts(sum, c), emptyCounts());
}

/** Earliest of the due dates (ISO dates sort as text); null when there is none. */
export function earliest(dates: ReadonlyArray<string | null>): string | null {
  const set = dates.filter((d): d is string => d !== null).toSorted();
  return set[0] ?? null;
}

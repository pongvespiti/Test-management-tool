import {
  COMPARE_CHANGES,
  type CompareChange,
  type CompareRowDTO,
  type ResultStatus,
} from '@tmt/shared';

/** The latest result of one library case on one side, with how the case is shown. */
export interface SideResult {
  testCaseId: number;
  displayId: string;
  title: string;
  suite: string;
  status: ResultStatus;
}

const GOOD: ReadonlySet<ResultStatus> = new Set(['ok', 'ok_cond']);
const BAD: ReadonlySet<ResultStatus> = new Set(['ng', 'blocked']);

/**
 * What happened to a case from the base to the target: OK → NG/Blocked is a regression, the other
 * way round is fixed; a case that is not run (untested, N/T, N/A) on the target of a case that had a
 * verdict is "not run"; a verdict on the target of a case that had none is "newly run".
 */
export function classify(base: ResultStatus | null, target: ResultStatus | null): CompareChange {
  if (base === null) return 'only_target';
  if (target === null) return 'only_base';
  const baseGood = GOOD.has(base);
  const baseBad = BAD.has(base);
  const targetGood = GOOD.has(target);
  const targetBad = BAD.has(target);
  if (baseGood && targetBad) return 'regression';
  if (baseBad && targetGood) return 'fixed';
  if (baseBad && targetBad) return 'still_failing';
  if ((baseGood || baseBad) && !targetGood && !targetBad) return 'not_run';
  if (!baseGood && !baseBad && (targetGood || targetBad)) return 'newly_run';
  return 'unchanged';
}

/** Rows of cases on either side, regressions first and unchanged cases last. */
export function compareResults(
  base: readonly SideResult[],
  target: readonly SideResult[],
): { rows: CompareRowDTO[]; summary: Record<CompareChange, number> } {
  const baseBy = new Map(base.map((r) => [r.testCaseId, r]));
  const targetBy = new Map(target.map((r) => [r.testCaseId, r]));
  const ids = new Set([...baseBy.keys(), ...targetBy.keys()]);
  const summary = Object.fromEntries(COMPARE_CHANGES.map((c) => [c, 0])) as Record<
    CompareChange,
    number
  >;
  const rows: CompareRowDTO[] = [];
  for (const id of ids) {
    const b = baseBy.get(id);
    const t = targetBy.get(id);
    const shown = (t ?? b)!;
    const change = classify(b?.status ?? null, t?.status ?? null);
    summary[change] += 1;
    rows.push({
      testCaseId: id,
      displayId: shown.displayId,
      title: shown.title,
      suite: shown.suite,
      base: b?.status ?? null,
      target: t?.status ?? null,
      change,
    });
  }
  const rank = (c: CompareChange) => COMPARE_CHANGES.indexOf(c);
  rows.sort(
    (a, b) =>
      rank(a.change) - rank(b.change) ||
      a.suite.localeCompare(b.suite, 'en', { numeric: true }) ||
      a.displayId.localeCompare(b.displayId, 'en', { numeric: true }),
  );
  return { rows, summary };
}

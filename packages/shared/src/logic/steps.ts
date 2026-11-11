import type { ResultStatus } from '../enums';
import type { CaseStepDTO, PlainStepDTO, RunStepDTO } from '../dto';

/**
 * Flattens library steps into run-snapshot steps: shared steps are expanded in place and carry
 * their name; a missing shared step contributes nothing.
 */
export function flattenSteps(steps: readonly CaseStepDTO[]): RunStepDTO[] {
  const out: RunStepDTO[] = [];
  for (const s of steps) {
    if (s.kind === 'step') {
      out.push({ action: s.action, expected: s.expected, sharedStepName: null });
    } else if (!s.missing) {
      for (const p of s.steps) {
        out.push({ action: p.action, expected: p.expected, sharedStepName: s.name });
      }
    }
  }
  return out;
}

/**
 * Text form of steps, as used by Excel exports and the `text` view:
 * `1. action` lines for the procedure and `1. expected` lines for the expected result
 * (steps without an expected result are skipped there, keeping their number).
 */
export function stepsToText(steps: readonly PlainStepDTO[]): {
  procedure: string;
  expected: string;
} {
  const procedure: string[] = [];
  const expected: string[] = [];
  steps.forEach((s, i) => {
    const n = `${i + 1}. `;
    procedure.push(n + s.action.trim());
    if (s.expected.trim() !== '') expected.push(n + s.expected.trim());
  });
  return { procedure: procedure.join('\n'), expected: expected.join('\n') };
}

/**
 * "Worst wins" order used to combine several results into one (step results → case result,
 * several JUnit tests mapped to one run case): NG > Blocked > N/T > OK w/ cond. > OK > N/A.
 */
export const RESULT_SEVERITY_ORDER: readonly ResultStatus[] = [
  'ng',
  'blocked',
  'nt',
  'ok_cond',
  'ok',
  'na',
  'untested',
];

/** Worst status of a non-empty list (by `RESULT_SEVERITY_ORDER`); null for an empty list. */
export function worstStatus(statuses: readonly ResultStatus[]): ResultStatus | null {
  let best: ResultStatus | null = null;
  for (const s of statuses) {
    if (best === null || RESULT_SEVERITY_ORDER.indexOf(s) < RESULT_SEVERITY_ORDER.indexOf(best)) {
      best = s;
    }
  }
  return best;
}

/**
 * Suggested case result from its step results: null while any step is untested (or no steps),
 * otherwise the worst step status.
 */
export function suggestStatusFromSteps(statuses: readonly ResultStatus[]): ResultStatus | null {
  if (statuses.length === 0 || statuses.includes('untested')) return null;
  return worstStatus(statuses);
}

/** `90` → `1h 30m`, `45` → `45m`, null/0 → ''. */
export function formatMinutes(minutes: number | null | undefined): string {
  if (!minutes) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Pure steps of a JUnit import: test outcome → result, matching and per-run-case aggregation. */
import {
  normalizeText,
  worstStatus,
  type JunitImportQuery,
  type JunitUnmatchedDTO,
  type ResultStatus,
} from '@tmt/shared';
import type { JunitMatch } from './junit-match.js';
import type { JunitTest } from './junit-parse.js';

const MAX_ACTUAL_CHARS = 20_000;
const MAX_ELAPSED_SEC = 864_000;

export function statusOf(t: JunitTest, skippedAs: JunitImportQuery['skippedAs']): ResultStatus {
  return t.outcome === 'ok' ? 'ok' : t.outcome === 'ng' ? 'ng' : skippedAs;
}

/** Actual result: messages of the tests that produced the final status (cleared for OK). */
export function actualOf(
  tests: JunitTest[],
  status: ResultStatus,
  statusFor: (t: JunitTest) => ResultStatus,
): string | null {
  if (status === 'ok') return null;
  const relevant = tests.filter((t) => statusFor(t) === status && t.message);
  if (relevant.length === 0) return null;
  const text =
    relevant.length === 1
      ? relevant[0]!.message!
      : relevant.map((t) => `${t.name || t.classname || 'test'}: ${t.message}`).join('\n\n');
  return normalizeText(text.slice(0, MAX_ACTUAL_CHARS));
}

/** Summed `time` in whole seconds (capped), or null when no test has a time. */
export function elapsedOf(tests: JunitTest[]): number | null {
  const times = tests.map((t) => t.timeSec).filter((v): v is number => v !== null);
  if (times.length === 0) return null;
  return Math.min(MAX_ELAPSED_SEC, Math.round(times.reduce((a, b) => a + b, 0)));
}

/** Tests grouped by matched run case, unmatched tests and the tests to create cases for. */
export interface MatchOutcome {
  assigned: Map<number, JunitTest[]>;
  unmatched: JunitUnmatchedDTO[];
  missing: JunitTest[];
}

export function assignTests(
  tests: readonly JunitTest[],
  match: (t: JunitTest) => JunitMatch,
  options: Pick<JunitImportQuery, 'createMissing' | 'skippedAs'>,
): MatchOutcome {
  const assigned = new Map<number, JunitTest[]>();
  const unmatched: JunitUnmatchedDTO[] = [];
  const missing: JunitTest[] = [];
  for (const t of tests) {
    const m = match(t);
    if (m.kind === 'matched') {
      const list = assigned.get(m.runCaseId);
      if (list) list.push(t);
      else assigned.set(m.runCaseId, [t]);
    } else if (m.kind === 'no_match' && options.createMissing) {
      missing.push(t);
    } else {
      unmatched.push({
        name: t.name,
        classname: t.classname,
        status: statusOf(t, options.skippedAs),
        reason: m.kind,
      });
    }
  }
  return { assigned, unmatched, missing };
}

/** The result applied to one run case: worst status of its tests, their messages and time. */
export interface AppliedResult {
  status: ResultStatus;
  tests: number;
  actual: string | null;
  elapsedSec: number | null;
}

export function combineTests(
  tests: JunitTest[],
  statusFor: (t: JunitTest) => ResultStatus,
): AppliedResult {
  const status = worstStatus(tests.map(statusFor))!;
  return {
    status,
    tests: tests.length,
    actual: actualOf(tests, status, statusFor),
    elapsedSec: elapsedOf(tests),
  };
}

/** Unmatched (not ambiguous) tests that create one library case each: by suite, class and name. */
export function groupMissing(missing: readonly JunitTest[]): Map<string, JunitTest[]> {
  const groups = new Map<string, JunitTest[]>();
  for (const t of missing) {
    const key = [t.suiteName, t.classname ?? '', t.name].join('\u0000');
    const g = groups.get(key);
    if (g) g.push(t);
    else groups.set(key, [t]);
  }
  return groups;
}

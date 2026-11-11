/**
 * Matching JUnit test cases to run cases (api.md § Automation). `auto` tries, in order: a
 * `tmt_id`/`tmt_case`/`case_id`/`test_id` property (display id or code) → test name equals the case
 * code → a display id token (`MBS-036`, `MBS_036`) in the name or classname → name equals the title
 * (case-insensitive, whitespace collapsed). The first rule that finds candidates decides; more than
 * one candidate is `ambiguous`. `code`, `display_id` and `title` use only that rule.
 */
import type { JunitMatchMode } from '@tmt/shared';
import type { JunitTest } from './junit-parse.js';

export interface MatchableRunCase {
  id: number;
  displayId: string;
  code: string | null;
  title: string;
}

export type JunitMatch =
  | { kind: 'matched'; runCaseId: number }
  | { kind: 'no_match' }
  | { kind: 'ambiguous'; candidates: number[] };

export const ID_PROPERTIES = ['tmt_id', 'tmt_case', 'case_id', 'test_id'] as const;

const DISPLAY_ID = /^([A-Za-z][A-Za-z0-9]*)[-_](\d{1,9})$/;
const DISPLAY_ID_TOKEN = /(?<![A-Za-z0-9])([A-Za-z][A-Za-z0-9]{0,9})[-_](\d{1,9})(?!\d)/g;

/** `mbs_036` / `MBS-36` → `MBS-36` (null when not shaped like a display id). */
export function canonicalDisplayId(value: string): string | null {
  const m = DISPLAY_ID.exec(value.trim());
  return m ? `${m[1]!.toUpperCase()}-${Number(m[2])}` : null;
}

/** Canonical display ids appearing in the given texts. */
export function displayIdTokens(...texts: (string | null)[]): string[] {
  const out = new Set<string>();
  for (const text of texts) {
    if (!text) continue;
    for (const m of text.matchAll(DISPLAY_ID_TOKEN)) {
      out.add(`${m[1]!.toUpperCase()}-${Number(m[2])}`);
    }
  }
  return [...out];
}

const normCode = (s: string) => s.trim().toLowerCase();
const normTitle = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

function addTo(index: Map<string, number[]>, key: string | null, id: number): void {
  if (!key) return;
  const ids = index.get(key);
  if (ids) {
    if (!ids.includes(id)) ids.push(id);
  } else {
    index.set(key, [id]);
  }
}

function union(...lists: (number[] | undefined)[]): Set<number> {
  const set = new Set<number>();
  for (const l of lists) for (const id of l ?? []) set.add(id);
  return set;
}

/** A matcher over the run's cases for one matching mode. */
export function createJunitMatcher(
  runCases: readonly MatchableRunCase[],
  mode: JunitMatchMode,
): (test: JunitTest) => JunitMatch {
  const byDisplayId = new Map<string, number[]>();
  const byCode = new Map<string, number[]>();
  const byTitle = new Map<string, number[]>();
  for (const rc of runCases) {
    addTo(byDisplayId, canonicalDisplayId(rc.displayId), rc.id);
    if (rc.code) addTo(byCode, normCode(rc.code), rc.id);
    addTo(byTitle, normTitle(rc.title), rc.id);
  }

  const rules: Record<'property' | 'code' | 'display_id' | 'title', (t: JunitTest) => Set<number>> =
    {
      property: (t) => {
        const found = new Set<number>();
        for (const key of ID_PROPERTIES) {
          const value = t.properties[key];
          if (!value) continue;
          const display = canonicalDisplayId(value);
          for (const id of union(
            display ? byDisplayId.get(display) : undefined,
            byCode.get(normCode(value)),
          )) {
            found.add(id);
          }
        }
        return found;
      },
      code: (t) => union(t.name ? byCode.get(normCode(t.name)) : undefined),
      display_id: (t) =>
        union(...displayIdTokens(t.name, t.classname).map((token) => byDisplayId.get(token))),
      title: (t) => union(t.name ? byTitle.get(normTitle(t.name)) : undefined),
    };
  const order: (keyof typeof rules)[] =
    mode === 'auto' ? ['property', 'code', 'display_id', 'title'] : [mode];

  return (test) => {
    for (const rule of order) {
      const candidates = rules[rule](test);
      if (candidates.size === 1) return { kind: 'matched', runCaseId: [...candidates][0]! };
      if (candidates.size > 1) return { kind: 'ambiguous', candidates: [...candidates] };
    }
    return { kind: 'no_match' };
  };
}

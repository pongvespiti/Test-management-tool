/**
 * Parsing of the v1.1 import targets (api.md § v1.1 Library → Import): priority, tags, estimate.
 * Pure functions; the row parser decides about warnings.
 */
import type { CasePriority } from '@tmt/shared';

const PRIORITY_WORDS: Record<string, CasePriority> = {
  critical: 'critical',
  highest: 'critical',
  blocker: 'critical',
  urgent: 'critical',
  high: 'high',
  major: 'high',
  medium: 'medium',
  normal: 'medium',
  moderate: 'medium',
  low: 'low',
  lowest: 'low',
  minor: 'low',
  trivial: 'low',
};

const PRIORITY_NUMBERS: Record<string, CasePriority> = {
  '1': 'critical',
  '2': 'high',
  '3': 'medium',
  '4': 'low',
};

/**
 * `critical` / `high` / `medium` / `low` (plus common tool synonyms such as Jira's Highest/Lowest),
 * `P1`–`P4` or `1`–`4`, case-insensitive. A known word wins over a number ("4 - Critical" from a
 * TestRail export is critical). Returns null for anything else.
 */
export function parsePriority(raw: string): CasePriority | null {
  const s = raw.trim().toLowerCase();
  if (s === '') return null;
  for (const word of s.split(/[^a-z]+/)) {
    const p = PRIORITY_WORDS[word];
    if (p) return p;
  }
  const m = /^p?\s*([1-4])(?![0-9.])/.exec(s);
  return m ? PRIORITY_NUMBERS[m[1]!]! : null;
}

/** Tags split on `,` `;` and line breaks, trimmed, empty ones dropped, case-insensitive unique. */
export function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[,;\r\n]+/)) {
    const tag = part.replace(/\s+/g, ' ').trim();
    if (tag === '' || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    out.push(tag);
  }
  return out;
}

/** Largest estimate accepted (same as the case schema). */
export const MAX_ESTIMATE_MINUTES = 100_000;

const UNIT_MINUTES: Record<string, number> = {
  h: 60,
  hr: 60,
  hrs: 60,
  hour: 60,
  hours: 60,
  m: 1,
  min: 1,
  mins: 1,
  minute: 1,
  minutes: 1,
  s: 1 / 60,
  sec: 1 / 60,
  secs: 1 / 60,
  second: 1 / 60,
  seconds: 1 / 60,
};

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

/**
 * Estimate in minutes from `90` (minutes), `1h 30m`, `1.5h`, `90 min`, `1:30` (h:mm), `1:30:00`, or
 * a time cell as read from Excel (`1899-12-30 01:30`, durations of a day or more continue into
 * 1899-12-31…). Returns null when the text is empty or not an estimate.
 */
export function parseEstimate(raw: string | null | undefined): number | null {
  const s = (raw ?? '').trim().toLowerCase();
  if (s === '') return null;
  let minutes: number | null = null;

  const excel = /^(\d{4})-(\d{2})-(\d{2})[ t](\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (excel) {
    const days = (Date.UTC(+excel[1]!, +excel[2]! - 1, +excel[3]!) - EXCEL_EPOCH) / 86_400_000;
    if (days >= 0 && days < 70) {
      minutes = days * 1440 + +excel[4]! * 60 + +excel[5]! + (excel[6] ? +excel[6] / 60 : 0);
    }
  } else if (/^\d+(\.\d+)?$/.test(s)) {
    minutes = Number(s);
  } else {
    const clock = /^(\d+):(\d{1,2})(?::(\d{1,2}))?$/.exec(s);
    if (clock) {
      minutes = +clock[1]! * 60 + +clock[2]! + (clock[3] ? +clock[3] / 60 : 0);
    } else {
      const tokens = /(\d+(?:\.\d+)?)\s*([a-z]+)/g;
      let total = 0;
      let matched = false;
      let rest = s;
      for (const m of s.matchAll(tokens)) {
        const factor = UNIT_MINUTES[m[2]!];
        if (factor === undefined) return null;
        total += Number(m[1]) * factor;
        matched = true;
        rest = rest.replace(m[0], ' ');
      }
      if (matched && /^[\s,+&]*(and[\s,]*)*$/.test(rest)) minutes = total;
    }
  }
  if (minutes === null || !Number.isFinite(minutes)) return null;
  const rounded = Math.round(minutes);
  return rounded >= 0 && rounded <= MAX_ESTIMATE_MINUTES ? rounded : null;
}

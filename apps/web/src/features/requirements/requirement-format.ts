import {
  JIRA_KEY_PATTERN,
  type RequirementJiraResultDTO,
  type RequirementSource,
} from '@tmt/shared';
import type { Tone } from '@/lib/status';
import { BLUE, GRAY, GREEN } from '@/lib/status';

export const REQUIREMENT_SOURCE_TONES: Record<RequirementSource, Tone> = {
  manual: GRAY,
  excel: GREEN,
  jira: BLUE,
};

/** Issue keys typed into the Jira box: separated by commas, spaces or new lines. */
export function parseJiraKeys(text: string): { keys: string[]; invalid: string[] } {
  const parts = text
    .split(/[\s,;]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const keys: string[] = [];
  const invalid: string[] = [];
  for (const p of parts) {
    if (!JIRA_KEY_PATTERN.test(p)) {
      if (!invalid.includes(p)) invalid.push(p);
    } else if (!keys.some((k) => k.toLowerCase() === p.toLowerCase())) keys.push(p.toUpperCase());
  }
  return { keys, invalid };
}

/** One-line outcome of a Jira read: `2 added, 1 refreshed; not found: IOT-9`. */
export function jiraResultText(r: RequirementJiraResultDTO): string {
  const parts = [`${r.created} added`, `${r.updated} refreshed`];
  const text = parts.join(', ');
  return r.missing.length > 0 ? `${text}. Not found in Jira: ${r.missing.join(', ')}.` : `${text}.`;
}

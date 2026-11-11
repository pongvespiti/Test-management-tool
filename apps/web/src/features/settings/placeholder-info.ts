import { RESULT_LABELS, RESULT_STATUSES, slugKey, type SuiteDTO } from '@tmt/shared';
import type { TemplatePlaceholders } from '@/lib/api/templates';

/** Where a placeholder works (same groups as `GET templates/placeholders`). */
export type PlaceholderGroup = 'workbook' | 'runs' | 'run' | 'cases';

export const PLACEHOLDER_GROUPS: {
  key: PlaceholderGroup;
  label: string;
  hint: string;
}[] = [
  {
    key: 'workbook',
    label: 'Workbook',
    hint: 'Single values that work in any cell, header or footer of any sheet.',
  },
  {
    key: 'runs',
    label: 'Summary rows',
    hint: 'Put these in one row of the summary sheet — the row is repeated once per test run.',
  },
  {
    key: 'run',
    label: 'Run sheet',
    hint: 'Values of the run a sheet copy belongs to. Only on the run sheet (cloned once per run).',
  },
  {
    key: 'cases',
    label: 'Case rows',
    hint: 'Put these in one row of the run sheet — the row is repeated once per test case of the run.',
  },
];

const WORKBOOK: Record<string, string> = {
  'project.name': 'Project name',
  'project.key': 'Project key',
  'release.name': 'Release of the test plan',
  'plan.docNo': 'Document number of the test plan',
  'plan.title': 'Test plan title',
  'plan.purpose': 'Purpose',
  'plan.testMethod': 'Test method',
  'plan.judgementCriteria': 'Judgement criteria',
  'plan.rawDataPath': 'Raw data path',
  'plan.overallJudgement': 'Overall judgement (PASS / PASS WITH CONDITION / NOT PASS)',
  'plan.judgementNote': 'Judgement note',
  'plan.status': 'Plan status',
  today: 'Export date',
};

const RUN: Record<string, string> = {
  code: 'Run code (Test ID)',
  scenario: 'Scenario',
  tester: 'Tester',
  testedDate: 'Tested date',
  judgement: 'Run judgement',
  judgementNote: 'Run judgement note',
  remark: 'Run remark',
  total: 'Number of test cases',
  ...Object.fromEntries(
    RESULT_STATUSES.map((s) => [s, `Number of “${RESULT_LABELS[s]}” results`] as const),
  ),
};

const CASE: Record<string, string> = {
  no: 'Row number (1, 2, 3 …)',
  code: 'Case code (system id when empty)',
  section: 'Section name, on the first row of each section',
  sectionMerged: 'Section name, cells merged down the whole section',
  title: 'Title / test item',
  type: 'Normal / Abnormal',
  precondition: 'Precondition',
  procedure: 'Procedure (steps as numbered text)',
  expected: 'Expected result',
  result: 'Result (OK, NG, OK with condition, N/T, N/A)',
  actual: 'Actual result',
  remark: 'Remark (library remark + result remark)',
  priority: 'Priority',
  tags: 'Tags, comma separated',
  references: 'References (requirements, Jira keys …)',
  estimate: 'Estimate in minutes',
};

/** Labels of custom fields and environment entries, to explain `cf_*` / `env_*` placeholders. */
export interface PlaceholderNames {
  fields: Map<string, string>;
  env: Map<string, string>;
}

export function placeholderNames(suites: readonly SuiteDTO[] | undefined): PlaceholderNames {
  const fields = new Map<string, string>();
  const env = new Map<string, string>();
  for (const s of suites ?? []) {
    for (const f of s.fieldDefs) if (!fields.has(f.key)) fields.set(f.key, f.label);
    for (const label of s.envTemplate) {
      const slug = slugKey(label);
      if (!env.has(slug)) env.set(slug, label);
    }
  }
  return { fields, env };
}

/** `${plan.title}` → `plan.title` (the check endpoint returns inner texts, the reference wraps them). */
export function innerOf(placeholder: string): string {
  const t = placeholder.trim();
  return t.startsWith('${') && t.endsWith('}') ? t.slice(2, -1) : t;
}

export function wrapPlaceholder(inner: string): string {
  return `\${${innerOf(inner)}}`;
}

/** Group of a placeholder by its shape (used to sort the placeholders found in a template). */
export function groupOf(placeholder: string): PlaceholderGroup {
  const inner = innerOf(placeholder);
  if (inner.startsWith('table:runs.')) return 'runs';
  if (inner.startsWith('table:cases.')) return 'cases';
  if (inner.startsWith('run.') || inner.startsWith('env.') || inner.startsWith('table:envList.'))
    return 'run';
  return 'workbook';
}

const envName = (names: PlaceholderNames, slug: string) => {
  const label = names.env.get(slug);
  return label ? `Environment “${label}”` : 'Environment value';
};

/** Plain-language meaning of a placeholder, or null when it is not a known one. */
export function describePlaceholder(placeholder: string, names: PlaceholderNames): string | null {
  const inner = innerOf(placeholder);
  if (WORKBOOK[inner]) return WORKBOOK[inner];
  let m = /^run\.(\w+)$/.exec(inner);
  if (m) return RUN[m[1]!] ?? null;
  m = /^env\.(\w+)$/.exec(inner);
  if (m) return envName(names, m[1]!);
  if (inner === 'table:envList.label') return 'Environment label — the row repeats per entry';
  if (inner === 'table:envList.value') return 'Environment value — the row repeats per entry';
  m = /^table:runs\.(\w+)$/.exec(inner);
  if (m) {
    const f = m[1]!;
    if (f.startsWith('env_')) return envName(names, f.slice(4));
    if (f.startsWith('g_')) return 'Result of one summary group (OK / NG …) in this run';
    return RUN[f] ?? null;
  }
  m = /^table:cases\.(\w+)$/.exec(inner);
  if (m) {
    const f = m[1]!;
    if (f.startsWith('cf_')) {
      const label = names.fields.get(f.slice(3));
      return label ? `Custom field “${label}”` : 'Custom field';
    }
    return CASE[f] ?? null;
  }
  return null;
}

/** Edit distance (Levenshtein) of two strings. */
export function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j]!;
      prev[j] = Math.min(up + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length]!;
}

/** Closest known placeholder for a misspelt one (`plan.docno` → `plan.docNo`), if any is close. */
export function suggestPlaceholder(
  unknown: string,
  reference: TemplatePlaceholders | undefined,
): string | null {
  if (!reference) return null;
  const all = [...reference.workbook, ...reference.runs, ...reference.run, ...reference.cases].map(
    innerOf,
  );
  const target = unknown.toLowerCase();
  let best: { inner: string; d: number } | null = null;
  for (const inner of all) {
    const d = editDistance(target, inner.toLowerCase());
    if (!best || d < best.d) best = { inner, d };
  }
  return best && best.d <= Math.max(2, Math.floor(unknown.length / 6)) ? best.inner : null;
}

import { RESULT_STATUSES, slugKey, type FieldDef } from '@tmt/shared';

/**
 * Placeholder syntax (spec §8, xlsx-template compatible): `${plan.title}` for a value and
 * `${table:cases.title}` for a table column; the row holding table placeholders repeats per item.
 */
export const PLACEHOLDER_RE = /\$\{(?:(table):)?([A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)*)\}/g;

export interface Placeholder {
  /** Text inside `${…}`, e.g. `plan.title` or `table:cases.title`. */
  inner: string;
  table: boolean;
  /** Dotted path (`plan.title`) or, for tables, `collection.field`. */
  path: string;
}

export function findPlaceholders(text: string): Placeholder[] {
  const out: Placeholder[] = [];
  for (const m of text.matchAll(PLACEHOLDER_RE)) {
    out.push({ inner: m[0].slice(2, -1), table: m[1] === 'table', path: m[2]! });
  }
  return out;
}

export interface PlaceholderReference {
  /** Placeholders usable on every sheet. */
  workbook: string[];
  /** Summary rows: `${table:runs.<field>}`. */
  runs: string[];
  /** Run sheet header values: `${run.*}`, `${env.*}`, `${table:envList.*}`. */
  run: string[];
  /** Case rows of the run sheet: `${table:cases.<field>}`. */
  cases: string[];
}

const WORKBOOK_FIELDS = [
  'project.name',
  'project.key',
  'release.name',
  'plan.docNo',
  'plan.title',
  'plan.purpose',
  'plan.testMethod',
  'plan.judgementCriteria',
  'plan.rawDataPath',
  'plan.overallJudgement',
  'plan.judgementNote',
  'plan.status',
  'today',
];
const RUN_FIELDS = [
  'code',
  'scenario',
  'tester',
  'testedDate',
  'judgement',
  'judgementNote',
  'remark',
];
const COUNT_FIELDS = [...RESULT_STATUSES, 'total'];
const CASE_FIELDS = [
  'no',
  'code',
  'section',
  'sectionMerged',
  'title',
  'type',
  'precondition',
  'procedure',
  'expected',
  'result',
  'actual',
  'remark',
  // v1.1
  'priority',
  'tags',
  'references',
  'estimate',
];

/**
 * Every placeholder a template may use for a suite with these custom fields, environment labels
 * and summary groups (for `/templates/placeholders` and the template check).
 */
export function placeholderReference(
  fieldDefs: Pick<FieldDef, 'key'>[],
  envLabels: string[],
  groups: string[],
): PlaceholderReference {
  const envSlugs = unique(envLabels.map((l) => slugKey(l)));
  const groupKeys = unique(groups.map((g) => `g_${slugKey(g)}`));
  const wrap = (inner: string) => `\${${inner}}`;
  return {
    workbook: WORKBOOK_FIELDS.map(wrap),
    runs: [...RUN_FIELDS, ...envSlugs.map((s) => `env_${s}`), ...groupKeys, ...COUNT_FIELDS].map(
      (f) => wrap(`table:runs.${f}`),
    ),
    run: [
      ...RUN_FIELDS.map((f) => wrap(`run.${f}`)),
      ...COUNT_FIELDS.map((f) => wrap(`run.${f}`)),
      ...envSlugs.map((s) => wrap(`env.${s}`)),
      wrap('table:envList.label'),
      wrap('table:envList.value'),
    ],
    cases: [...CASE_FIELDS, ...fieldDefs.map((f) => `cf_${f.key}`)].map((f) =>
      wrap(`table:cases.${f}`),
    ),
  };
}

/**
 * True when a placeholder (inner text) is known. Environment, group and custom-field names are
 * accepted by shape (`env.*`, `table:runs.env_*`, `table:runs.g_*`, `table:cases.cf_*`) because
 * they depend on the data of each export.
 */
export function isKnownPlaceholder(inner: string, reference?: PlaceholderReference): boolean {
  if (reference) {
    const all = [...reference.workbook, ...reference.runs, ...reference.run, ...reference.cases];
    if (all.includes(`\${${inner}}`)) return true;
  }
  if (WORKBOOK_FIELDS.includes(inner)) return true;
  const [kind, rest = ''] = inner.startsWith('table:')
    ? ['table', inner.slice(6)]
    : ['value', inner];
  if (kind === 'value') {
    if (/^env\.[a-z0-9_]+$/.test(rest)) return true;
    const m = /^run\.(\w+)$/.exec(rest);
    return Boolean(m && (RUN_FIELDS.includes(m[1]!) || COUNT_FIELDS.includes(m[1]!)));
  }
  const [collection, field = ''] = rest.split('.', 2);
  if (collection === 'runs') {
    return (
      RUN_FIELDS.includes(field) ||
      COUNT_FIELDS.includes(field) ||
      /^(env|g)_[a-z0-9_]+$/.test(field)
    );
  }
  if (collection === 'cases') return CASE_FIELDS.includes(field) || /^cf_[a-z0-9_]+$/.test(field);
  if (collection === 'envList') return field === 'label' || field === 'value';
  return false;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

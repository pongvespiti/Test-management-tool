/** Field-by-field differences between two stored versions of a case (history tab). */
import {
  CASE_PRIORITY_LABELS,
  CASE_STATUS_LABELS,
  formatMinutes,
  type CasePriority,
  type CaseStatus,
  type FieldDef,
} from '@tmt/shared';

export interface FieldChange {
  label: string;
  before: string;
  after: string;
}

type Show = (value: unknown, sectionName?: (id: number) => string | null) => string;

const EMPTY = '—';

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}

const text: Show = (value, sectionName) => {
  if (isEmpty(value)) return EMPTY;
  if (typeof value === 'number' && sectionName) return sectionName(value) ?? `#${value}`;
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
};

const tags: Show = (value) =>
  Array.isArray(value) && value.length > 0 ? value.map(String).join(', ') : EMPTY;

const minutes: Show = (value) =>
  typeof value === 'number' && value > 0 ? formatMinutes(value) : EMPTY;

const status: Show = (value) =>
  typeof value === 'string' ? (CASE_STATUS_LABELS[value as CaseStatus] ?? value) : text(value);

const priority: Show = (value) =>
  typeof value === 'string' ? (CASE_PRIORITY_LABELS[value as CasePriority] ?? value) : text(value);

const template: Show = (value) =>
  value === 'steps' ? 'Steps' : value === 'text' ? 'Text' : text(value);

/** Stored steps (`{kind:'step', action, expected}` / `{kind:'shared', sharedStepId}`) as lines. */
const steps: Show = (value) => {
  if (!Array.isArray(value) || value.length === 0) return EMPTY;
  return value
    .map((s: unknown, i) => {
      const step = (s ?? {}) as Record<string, unknown>;
      if (step.kind === 'shared') return `${i + 1}. [Shared steps #${String(step.sharedStepId)}]`;
      const action = typeof step.action === 'string' ? step.action : '';
      const expected = typeof step.expected === 'string' ? step.expected : '';
      return `${i + 1}. ${action}${expected ? ` → ${expected}` : ''}`;
    })
    .join('\n');
};

/** Case properties shown in the history, in display order. */
const FIELDS: [key: string, label: string, show: Show][] = [
  ['title', 'Title', text],
  ['code', 'Case code', text],
  ['sectionId', 'Section', text],
  ['caseType', 'Type', text],
  ['status', 'Status', status],
  ['priority', 'Priority', priority],
  ['tags', 'Tags', tags],
  ['estimateMinutes', 'Estimate', minutes],
  ['references', 'References', text],
  ['precondition', 'Precondition', text],
  ['template', 'Template', template],
  ['procedure', 'Procedure', text],
  ['expected', 'Expected result', text],
  ['steps', 'Steps', steps],
  ['remark', 'Remark', text],
  ['summaryGroup', 'Summary group', text],
];

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** What changed between two stored snapshots of a case (`prev` older). */
export function diffCaseVersions(
  curr: Record<string, unknown>,
  prev: Record<string, unknown>,
  fieldDefs: FieldDef[],
  sectionName?: (id: number) => string | null,
): FieldChange[] {
  const out: FieldChange[] = [];
  for (const [key, label, show] of FIELDS) {
    if (!(key in prev) && !(key in curr)) continue;
    // Snapshots written before v1.1 lack the new keys: their default values are not a change.
    if (!(key in prev) && isEmptyish(curr[key])) continue;
    const lookup = key === 'sectionId' ? sectionName : undefined;
    const before = show(prev[key], lookup);
    const after = show(curr[key], lookup);
    if (before !== after) out.push({ label, before, after });
  }
  const a = record(prev.custom);
  const b = record(curr.custom);
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const before = text(a[key]);
    const after = text(b[key]);
    if (before !== after)
      out.push({ label: fieldDefs.find((d) => d.key === key)?.label ?? key, before, after });
  }
  return out;
}

/** Default values of fields added in v1.1 (absent in older snapshots). */
function isEmptyish(value: unknown): boolean {
  return (
    isEmpty(value) ||
    (Array.isArray(value) && value.length === 0) ||
    value === 'medium' ||
    value === 'text'
  );
}

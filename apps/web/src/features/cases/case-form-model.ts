import {
  CASE_STATUSES,
  createCaseSchema,
  flattenSteps,
  stepsToText,
  type CasePriority,
  type CaseStatus,
  type CaseStepDTO,
  type CaseStepInput,
  type CaseTemplate,
  type CaseType,
  type PlainStepDTO,
  type SharedStepDTO,
  type TestCaseDTO,
} from '@tmt/shared';
import { toId } from '@/lib/forms';
import { schemaErrors, type FlatErrors } from '@/lib/form-errors';

let uidCounter = 0;
/** Stable React keys for rows that have no id yet. */
export function newUid(): string {
  uidCounter += 1;
  return `s${Date.now().toString(36)}${uidCounter}`;
}

/** A row of the steps editor: an inline step or a reference to a shared step (expanded for display). */
export type EditorStep =
  | { uid: string; kind: 'step'; action: string; expected: string }
  | {
      uid: string;
      kind: 'shared';
      sharedStepId: number;
      name: string;
      steps: PlainStepDTO[];
      missing?: boolean;
    };

export function plainStep(action = '', expected = ''): EditorStep {
  return { uid: newUid(), kind: 'step', action, expected };
}

export function fromStepDTO(s: CaseStepDTO): EditorStep {
  return s.kind === 'step'
    ? { uid: newUid(), kind: 'step', action: s.action, expected: s.expected }
    : {
        uid: newUid(),
        kind: 'shared',
        sharedStepId: s.sharedStepId,
        name: s.name,
        steps: s.steps,
        missing: s.missing,
      };
}

function toStepInput(s: EditorStep): CaseStepInput {
  return s.kind === 'step'
    ? { kind: 'step', action: s.action, expected: s.expected }
    : { kind: 'shared', sharedStepId: s.sharedStepId };
}

/** An inline step without action and expected result (dropped when saving). */
export const isBlankStep = (s: EditorStep) =>
  s.kind === 'step' && !s.action.trim() && !s.expected.trim();

/** Editor rows as display steps (shared steps expanded) — for numbering and the text conversion. */
export function editorStepsToDTO(steps: readonly EditorStep[]): CaseStepDTO[] {
  return steps.map((s) =>
    s.kind === 'step'
      ? { kind: 'step', action: s.action, expected: s.expected }
      : {
          kind: 'shared',
          sharedStepId: s.sharedStepId,
          name: s.name,
          steps: s.steps,
          missing: s.missing,
        },
  );
}

/** Steps → Text: `1. action` / `1. expected` lines (shared steps expanded in place). */
export function editorStepsToText(steps: readonly EditorStep[]) {
  return stepsToText(flattenSteps(editorStepsToDTO(steps)));
}

/** Rows after inserting a shared step set; a single blank starter row is replaced by it. */
export function insertSharedStep(prev: readonly EditorStep[], shared: SharedStepDTO): EditorStep[] {
  const keep = prev.length === 1 && isBlankStep(prev[0]!) ? [] : prev;
  return [
    ...keep,
    {
      uid: newUid(),
      kind: 'shared',
      sharedStepId: shared.id,
      name: shared.name,
      steps: shared.steps,
    },
  ];
}

/** Shared step sets a case already includes (marked in the picker). */
export function usedSharedStepIds(steps: readonly EditorStep[]): Set<number> {
  return new Set(steps.flatMap((s) => (s.kind === 'shared' ? [s.sharedStepId] : [])));
}

/** Statuses a person can pick; `in_review` is reached through "Submit for review" only. */
export const EDITABLE_STATUSES = CASE_STATUSES.filter((s) => s !== 'in_review');

export interface CaseFormValues {
  /** Section id as a select value; '' = no section. */
  sectionId: string;
  code: string;
  title: string;
  caseType: CaseType;
  status: CaseStatus;
  priority: CasePriority;
  tags: string[];
  /** Minutes as typed; '' = no estimate. */
  estimate: string;
  references: string;
  template: CaseTemplate;
  precondition: string;
  procedure: string;
  expected: string;
  steps: EditorStep[];
  remark: string;
  summaryGroup: string;
  custom: Record<string, string>;
}

export function toValues(
  tc: TestCaseDTO | null,
  sectionId: number | null,
  defaultStatus: CaseStatus,
): CaseFormValues {
  return {
    sectionId: String((tc ? tc.sectionId : sectionId) ?? ''),
    code: tc?.code ?? '',
    title: tc?.title ?? '',
    caseType: tc?.caseType ?? 'Normal',
    status: tc?.status ?? defaultStatus,
    priority: tc?.priority ?? 'medium',
    tags: [...(tc?.tags ?? [])],
    estimate: String(tc?.estimateMinutes ?? ''),
    references: tc?.references ?? '',
    template: tc?.template ?? 'text',
    precondition: tc?.precondition ?? '',
    procedure: tc?.procedure ?? '',
    expected: tc?.expected ?? '',
    steps: (tc?.steps ?? []).map(fromStepDTO),
    remark: tc?.remark ?? '',
    summaryGroup: tc?.summaryGroup ?? '',
    custom: { ...tc?.custom },
  };
}

/** Request body from the form. `keepBlankSteps` keeps row indexes aligned for validation messages. */
export function toBody(v: CaseFormValues, { keepBlankSteps = false } = {}) {
  const minutes = Number.parseInt(v.estimate, 10);
  return {
    sectionId: toId(v.sectionId),
    code: v.code,
    title: v.title,
    caseType: v.caseType,
    status: v.status,
    priority: v.priority,
    tags: v.tags,
    estimateMinutes: Number.isFinite(minutes) ? minutes : null,
    references: v.references,
    template: v.template,
    precondition: v.precondition,
    procedure: v.procedure,
    expected: v.expected,
    steps: (keepBlankSteps ? v.steps : v.steps.filter((s) => !isBlankStep(s))).map(toStepInput),
    remark: v.remark,
    summaryGroup: v.summaryGroup,
    // Fields registered but never touched hold `undefined` (JSON would drop them anyway).
    custom: Object.fromEntries(
      Object.entries(v.custom).filter((e): e is [string, string] => typeof e[1] === 'string'),
    ),
  };
}

export type CaseBody = ReturnType<typeof toBody>;

/** Comparable form of a body value (empty custom values dropped, keys sorted). */
function comparable(key: keyof CaseBody, value: unknown): string {
  if (key === 'custom') {
    const entries = Object.entries(value as Record<string, string>)
      .filter(([, v]) => v.trim() !== '')
      .toSorted(([a], [b]) => a.localeCompare(b));
    return JSON.stringify(entries);
  }
  if (typeof value === 'string') return JSON.stringify(value.trim() === '' ? '' : value);
  return JSON.stringify(value ?? null);
}

/** Keys whose value differs between two bodies. */
export function changedKeys(before: CaseBody, after: CaseBody): (keyof CaseBody)[] {
  return (Object.keys(after) as (keyof CaseBody)[]).filter(
    (k) => comparable(k, before[k]) !== comparable(k, after[k]),
  );
}

/** Content whose change sends a `ready` case back to draft under review rules (api.md § v1.1). */
export const REVIEWABLE_KEYS: (keyof CaseBody)[] = [
  'title',
  'precondition',
  'procedure',
  'expected',
  'template',
  'steps',
  'custom',
];

/**
 * Errors of the case form, by form field: the body is checked with `createCaseSchema`
 * (estimate → `estimate`, any tag → `tags`, `steps.<row>.action`, `custom.<key>`).
 */
export function validateCaseForm(values: CaseFormValues): FlatErrors {
  return schemaErrors(createCaseSchema, toBody(values, { keepBlankSteps: true }), (path) =>
    path.startsWith('estimateMinutes') ? 'estimate' : path.startsWith('tags') ? 'tags' : path,
  );
}

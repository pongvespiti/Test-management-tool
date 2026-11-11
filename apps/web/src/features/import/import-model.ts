import {
  suitePrefixSchema,
  type ColumnMapping,
  type FieldDef,
  type ImportAnalysisDTO,
  type ImportColumnInfo,
  type ImportLayout,
  type ImportOptions,
  type ImportRecordDTO,
  type ImportTarget,
  type ImportWarningDTO,
  type SuiteDTO,
} from '@tmt/shared';
import { ApiError } from '@/lib/api/client';
import type { ImportRunBody } from '@/lib/api/imports';
import { pluralize } from '@/lib/format';
import { toId } from '@/lib/forms';
import { suggestPrefix } from '@/lib/slug';

export const LAYOUT_LABELS: Record<ImportLayout, string> = {
  unit_operation: 'Unit operation test',
  adapter: 'Adapter operation & connection',
  modbus_system: 'Modbus system test',
  modbus_function: 'Modbus function check',
  generic: 'Generic table',
};

export const TARGET_LABELS: Record<ImportTarget, string> = {
  ignore: 'Do not import',
  section: 'Section',
  section_code: 'Section code',
  code: 'Case code',
  title: 'Title',
  type: 'Type',
  precondition: 'Precondition',
  procedure: 'Procedure',
  expected: 'Expected result',
  remark: 'Remark',
  summary_group: 'Summary group',
  priority: 'Priority',
  tags: 'Tags',
  estimate: 'Estimate',
  references: 'References',
  custom: 'Custom field',
  new_custom: 'New custom field',
};

/** Short explanation shown next to a mapped column. */
export const TARGET_HINTS: Partial<Record<ImportTarget, string>> = {
  ignore: 'Not imported (e.g. results belong to runs)',
  section: 'Empty cells inherit the section above',
  section_code: 'Code of the section, e.g. 3.2',
  code: 'Your own id, kept next to the system id',
  title: 'Required (or a case code)',
  type: 'Normal / Abnormal; empty → Normal',
  precondition: 'Multi-line text kept',
  procedure: 'Multi-line text kept',
  expected: 'Multi-line text kept',
  remark: 'Library remark of the case',
  summary_group: 'Groups cases in the report summary',
  priority: 'Critical/High/Medium/Low, P1–P4 or 1–4; unknown → Medium',
  tags: 'Split on , ; or line breaks',
  estimate: 'Minutes: 90, 1h 30m or 1:30',
  references: 'Requirement ids, Jira keys, spec',
  custom: 'Existing field of the suite',
};

/** Targets whose first filled column wins when several columns use them. */
const FIRST_WINS = new Set<ImportTarget>(['priority', 'estimate']);

/** 1-based column number → Excel letters (1 → A, 27 → AA). */
export function columnLetter(col: number): string {
  let n = col;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** `E`, or `I–K` for a merged header spanning several columns. */
export function columnRange(c: Pick<ImportColumnInfo, 'col' | 'letter' | 'span'>): string {
  return c.span > 1 ? `${c.letter}–${columnLetter(c.col + c.span - 1)}` : c.letter;
}

/** The wizard's default mapping: the engine's suggestions. */
export function mappingFromAnalysis(a: ImportAnalysisDTO): ColumnMapping[] {
  return a.columns.map((c) => {
    const m: ColumnMapping = { col: c.col, target: c.suggested.target };
    if (c.suggested.customKey) m.customKey = c.suggested.customKey;
    if (c.suggested.target === 'new_custom')
      m.newFieldLabel = c.suggested.newFieldLabel ?? c.header;
    return m;
  });
}

/** Select value of a mapping row: the target, or `custom:<key>` for an existing field. */
export function mappingValue(m: ColumnMapping): string {
  return m.target === 'custom' ? `custom:${m.customKey ?? ''}` : m.target;
}

export function mappingFromValue(
  value: string,
  column: Pick<ImportColumnInfo, 'col' | 'header'>,
  previous?: ColumnMapping,
): ColumnMapping {
  if (value.startsWith('custom:'))
    return { col: column.col, target: 'custom', customKey: value.slice('custom:'.length) };
  const target = value as ImportTarget;
  if (target === 'new_custom')
    return {
      col: column.col,
      target,
      newFieldLabel: previous?.newFieldLabel ?? (column.header || `Column ${column.col}`),
    };
  return { col: column.col, target };
}

export interface TargetOptionGroup {
  group: string;
  items: { value: string; label: string }[];
}

/** Grouped options of the "Import as" select. */
export function targetOptions(fieldDefs: readonly FieldDef[]): TargetOptionGroup[] {
  const item = (t: ImportTarget): { value: string; label: string } => ({
    value: t,
    label: TARGET_LABELS[t],
  });
  const groups: TargetOptionGroup[] = [
    {
      group: 'Test case',
      items: (
        [
          'title',
          'code',
          'type',
          'priority',
          'tags',
          'estimate',
          'references',
          'precondition',
          'procedure',
          'expected',
          'remark',
          'summary_group',
        ] as const
      ).map(item),
    },
    { group: 'Sections', items: (['section', 'section_code'] as const).map(item) },
  ];
  if (fieldDefs.length > 0)
    groups.push({
      group: 'Custom fields of the suite',
      items: fieldDefs.map((d) => ({ value: `custom:${d.key}`, label: d.label })),
    });
  groups.push({
    group: 'Other',
    items: [
      { value: 'new_custom', label: 'New custom field…' },
      { value: 'ignore', label: TARGET_LABELS.ignore },
    ],
  });
  return groups;
}

export interface MappingCheck {
  /** Per column: a problem that blocks the preview. */
  errors: Map<number, string>;
  /** Per column: how a column combines with another one using the same target. */
  notes: Map<number, string>;
  /** Whole-mapping problem (no title/code). */
  general: string | null;
}

/**
 * Client-side checks before the preview (the server validates again). Several columns may share a
 * target: section columns become nested levels, text columns are joined, priority/estimate take the
 * first filled value — those get a note. Only a second Section code column or the same existing
 * custom field twice is an error (the later value would silently win).
 */
export function checkMapping(
  mapping: readonly ColumnMapping[],
  columns: readonly ImportColumnInfo[],
  fieldDefs: readonly FieldDef[],
): MappingCheck {
  const errors = new Map<number, string>();
  const notes = new Map<number, string>();
  const uses = new Map<string, number[]>();
  const name = (col: number) => {
    const c = columns.find((x) => x.col === col);
    return `column ${c ? columnRange(c) : columnLetter(col)}`;
  };
  for (const m of mapping.toSorted((a, b) => a.col - b.col)) {
    if (m.target === 'ignore') continue;
    const key = m.target === 'custom' ? `custom:${m.customKey}` : m.target;
    const before = uses.get(key) ?? [];
    uses.set(key, [...before, m.col]);
    if (m.target === 'custom' && !fieldDefs.some((d) => d.key === m.customKey))
      errors.set(m.col, 'This field does not exist in the chosen suite');
    else if (m.target === 'new_custom' && !(m.newFieldLabel ?? '').trim())
      errors.set(m.col, 'Name the new field');
    if (before.length === 0 || m.target === 'new_custom') continue;
    const first = name(before[0]!);
    if (m.target === 'section') notes.set(m.col, `Section level ${before.length + 1}`);
    else if (m.target === 'section_code' || m.target === 'custom')
      errors.set(m.col, `Already imported from ${first} — choose one column`);
    else if (FIRST_WINS.has(m.target)) notes.set(m.col, `Used when ${first} is empty`);
    else notes.set(m.col, `Joined with ${first}`);
  }
  const sections = uses.get('section') ?? [];
  if (sections.length > 1) notes.set(sections[0]!, 'Section level 1');
  const hasKey = mapping.some((m) => m.target === 'title' || m.target === 'code');
  return {
    errors,
    notes,
    general: hasKey ? null : 'Import at least one column as Title or Case code.',
  };
}

/** Warnings that are informational rather than a problem in the file. */
export const INFO_WARNINGS = new Set<ImportWarningDTO['kind']>([
  'section_filled_down',
  'existing_code',
  'continuation_row',
]);

/** `rows 12, 15, 20 and 7 more`. */
export function rowsText(rows: readonly number[], count: number, max = 12): string {
  if (rows.length === 0) return '';
  const shown = rows.slice(0, max);
  const rest = Math.max(count, rows.length) - shown.length;
  return `${shown.length === 1 && rest === 0 ? 'row' : 'rows'} ${shown.join(', ')}${rest > 0 ? ` and ${rest} more` : ''}`;
}

/** One-line summary of an import record's stats. */
export function recordSummary(r: ImportRecordDTO): string {
  const s = r.stats;
  const parts: string[] = [];
  if (r.kind === 'junit') {
    if (s.tests !== undefined) parts.push(pluralize(s.tests, 'test'));
    if (s.matched !== undefined) parts.push(`${s.matched} matched`);
    if (s.updatedRunCases !== undefined) parts.push(`${s.updatedRunCases} results`);
    if (s.createdCases) parts.push(`${pluralize(s.createdCases, 'case')} created`);
    return parts.join(' · ');
  }
  if (s.created !== undefined) parts.push(`${s.created} created`);
  if (s.updated) parts.push(`${s.updated} updated`);
  if (s.skipped) parts.push(`${s.skipped} skipped`);
  if (s.sectionsCreated) parts.push(pluralize(s.sectionsCreated, 'new section'));
  if (s.fieldsCreated) parts.push(pluralize(s.fieldsCreated, 'new field'));
  if (s.warnings) parts.push(pluralize(s.warnings, 'warning'));
  return parts.join(' · ');
}

// ------------------------------------------------------------------ wizard decisions

/** "Import into" choice of the wizard. */
export interface ImportTargetState {
  mode: 'existing' | 'new';
  suiteId: string | null;
  name: string;
  prefix: string;
  /** The prefix was typed by the user (stop suggesting it from the name). */
  prefixEdited: boolean;
}

export const EMPTY_TARGET: ImportTargetState = {
  mode: 'existing',
  suiteId: null,
  name: '',
  prefix: '',
  prefixEdited: false,
};

/** Default target: the suite from the link, the only suite, or a new suite named after the file. */
export function defaultTarget(
  fileName: string,
  suites: readonly SuiteDTO[],
  presetSuiteId: number | null,
  canCreateSuite: boolean,
): ImportTargetState {
  const preset = suites.find((s) => s.id === presetSuiteId);
  if (preset) return { ...EMPTY_TARGET, suiteId: String(preset.id) };
  if (suites.length === 1) return { ...EMPTY_TARGET, suiteId: String(suites[0]!.id) };
  if (suites.length === 0 && canCreateSuite) {
    const name = fileName
      .replace(/\.[^.]+$/, '')
      .replace(/[_]+/g, ' ')
      .trim()
      .slice(0, 200);
    return { mode: 'new', suiteId: null, name, prefix: suggestPrefix(name), prefixEdited: false };
  }
  return EMPTY_TARGET;
}

/** Field errors of the wizard (target suite and the section option). */
export interface TargetErrors {
  suite?: string;
  name?: string;
  prefix?: string;
  section?: string;
}

/** Checks the "Import into" choice before the mapping step (the server checks again). */
export function validateTarget(
  target: ImportTargetState,
  suites: readonly SuiteDTO[],
): TargetErrors {
  const errors: TargetErrors = {};
  if (target.mode === 'existing') {
    if (!suites.some((s) => String(s.id) === target.suiteId))
      errors.suite = 'Choose the suite to import into';
    return errors;
  }
  if (!target.name.trim()) errors.name = 'Required';
  const prefix = suitePrefixSchema.safeParse(target.prefix);
  if (!prefix.success) errors.prefix = prefix.error.issues[0]?.message ?? 'Invalid prefix';
  else if (suites.some((s) => s.prefix === prefix.data))
    errors.prefix = 'Another suite of this project uses this prefix';
  return errors;
}

/** Options step of the wizard (select values as strings). */
export interface WizardOptions {
  onDuplicateInFile: ImportOptions['onDuplicateInFile'];
  onExisting: ImportOptions['onExisting'];
  saveEnvTemplate: boolean;
  /** '' = top level of the suite. */
  parentSectionId: string;
}

export const DEFAULT_OPTIONS: WizardOptions = {
  onDuplicateInFile: 'renumber',
  onExisting: 'update',
  saveEnvTemplate: true,
  parentSectionId: '',
};

/** Preview/commit body: only imported columns, the env template only when there is a block. */
export function buildRunBody({
  uploadId,
  analysis,
  mapping,
  options,
  suite,
  target,
}: {
  uploadId: string;
  analysis: Pick<ImportAnalysisDTO, 'sheet' | 'headerRow' | 'envBlock'>;
  mapping: readonly ColumnMapping[];
  options: WizardOptions;
  /** Existing target suite; null when a new suite is created. */
  suite: SuiteDTO | null;
  target: ImportTargetState;
}): ImportRunBody {
  return {
    uploadId,
    sheet: analysis.sheet,
    headerRow: analysis.headerRow,
    columns: mapping.filter((m) => m.target !== 'ignore'),
    options: {
      onDuplicateInFile: options.onDuplicateInFile,
      onExisting: options.onExisting,
      saveEnvTemplate: options.saveEnvTemplate && Boolean(analysis.envBlock),
      parentSectionId: suite ? toId(options.parentSectionId) : null,
    },
    ...(suite
      ? { suiteId: suite.id }
      : { newSuite: { name: target.name.trim(), prefix: target.prefix.trim().toUpperCase() } }),
  };
}

/** Wizard step that can fix a failed preview/commit, with the field errors to show there. */
export interface RunErrorTarget {
  step: number;
  fieldErrors?: TargetErrors;
  /** Keep the error box open (the problem is described there, not next to a field). */
  showError?: boolean;
}

/** Server-side validation errors of preview/commit: the step that can fix them, or null. */
export function runErrorTarget(
  err: unknown,
  mode: ImportTargetState['mode'],
): RunErrorTarget | null {
  if (!(err instanceof ApiError)) return null;
  switch (err.code) {
    case 'SUITE_PREFIX_TAKEN':
      return { step: 1, fieldErrors: { prefix: err.message } };
    case 'BAD_SUITE':
      return {
        step: 1,
        fieldErrors: mode === 'new' ? { name: err.message } : { suite: err.message },
      };
    case 'FORBIDDEN':
      return mode === 'new' ? { step: 1, fieldErrors: { name: err.message } } : null;
    case 'UNKNOWN_FIELD':
    case 'TOO_MANY_FIELDS':
      return { step: 2, showError: true };
    case 'BAD_SECTION':
      return { step: 3, fieldErrors: { section: err.message } };
    default:
      return null;
  }
}

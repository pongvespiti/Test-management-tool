import { updateSuiteSchema, type FieldDef, type FieldType, type SuiteDTO } from '@tmt/shared';
import { schemaErrors, type FlatErrors } from '@/lib/form-errors';
import { slugKey } from '@/lib/slug';

/** Limits of `updateSuiteSchema`. */
export const MAX_FIELDS = 40;
export const MAX_LABELS = 80;

/** One custom field row in the editor. Saved keys cannot change. */
export interface FieldRow {
  key: string;
  label: string;
  type: FieldType;
  options: string[];
  showInTable: boolean;
  /** Not saved yet: the key may still change (derived from the label until edited). */
  isNew: boolean;
  keyEdited: boolean;
}

export interface EnvRow {
  label: string;
}

export interface SuiteFormValues {
  name: string;
  prefix: string;
  description: string;
  fieldDefs: FieldRow[];
  envTemplate: EnvRow[];
}

export const FIELD_TYPE_OPTIONS: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'Text (one line)' },
  { value: 'longtext', label: 'Long text' },
  { value: 'select', label: 'Choice list' },
];

export function fieldRow(def: FieldDef, isNew = false): FieldRow {
  return {
    key: def.key,
    label: def.label,
    type: def.type,
    options: def.options ?? [],
    showInTable: def.showInTable,
    isNew,
    keyEdited: !isNew,
  };
}

/** A new, empty field with a free placeholder key (`field`, `field_2`, …). */
export function newFieldRow(takenKeys: readonly string[]): FieldRow {
  return fieldRow(
    { key: slugKey('field', takenKeys), label: '', type: 'text', showInTable: false },
    true,
  );
}

export function toFormValues(suite: SuiteDTO): SuiteFormValues {
  return {
    name: suite.name,
    prefix: suite.prefix,
    description: suite.description ?? '',
    fieldDefs: suite.fieldDefs.map((d) => fieldRow(d)),
    envTemplate: suite.envTemplate.map((label) => ({ label })),
  };
}

/** Values after a save: every field is stored, so keys are fixed from now on. */
export function savedFormValues(values: SuiteFormValues): SuiteFormValues {
  return {
    ...values,
    fieldDefs: values.fieldDefs.map((r) => ({ ...r, isNew: false, keyEdited: true })),
  };
}

/** Request body for PATCH /suites/:id (also used for validation). */
export function toSuiteBody(values: SuiteFormValues) {
  return {
    name: values.name,
    prefix: values.prefix,
    description: values.description,
    fieldDefs: values.fieldDefs.map((r) => ({
      key: r.key,
      label: r.label,
      type: r.type,
      options: r.type === 'select' ? r.options : undefined,
      showInTable: r.showInTable,
    })),
    envTemplate: values.envTemplate.map((r) => r.label.trim()),
  };
}

/**
 * Errors by form field: the body is checked with `updateSuiteSchema` (environment errors move to
 * `envTemplate.<row>.label`), plus choice lists need options and keys/labels must be unique.
 */
export function validateSuiteForm(values: SuiteFormValues): FlatErrors {
  const errors = schemaErrors(updateSuiteSchema, toSuiteBody(values), (path) => {
    const env = /^envTemplate\.(\d+)$/.exec(path);
    return env ? `envTemplate.${env[1]}.label` : path;
  });
  const seenKeys = new Set<string>();
  values.fieldDefs.forEach((r, i) => {
    if (r.type === 'select' && r.options.length === 0)
      errors[`fieldDefs.${i}.options`] ??= 'Add at least one option';
    if (seenKeys.has(r.key)) errors[`fieldDefs.${i}.key`] ??= 'Another field uses this key';
    seenKeys.add(r.key);
  });
  const seenLabels = new Set<string>();
  values.envTemplate.forEach((r, i) => {
    const label = r.label.trim().toLowerCase();
    if (label && seenLabels.has(label)) errors[`envTemplate.${i}.label`] ??= 'Duplicate label';
    seenLabels.add(label);
  });
  return errors;
}

/** Rows plus the new labels of a pasted list (trimmed, case-insensitive unique, up to the limit). */
export function mergeEnvLabels(rows: readonly EnvRow[], labels: readonly string[]): EnvRow[] {
  const existing = new Set(rows.map((r) => r.label.trim().toLowerCase()));
  const fresh: EnvRow[] = [];
  for (const raw of labels) {
    const label = raw.trim();
    const k = label.toLowerCase();
    if (!label || existing.has(k)) continue;
    existing.add(k);
    fresh.push({ label });
  }
  return [...rows, ...fresh.slice(0, Math.max(0, MAX_LABELS - rows.length))];
}

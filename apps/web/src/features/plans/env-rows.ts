import type { EnvEntryDTO } from '@tmt/shared';

/** One editable environment line (label + value); `uid` keeps React keys stable. */
export interface EnvRow {
  uid: string;
  label: string;
  value: string;
}

/** Most environment items a run can record (`envEntrySchema` array limit). */
export const MAX_ENV_ROWS = 80;

let envSeq = 0;
/** Unique key of a new row. */
export const envUid = () => `env${(envSeq++).toString(36)}`;

export function emptyEnvRow(): EnvRow {
  return { uid: envUid(), label: '', value: '' };
}

export function envRowsFromEntries(entries: EnvEntryDTO[]): EnvRow[] {
  return entries.map((e) => ({ uid: envUid(), label: e.label, value: e.value }));
}

export function envRowsFromLabels(labels: string[]): EnvRow[] {
  return labels.map((label) => ({ uid: envUid(), label, value: '' }));
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Rows for a new template (another suite): the template's labels in order, keeping values already
 * typed for the same label, plus extra rows the user added that carry a value.
 */
export function mergeEnvTemplate(labels: string[], current: EnvRow[]): EnvRow[] {
  const byLabel = new Map(current.map((r) => [norm(r.label), r]));
  const rows = labels.map((label) => ({
    uid: envUid(),
    label,
    value: byLabel.get(norm(label))?.value ?? '',
  }));
  const taken = new Set(labels.map(norm));
  for (const r of current) {
    if (r.value.trim() && !taken.has(norm(r.label))) rows.push(r);
  }
  return rows;
}

/** Body value: blank lines dropped, text trimmed. */
export function envEntriesOf(rows: EnvRow[]): EnvEntryDTO[] {
  return rows
    .filter((r) => r.label.trim() !== '' || r.value.trim() !== '')
    .map((r) => ({ label: r.label.trim(), value: r.value.trim() }));
}

/** Form errors of environment rows, keyed `${field}.${index}.label|value`. */
export function envRowErrors(rows: EnvRow[], field = 'environment'): Record<string, string> {
  const errors: Record<string, string> = {};
  rows.forEach((r, i) => {
    const label = r.label.trim();
    if (!label && r.value.trim()) errors[`${field}.${i}.label`] = 'Name this item';
    else if (label.length > 100) errors[`${field}.${i}.label`] = 'Use at most 100 characters';
    if (r.value.length > 500) errors[`${field}.${i}.value`] = 'Use at most 500 characters';
  });
  return errors;
}

/** Drops the request-body errors of `field` (rows are checked by {@link envRowErrors}). */
export function withoutBodyErrors(
  errors: Record<string, string>,
  field = 'environment',
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(errors).filter(([k]) => k !== field && !k.startsWith(`${field}.`)),
  );
}

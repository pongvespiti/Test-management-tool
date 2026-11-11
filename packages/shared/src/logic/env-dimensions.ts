/**
 * Environment dimensions: the lists of values behind the labels of a run's environment
 * (Platform, OS ver, Mobile model, Unit model, FW version …). A dimension may depend on another
 * one (OS ver and Mobile model on Platform), so "15" is listed under Android and "18" under iOS.
 *
 * Runs keep their environment as label/value pairs; these lists only give every value one spelling
 * so that the summary can group and filter by it.
 */
import type { EnvEntryDTO } from '../dto';

export interface EnvDimensionValue {
  value: string;
  /** Value of the parent dimension this value belongs to (null = any / no parent). */
  parent: string | null;
}

export interface EnvDimension {
  label: string;
  /** Label of the dimension whose chosen value scopes this one (null = independent). */
  parent: string | null;
  values: EnvDimensionValue[];
}

/** The team's usual set, offered as a starting point (values are added as runs are saved). */
export const DEFAULT_ENV_DIMENSIONS: readonly EnvDimension[] = [
  {
    label: 'Platform',
    parent: null,
    values: [
      { value: 'Android', parent: null },
      { value: 'iOS', parent: null },
    ],
  },
  { label: 'OS ver', parent: 'Platform', values: [] },
  { label: 'Mobile model', parent: 'Platform', values: [] },
  { label: 'App version', parent: null, values: [] },
  { label: 'Unit model', parent: null, values: [] },
  { label: 'FW version', parent: null, values: [] },
  { label: 'ADP&FW', parent: null, values: [] },
  { label: 'Router', parent: null, values: [] },
];

/** Comparison key: trimmed, single-spaced, case-insensitive. */
export function envKey(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

function tidy(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

export interface CanonicalEnvironment {
  entries: EnvEntryDTO[];
  dimensions: EnvDimension[];
  /** Values added to the lists. */
  added: number;
  /** Entries whose label or value was respelled to match a list. */
  changed: number;
}

/**
 * Gives the entries of one environment the spelling of the lists and adds values that are new.
 * Parents are handled first so a child value can be listed under the parent value of the same
 * environment. Entries of labels without a list, and blank values, are left as they are.
 */
export function canonicalizeEnvironment(
  entries: readonly EnvEntryDTO[],
  dimensions: readonly EnvDimension[],
): CanonicalEnvironment {
  const dims = dimensions.map((d) => ({ ...d, values: [...d.values] }));
  const byLabel = new Map(dims.map((d) => [envKey(d.label), d]));
  const out: EnvEntryDTO[] = entries.map((e) => ({ ...e }));
  const valueOf = new Map<string, string>(); // dimension key → canonical value of this run
  let added = 0;
  let changed = 0;

  const indexes = out.map((_, i) => i);
  const depth = (i: number) => (byLabel.get(envKey(out[i]!.label))?.parent ? 1 : 0);
  indexes.sort((a, b) => depth(a) - depth(b) || a - b);

  for (const i of indexes) {
    const entry = out[i]!;
    const dim = byLabel.get(envKey(entry.label));
    if (!dim) continue;
    if (entry.label !== dim.label) {
      entry.label = dim.label;
      changed += 1;
    }
    const text = tidy(entry.value);
    if (text === '') continue;
    const parentValue = dim.parent ? (valueOf.get(envKey(dim.parent)) ?? null) : null;
    const key = envKey(text);
    const candidates = dim.values.filter((v) => envKey(v.value) === key);
    const parentKey = parentValue === null ? null : envKey(parentValue);
    let found =
      parentKey === null
        ? candidates[0]
        : (candidates.find((v) => v.parent !== null && envKey(v.parent) === parentKey) ??
          candidates.find((v) => v.parent === null));
    if (!found) {
      found = { value: text, parent: dim.parent ? parentValue : null };
      dim.values.push(found);
      added += 1;
    }
    if (entry.value !== found.value) {
      entry.value = found.value;
      changed += 1;
    }
    valueOf.set(envKey(dim.label), found.value);
  }
  return { entries: out, dimensions: dims, added, changed };
}

/** Values of a dimension to offer, given the value chosen for its parent dimension. */
export function valuesFor(
  dimension: EnvDimension | undefined,
  parentValue: string | null | undefined,
): string[] {
  if (!dimension) return [];
  const parentKey = parentValue ? envKey(parentValue) : null;
  return dimension.values
    .filter(
      (v) =>
        dimension.parent === null ||
        parentKey === null ||
        v.parent === null ||
        envKey(v.parent) === parentKey,
    )
    .map((v) => v.value);
}

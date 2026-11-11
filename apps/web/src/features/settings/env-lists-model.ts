import { envKey, type EnvDimension } from '@tmt/shared';

/** Pure edits of the environment lists (the page keeps them in local state until saved). */

export function addDimension(dims: EnvDimension[], label: string): EnvDimension[] {
  const text = label.trim();
  if (!text || dims.some((d) => envKey(d.label) === envKey(text))) return dims;
  return [...dims, { label: text, parent: null, values: [] }];
}

/** Removing a list frees the lists that depended on it. */
export function removeDimension(dims: EnvDimension[], label: string): EnvDimension[] {
  return dims
    .filter((d) => d.label !== label)
    .map((d) =>
      d.parent === label
        ? { ...d, parent: null, values: d.values.map((v) => ({ ...v, parent: null })) }
        : d,
    );
}

/** A list may depend on one that has no parent itself; its values lose their old parent value. */
export function setParent(
  dims: EnvDimension[],
  label: string,
  parent: string | null,
): EnvDimension[] {
  return dims.map((d) =>
    d.label === label ? { ...d, parent, values: d.values.map((v) => ({ ...v, parent: null })) } : d,
  );
}

/** Lists a given list may depend on. */
export function parentChoices(dims: readonly EnvDimension[], label: string): string[] {
  const self = dims.find((d) => d.label === label);
  // A list that others depend on cannot have a parent itself.
  if (dims.some((d) => d.parent === label) || !self) return [];
  return dims.filter((d) => d.label !== label && d.parent === null).map((d) => d.label);
}

export function addValue(
  dims: EnvDimension[],
  label: string,
  value: string,
  parent: string | null,
): EnvDimension[] {
  const text = value.trim().replace(/\s+/g, ' ');
  if (!text) return dims;
  return dims.map((d) => {
    if (d.label !== label) return d;
    const taken = d.values.some(
      (v) =>
        envKey(v.value) === envKey(text) &&
        (v.parent === null
          ? parent === null
          : parent !== null && envKey(v.parent) === envKey(parent)),
    );
    return taken ? d : { ...d, values: [...d.values, { value: text, parent }] };
  });
}

export function removeValue(
  dims: EnvDimension[],
  label: string,
  value: string,
  parent: string | null,
): EnvDimension[] {
  const next = dims.map((d) =>
    d.label === label
      ? { ...d, values: d.values.filter((v) => !(v.value === value && v.parent === parent)) }
      : d,
  );
  // Values listed under a parent value that no longer exists would never be offered: drop them.
  const owner = next.find((d) => d.label === label);
  if (!owner) return next;
  const left = new Set(owner.values.map((v) => envKey(v.value)));
  return next.map((d) =>
    d.parent === label
      ? { ...d, values: d.values.filter((v) => v.parent === null || left.has(envKey(v.parent))) }
      : d,
  );
}

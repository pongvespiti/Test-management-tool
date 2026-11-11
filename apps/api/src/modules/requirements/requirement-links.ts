/**
 * Which cases belong to a requirement: the ones linked in the requirements table plus the ones
 * that cite its key in their references text. Pure — services feed it rows.
 */
import { parseReferences, type RequirementVia } from '@tmt/shared';

/** Case-insensitive lookup key of a requirement / reference. */
export const keyOf = (reference: string): string => reference.trim().toLowerCase();

export interface CitingCase {
  id: number;
  references: string | null;
}

/** For each reference written in cases' references: the ids of the cases that cite it. */
export function citationIndex(cases: readonly CitingCase[]): Map<string, Set<number>> {
  const index = new Map<string, Set<number>>();
  for (const c of cases) {
    for (const ref of parseReferences(c.references)) {
      const k = keyOf(ref);
      let ids = index.get(k);
      if (!ids) index.set(k, (ids = new Set()));
      ids.add(c.id);
    }
  }
  return index;
}

/**
 * Cases of one requirement and why each counts. `linked` are the table links; `cited` the ids
 * citing the key. `live` restricts to cases that still count (not deleted / deprecated).
 */
export function viaOfCases(
  linked: ReadonlySet<number> | undefined,
  cited: ReadonlySet<number> | undefined,
  live?: ReadonlySet<number>,
): Map<number, RequirementVia> {
  const out = new Map<number, RequirementVia>();
  for (const id of linked ?? []) if (!live || live.has(id)) out.set(id, 'linked');
  for (const id of cited ?? []) {
    if (live && !live.has(id)) continue;
    out.set(id, out.has(id) ? 'both' : 'refs');
  }
  return out;
}

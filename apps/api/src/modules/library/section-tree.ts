import type { Section } from '@tmt/database';
import type { Db } from '../../prisma/prisma.service.js';

/** Sections of one suite as a tree (display order, paths, subtrees). */
export interface SectionTree {
  byId: Map<number, Section>;
  childrenOf: Map<number | null, Section[]>;
  /** Section ids in display order (depth-first, siblings by sort order then id). */
  ordered: number[];
  /** Names from the root down to the section (`[]` for no section). */
  pathOf(id: number | null | undefined): string[];
  /** The section and all its descendants (empty for unknown ids). */
  subtreeIds(id: number): number[];
}

/** Guards against corrupted parent cycles. */
const MAX_DEPTH = 64;

export function buildSectionTree(rows: readonly Section[]): SectionTree {
  const byId = new Map<number, Section>(rows.map((r) => [r.id, r]));
  const childrenOf = new Map<number | null, Section[]>();
  for (const r of rows) {
    // Orphans (parent missing) are treated as roots.
    const parent = r.parentId !== null && byId.has(r.parentId) ? r.parentId : null;
    const list = childrenOf.get(parent) ?? [];
    list.push(r);
    childrenOf.set(parent, list);
  }
  for (const list of childrenOf.values()) {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  }

  const ordered: number[] = [];
  const paths = new Map<number, string[]>();
  const visit = (parent: number | null, prefix: string[], depth: number) => {
    if (depth > MAX_DEPTH) return;
    for (const child of childrenOf.get(parent) ?? []) {
      const path = [...prefix, child.name];
      paths.set(child.id, path);
      ordered.push(child.id);
      visit(child.id, path, depth + 1);
    }
  };
  visit(null, [], 0);

  return {
    byId,
    childrenOf,
    ordered,
    pathOf: (id) => (id === null || id === undefined ? [] : (paths.get(id) ?? [])),
    subtreeIds: (id) => {
      const out: number[] = [];
      const walk = (sid: number, depth: number) => {
        if (depth > MAX_DEPTH) return;
        out.push(sid);
        for (const c of childrenOf.get(sid) ?? []) walk(c.id, depth + 1);
      };
      if (byId.has(id)) walk(id, 0);
      return out;
    },
  };
}

export async function loadSectionTree(db: Db, suiteId: number): Promise<SectionTree> {
  const rows = await db.section.findMany({
    where: { suiteId },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  });
  return buildSectionTree(rows);
}

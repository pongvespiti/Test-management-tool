import type { Paged } from '@tmt/shared';

/** Prisma `skip`/`take` for a 1-based page. */
export function pageWindow(page: number, pageSize: number): { skip: number; take: number } {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

export function paged<T>(items: T[], total: number, page: number, pageSize: number): Paged<T> {
  return { items, total, page, pageSize };
}

/** Escapes `%`, `_` and `\` for a SQL LIKE / Prisma `contains` pattern. */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

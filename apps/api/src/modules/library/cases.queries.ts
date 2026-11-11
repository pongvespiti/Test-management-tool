/**
 * Read helpers for test case lists (filters and section-tree order in SQL), DTO assembly across
 * suites and the run history of a library case. Shared with the execution and imports modules.
 */
import { Prisma, type Suite, type TestCase } from '@tmt/database';
import {
  displayId,
  type CasePriority,
  type CaseSearchResultDTO,
  type CaseStatus,
  type CaseType,
  type TestCaseDTO,
} from '@tmt/shared';
import { escapeLike } from '../../common/http/pagination.js';
import { loadUserRefs } from '../../common/users/user-refs.js';
import type { Db } from '../../prisma/prisma.service.js';
import { caseUserIds, toCaseDTO } from './library.mapper.js';
import { loadSharedStepLookup } from './library.queries.js';
import { loadSectionTree, type SectionTree } from './section-tree.js';

export interface CaseFilter {
  /** Keep cases of these sections (already checked against the suite's tree). */
  sectionIds?: number[];
  /** Only cases outside any section. */
  unsectioned?: boolean;
  caseType?: CaseType;
  status?: CaseStatus;
  priority?: CasePriority[];
  /** One tag, compared case-insensitively. */
  tag?: string;
  /** Free text searched in every text column, tags, steps and custom values (LIKE-escaped). */
  q?: string;
}

/** WHERE clause (alias `tc`) for the live cases of a suite that match the list filters. */
export function caseFilterSql(suiteId: number, f: CaseFilter = {}): Prisma.Sql {
  const conds: Prisma.Sql[] = [Prisma.sql`tc.suite_id = ${suiteId}`, Prisma.sql`NOT tc.is_deleted`];
  if (f.sectionIds) {
    conds.push(
      f.sectionIds.length > 0
        ? Prisma.sql`tc.section_id IN (${Prisma.join(f.sectionIds)})`
        : Prisma.sql`FALSE`,
    );
  }
  if (f.unsectioned) conds.push(Prisma.sql`tc.section_id IS NULL`);
  if (f.caseType) conds.push(Prisma.sql`tc.case_type::text = ${f.caseType}`);
  if (f.status) conds.push(Prisma.sql`tc.status::text = ${f.status}`);
  if (f.priority && f.priority.length > 0) {
    conds.push(Prisma.sql`tc.priority::text IN (${Prisma.join(f.priority)})`);
  }
  if (f.tag) {
    conds.push(
      Prisma.sql`EXISTS (SELECT 1 FROM unnest(tc.tags) AS t(tag) WHERE lower(t.tag) = lower(${f.tag}))`,
    );
  }
  if (f.q) conds.push(caseTextSql(f.q));
  return Prisma.join(conds, ' AND ');
}

/** Free-text predicate (alias `tc`): every text column, tags, steps and custom values. */
export function caseTextSql(q: string): Prisma.Sql {
  const p = `%${escapeLike(q)}%`;
  return Prisma.sql`(tc.title ILIKE ${p} OR tc.code ILIKE ${p}
      OR tc.precondition ILIKE ${p} OR tc.procedure ILIKE ${p} OR tc.expected ILIKE ${p}
      OR tc.remark ILIKE ${p} OR tc.refs ILIKE ${p} OR array_to_string(tc.tags, ' ') ILIKE ${p}
      OR tc.steps::text ILIKE ${p} OR tc.custom::text ILIKE ${p})`;
}

interface CaseSearchRow {
  id: number;
  seq: number;
  code: string | null;
  title: string;
  status: CaseStatus;
  priority: CasePriority;
  suite_id: number;
  suite_name: string;
  prefix: string;
}

/**
 * Project-wide search over the live cases of every active (not archived) suite. Cases whose title
 * or code matches come first (`IS TRUE`: a NULL code must not sort ahead), then suite order and
 * case number.
 */
export async function searchProjectCases(
  db: Db,
  projectId: number,
  q: string,
  limit: number,
): Promise<CaseSearchResultDTO> {
  const scope = Prisma.sql`s.project_id = ${projectId} AND NOT s.is_archived
    AND NOT tc.is_deleted AND ${caseTextSql(q)}`;
  const from = Prisma.sql`FROM test_cases tc JOIN suites s ON s.id = tc.suite_id`;
  const head = `%${escapeLike(q)}%`;
  const [count] = await db.$queryRaw<{ total: number }[]>(
    Prisma.sql`SELECT count(*)::int AS total ${from} WHERE ${scope}`,
  );
  const total = count?.total ?? 0;
  if (total === 0) return { items: [], total };
  const rows = await db.$queryRaw<CaseSearchRow[]>(
    Prisma.sql`SELECT tc.id, tc.seq, tc.code, tc.title, tc.status::text AS status,
        tc.priority::text AS priority, s.id AS suite_id, s.name AS suite_name, s.prefix
      ${from} WHERE ${scope}
      ORDER BY ((tc.title ILIKE ${head} OR tc.code ILIKE ${head}) IS TRUE) DESC,
        s.sort_order, s.id, tc.seq
      LIMIT ${limit}`,
  );
  return {
    total,
    items: rows.map((r) => ({
      id: r.id,
      displayId: displayId(r.prefix, r.seq),
      code: r.code,
      title: r.title,
      status: r.status,
      priority: r.priority,
      suiteId: r.suite_id,
      suiteName: r.suite_name,
    })),
  };
}

/** Number of cases matching a {@link caseFilterSql} clause. */
export async function countCases(db: Db, where: Prisma.Sql): Promise<number> {
  const [row] = await db.$queryRaw<{ total: number }[]>(
    Prisma.sql`SELECT count(*)::int AS total FROM test_cases tc WHERE ${where}`,
  );
  return row?.total ?? 0;
}

/**
 * Cases matching a {@link caseFilterSql} clause in library order: section tree order (unsectioned
 * first), then sort order and case number. One page, or every case when `page` is omitted.
 */
export async function orderedCases(
  db: Db,
  where: Prisma.Sql,
  tree: SectionTree,
  page?: { skip: number; take: number },
): Promise<TestCase[]> {
  const limit = page ? Prisma.sql`LIMIT ${page.take} OFFSET ${page.skip}` : Prisma.empty;
  const ids = await db.$queryRaw<{ id: number }[]>(
    Prisma.sql`SELECT tc.id FROM test_cases tc WHERE ${where}
      ORDER BY array_position(string_to_array(${tree.ordered.join(',')}, ',')::int[], tc.section_id)
        NULLS FIRST, tc.sort_order, tc.seq
      ${limit}`,
  );
  if (ids.length === 0) return [];
  const rows = await db.testCase.findMany({ where: { id: { in: ids.map((r) => r.id) } } });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.flatMap(({ id }) => byId.get(id) ?? []);
}

/** TestCaseDTOs of cases of one suite (prefix and section tree known). */
export async function suiteCaseDTOs(
  db: Db,
  rows: readonly TestCase[],
  suite: Pick<Suite, 'prefix'>,
  tree: SectionTree,
): Promise<TestCaseDTO[]> {
  const users = await loadUserRefs(db, rows.flatMap(caseUserIds));
  const shared = await loadSharedStepLookup(db, rows);
  return rows.map((r) => toCaseDTO(r, suite.prefix, tree, users, shared));
}

/** TestCaseDTOs of cases of any suites of a project (prefixes and trees loaded per suite). */
export async function toCaseDTOs(db: Db, rows: readonly TestCase[]): Promise<TestCaseDTO[]> {
  if (rows.length === 0) return [];
  const suiteIds = [...new Set(rows.map((r) => r.suiteId))];
  const suites = await db.suite.findMany({
    where: { id: { in: suiteIds } },
    select: { id: true, prefix: true },
  });
  const prefixes = new Map(suites.map((s) => [s.id, s.prefix]));
  const trees = new Map<number, SectionTree>();
  for (const id of suiteIds) trees.set(id, await loadSectionTree(db, id));
  const users = await loadUserRefs(db, rows.flatMap(caseUserIds));
  const shared = await loadSharedStepLookup(db, rows);
  return rows.map((r) =>
    toCaseDTO(r, prefixes.get(r.suiteId) ?? '', trees.get(r.suiteId)!, users, shared),
  );
}

/** Results of one library case in runs (newest first) — owned by the execution queries. */
export { caseRunHistory } from '../execution/execution.queries.js';

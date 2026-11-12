/**
 * The tables of a plan report beyond runs and cases: requirements tested by the plan, results by
 * environment value, and the exploratory sessions of the release (`${table:requirements.*}`,
 * `${table:dimensions.*}`, `${table:sessions.*}`). Pure — `buildPlanReportData` feeds them rows.
 */
import type { ReportDimension, ReportRequirement, ReportRun } from '@tmt/excel';
import {
  RESULT_STATUSES,
  parseReferences,
  type ResultStatus,
  type StatusCounts,
} from '@tmt/shared';
import { keyOf } from '../requirements/requirement-links.js';

export interface PlanRequirement {
  id: number;
  key: string;
  title: string;
  /** Export label of the source. */
  source: string;
  externalStatus: string | null;
  needsReview: boolean;
}

/** A case row of the plan's runs (a snapshot, ADR-003). */
export interface PlanRunCase {
  id: number;
  /** Library case it was made from; null once that case was deleted. */
  testCaseId: number | null;
  references: string | null;
  status: ResultStatus;
}

const emptyCounts = (): StatusCounts => ({
  untested: 0,
  ok: 0,
  ng: 0,
  ok_cond: 0,
  blocked: 0,
  nt: 0,
  na: 0,
});

/** "Not covered" without case rows; any NG fails; anything not decided yet is in progress. */
export function requirementStatus(counts: StatusCounts, cases: number): string {
  if (cases === 0) return 'Not covered';
  if (counts.ng > 0) return 'Failing';
  if (counts.untested + counts.blocked + counts.nt > 0) return 'In progress';
  return 'Passing';
}

/**
 * Requirements that the plan's case rows test — through a link in the requirements table or by
 * citing the key in the case's references — with the results of those rows. Requirements that no
 * row tests are left out; the traceability report lists the gaps.
 */
export function requirementRows(
  requirements: readonly PlanRequirement[],
  linked: ReadonlyMap<number, ReadonlySet<number>>,
  runCases: readonly PlanRunCase[],
  defectKeys: ReadonlyMap<number, readonly string[]>,
): ReportRequirement[] {
  const byCitation = new Map<string, PlanRunCase[]>();
  for (const rc of runCases) {
    for (const ref of parseReferences(rc.references)) {
      const list = byCitation.get(keyOf(ref)) ?? [];
      list.push(rc);
      byCitation.set(keyOf(ref), list);
    }
  }
  const rows: ReportRequirement[] = [];
  for (const r of requirements) {
    const links = linked.get(r.id);
    const rows_ = new Map<number, PlanRunCase>();
    for (const rc of byCitation.get(keyOf(r.key)) ?? []) rows_.set(rc.id, rc);
    if (links) {
      for (const rc of runCases) {
        if (rc.testCaseId !== null && links.has(rc.testCaseId)) rows_.set(rc.id, rc);
      }
    }
    if (rows_.size === 0) continue;
    const counts = emptyCounts();
    const defects = new Set<string>();
    for (const rc of rows_.values()) {
      counts[rc.status] += 1;
      for (const key of defectKeys.get(rc.id) ?? []) defects.add(key);
    }
    rows.push({
      key: r.key,
      title: r.title,
      source: r.source,
      jiraStatus: r.externalStatus,
      status: requirementStatus(counts, rows_.size),
      review: r.needsReview ? 'Review' : '',
      cases: rows_.size,
      counts,
      defects: [...defects].join(', '),
    });
  }
  return rows.toSorted((a, b) => a.key.localeCompare(b.key, 'en', { numeric: true }));
}

/** Results by environment value of the plan's runs, and by build; labels in order of first use. */
export function dimensionRows(runs: readonly ReportRun[]): ReportDimension[] {
  const rows = new Map<string, ReportDimension>();
  const add = (dimension: string, value: string, run: ReportRun) => {
    if (value.trim() === '') return;
    const id = `${dimension.toLowerCase()}\u0000${value.toLowerCase()}`;
    let row = rows.get(id);
    if (!row) rows.set(id, (row = { dimension, value, runs: 0, counts: emptyCounts() }));
    row.runs += 1;
    for (const s of RESULT_STATUSES) row.counts[s] += run.counts[s] ?? 0;
  };
  for (const run of runs) {
    for (const e of run.envList) add(e.label, e.value, run);
    if (run.build) add('Build', run.build, run);
  }
  const order = [...new Set([...rows.values()].map((r) => r.dimension))];
  return [...rows.values()].toSorted(
    (a, b) =>
      order.indexOf(a.dimension) - order.indexOf(b.dimension) ||
      a.value.localeCompare(b.value, 'en', { numeric: true }),
  );
}

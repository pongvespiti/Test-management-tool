import { RESULT_STATUSES, type StatusCounts } from '@tmt/shared';

/**
 * Everything a report template can show (spec §8). Labels are already in export wording
 * (e.g. judgement "PASS WITH CONDITION", result "OK with condition"); empty values are '' or null.
 */
export interface ReportData {
  /** ISO date (YYYY-MM-DD) of the export. */
  today: string;
  project: { name: string; key: string };
  release: { name: string } | null;
  plan: {
    docNo: string | null;
    title: string;
    purpose: string | null;
    testMethod: string | null;
    judgementCriteria: string | null;
    rawDataPath: string | null;
    /** Export label, e.g. "PASS". */
    overallJudgement: string | null;
    judgementNote: string | null;
    /** Export label, e.g. "Completed". */
    status: string;
  };
  /** Summary group names in display order (columns of the summary matrix). */
  groups: string[];
  runs: ReportRun[];
}

export interface ReportRun {
  /** Test ID, e.g. "UT_02" — also the name of the run's sheet. */
  code: string;
  scenario: string | null;
  /** Name of the application build under test, e.g. "1.1.7(2.0.0)". */
  build: string | null;
  tester: string | null;
  /** ISO date (YYYY-MM-DD). */
  testedDate: string | null;
  /** Export label, e.g. "NOT PASS". */
  judgement: string | null;
  judgementNote: string | null;
  remark: string | null;
  /** Environment values in template order. */
  envList: { label: string; value: string }[];
  /** Environment values by slug (`slugKey(label)`), for `${env.<slug>}`. */
  env: Record<string, string>;
  /** Summary-matrix cell per group, keyed `g_<slug>` (e.g. `g_set_temperature`: "Pass"). */
  groups: Record<`g_${string}`, string>;
  counts: StatusCounts;
  cases: ReportCase[];
}

export interface ReportCase {
  /** 1-based position in the run. */
  no: number;
  code: string;
  /** Section path joined with " / ". */
  section: string;
  sectionPath: string[];
  title: string;
  type: string;
  precondition: string | null;
  procedure: string | null;
  expected: string | null;
  /** Export label (OK, NG, OK with condition, Blocked, N/T, N/A or ''). */
  result: string;
  actual: string | null;
  remark: string | null;
  /** Priority label, e.g. "High". */
  priority: string;
  /** Tags joined with ", ". */
  tags: string;
  references: string | null;
  /** Estimate in minutes (a number cell), or null. */
  estimate: number | null;
  /** Custom field values keyed `cf_<field key>`. */
  [customField: `cf_${string}`]: string | null | undefined;
}

/** Scalar value a placeholder can produce. */
export type CellScalar = string | number | boolean | Date | null | undefined;

/** One row of a `${table:<name>.<field>}` table. */
export type TableItem = Record<string, CellScalar>;

/** Row of the `${table:runs.*}` summary table. */
export function runTableItem(run: ReportRun): TableItem {
  const item: TableItem = {
    code: run.code,
    scenario: run.scenario,
    build: run.build,
    tester: run.tester,
    testedDate: run.testedDate,
    judgement: run.judgement,
    judgementNote: run.judgementNote,
    remark: run.remark,
  };
  for (const [slug, value] of Object.entries(run.env)) item[`env_${slug}`] = value;
  for (const [key, value] of Object.entries(run.groups)) item[key] = value;
  let total = 0;
  for (const s of RESULT_STATUSES) {
    item[s] = run.counts[s] ?? 0;
    total += run.counts[s] ?? 0;
  }
  item.total = total;
  return item;
}

/** Row of the `${table:cases.*}` table (`sectionMerged` carries the section for merged section cells). */
export function caseTableItem(c: ReportCase): TableItem {
  const item: TableItem = {};
  for (const [k, v] of Object.entries(c)) {
    if (k === 'sectionPath') continue;
    item[k] = v as CellScalar;
  }
  item.sectionMerged = c.section;
  return item;
}

/** Workbook-wide scalar context (`${project.name}`, `${plan.title}`, `${today}` …). */
export function workbookContext(data: ReportData): Record<string, unknown> {
  return {
    today: data.today,
    project: data.project,
    release: data.release ?? { name: '' },
    plan: data.plan,
  };
}

/** Context of one run sheet: workbook values plus `${run.*}` and `${env.*}`. */
export function runContext(data: ReportData, run: ReportRun): Record<string, unknown> {
  const { cases: _cases, envList: _envList, ...runFields } = run;
  return {
    ...workbookContext(data),
    run: { ...runFields, ...run.counts },
    env: run.env,
  };
}

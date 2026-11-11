/**
 * Pure helpers of the report pages and the dashboard: chart series and data shaping, totals, labels,
 * and the URL state of the reports page.
 */
import {
  DEFECT_STATUSES,
  OPEN_DEFECT_STATUSES,
  RESULT_LABELS,
  type CoverageRowDTO,
  type DefectReportDTO,
  type ExecutedStatus,
  type ReleaseComparisonRowDTO,
  type ReportTrendDTO,
  type TrendPointDTO,
  type UserRef,
  type WorkloadRowDTO,
} from '@tmt/shared';
import { format, isValid, parseISO } from 'date-fns';
import type { ChartConfig } from '@/components/ui/chart';
import { formatDate } from '@/lib/format';
import { routes, toQueryString } from '@/lib/routes';
import { RESULT_BAR_ORDER, RESULT_TONES } from '@/lib/status';

/** Primary blue of the charts (`--chart-1` in globals.css). */
export const PRIMARY = 'var(--chart-1)';
/** Light grid lines of the charts. */
export const GRID_COLOR = '#E9ECEF';

export interface Series<K extends string = string> {
  key: K;
  label: string;
  color: string;
}

/** Labels and colours of a chart's series for `ChartContainer` and its tooltip. */
export function chartConfig(series: readonly Series[]): ChartConfig {
  return Object.fromEntries(series.map((s) => [s.key, { label: s.label, color: s.color }]));
}

/** `2026-10-21` → `Oct 21` (values that are not dates are shown as they are). */
export function formatDay(date: string): string {
  const d = parseISO(date);
  return isValid(d) ? format(d, 'MMM d') : date;
}

export function personName(user: UserRef | null | undefined, empty = 'Unassigned'): string {
  return user?.displayName ?? empty;
}

/** Part of a whole, 0..1; null when the whole is 0. */
export function share(part: number, whole: number): number | null {
  return whole === 0 ? null : part / whole;
}

/** 0.8532 → 85.3 (percent with one decimal for chart axes); null stays null. */
export function toPercent(rate: number | null): number | null {
  return rate === null ? null : Math.round(rate * 1000) / 10;
}

// ------------------------------------------------------------------ trend

/** Executed result statuses in legend and stacking order. */
export const EXECUTED_ORDER = RESULT_BAR_ORDER.filter((s): s is ExecutedStatus => s !== 'untested');

export const EXECUTED_SERIES: Series<ExecutedStatus>[] = EXECUTED_ORDER.map((s) => ({
  key: s,
  label: RESULT_LABELS[s],
  color: RESULT_TONES[s].bar,
}));

export type ExecutedRow = { date: string } & Record<ExecutedStatus, number>;

/** One bar per day, stacked by result. */
export function executedRows(points: readonly TrendPointDTO[]): ExecutedRow[] {
  return points.map((p) => {
    const row = { date: formatDay(p.date) } as ExecutedRow;
    for (const s of EXECUTED_ORDER) row[s] = p.byStatus[s];
    return row;
  });
}

export function burndownRows(points: readonly TrendPointDTO[]) {
  return points.map((p) => ({ date: formatDay(p.date), remaining: p.remaining }));
}

export function passRateRows(points: readonly TrendPointDTO[]) {
  return points.map((p) => ({ date: formatDay(p.date), passRate: toPercent(p.passRate) }));
}

/** Nothing recorded and nothing left to do in the period: no point in drawing flat lines. */
export function isIdle(points: readonly TrendPointDTO[]): boolean {
  return points.every((p) => p.executed === 0 && p.remaining === 0);
}

/** Results recorded in the period, the last day and the period label. */
export function trendTotals(data: ReportTrendDTO) {
  return {
    executed: data.points.reduce((sum, p) => sum + p.executed, 0),
    last: data.points[data.points.length - 1],
    period: `${formatDay(data.from)} – ${formatDay(data.to)}`,
  };
}

// ------------------------------------------------------------------ coverage

export const NEVER_RUN_COLOR = '#ADB5BD';

export const COVERAGE_SERIES: Series<'passed' | 'failed' | 'other' | 'notExecuted' | 'neverRun'>[] =
  [
    { key: 'passed', label: 'Passed (OK, OK w/ cond.)', color: RESULT_TONES.ok.bar },
    { key: 'failed', label: 'NG or blocked', color: RESULT_TONES.ng.bar },
    { key: 'other', label: 'Executed — N/A, N/T', color: RESULT_TONES.na.bar },
    { key: 'notExecuted', label: 'In scope, not executed', color: RESULT_TONES.untested.bar },
    { key: 'neverRun', label: 'Never run', color: NEVER_RUN_COLOR },
  ];

/** One stacked bar per suite. */
export function coverageRows(rows: readonly CoverageRowDTO[]) {
  return rows.map((r) => ({
    suite: r.suite.name,
    passed: r.passed,
    failed: r.failed,
    other: Math.max(0, r.executed - r.passed - r.failed),
    notExecuted: Math.max(0, r.inScope - r.executed),
    neverRun: r.neverRun,
  }));
}

export function coverageTotals(rows: readonly CoverageRowDTO[]) {
  const sum = (key: 'cases' | 'inScope' | 'executed' | 'neverRun') =>
    rows.reduce((total, r) => total + r[key], 0);
  return {
    cases: sum('cases'),
    inScope: sum('inScope'),
    executed: sum('executed'),
    neverRun: sum('neverRun'),
  };
}

// ------------------------------------------------------------------ workload

export const WORKLOAD_SERIES: Series<'done' | 'ng' | 'untested'>[] = [
  { key: 'done', label: 'Executed (not NG)', color: PRIMARY },
  { key: 'ng', label: 'NG', color: RESULT_TONES.ng.bar },
  { key: 'untested', label: 'Untested', color: RESULT_TONES.untested.bar },
];

/** People first (most untested work first, then by name), "Unassigned" last. */
export function sortWorkload(rows: readonly WorkloadRowDTO[]): WorkloadRowDTO[] {
  return rows.toSorted(
    (a, b) =>
      (a.user ? 0 : 1) - (b.user ? 0 : 1) ||
      b.untested - a.untested ||
      personName(a.user).localeCompare(personName(b.user)),
  );
}

/** One stacked bar per person: executed (not NG), NG, untested. */
export function workloadRows(rows: readonly WorkloadRowDTO[]) {
  return sortWorkload(rows).map((r) => ({
    person: personName(r.user),
    done: Math.max(0, r.executed - r.ng),
    ng: r.ng,
    untested: r.untested,
  }));
}

export function workloadTotals(rows: readonly WorkloadRowDTO[]) {
  const sum = (key: 'runCases' | 'untested' | 'executedLast7Days' | 'remainingEstimateMinutes') =>
    rows.reduce((total, r) => total + r[key], 0);
  return {
    runCases: sum('runCases'),
    untested: sum('untested'),
    executedLast7Days: sum('executedLast7Days'),
    remainingEstimateMinutes: sum('remainingEstimateMinutes'),
    unassigned: rows.find((r) => r.user === null),
  };
}

/** Executed share of a person's run cases in percent (0 without run cases). */
export function meterPercent(value: number, total: number): number {
  return total === 0 ? 0 : (value / total) * 100;
}

// ------------------------------------------------------------------ defects

export const FLOW_SERIES: Series<'opened' | 'closed'>[] = [
  { key: 'opened', label: 'Opened', color: RESULT_TONES.ng.bar },
  { key: 'closed', label: 'Closed', color: RESULT_TONES.ok.bar },
];

export function defectTotals(data: DefectReportDTO) {
  return {
    total: DEFECT_STATUSES.reduce((sum, s) => sum + data.byStatus[s], 0),
    open: OPEN_DEFECT_STATUSES.reduce((sum, s) => sum + data.byStatus[s], 0),
    opened: data.trend.reduce((sum, p) => sum + p.opened, 0),
    closed: data.trend.reduce((sum, p) => sum + p.closed, 0),
  };
}

export function defectFlowRows(trend: DefectReportDTO['trend']) {
  return trend.map((p) => ({ ...p, date: formatDay(p.date) }));
}

/** Assignees with the most open defects first. */
export function byOpenDefects(rows: DefectReportDTO['byAssignee']) {
  return rows.toSorted((a, b) => b.open - a.open);
}

// ------------------------------------------------------------------ releases

export function releasePeriod(
  r: Pick<ReleaseComparisonRowDTO['release'], 'startDate' | 'endDate'>,
) {
  if (r.startDate && r.endDate) return `${formatDate(r.startDate)} – ${formatDate(r.endDate)}`;
  if (r.startDate) return `From ${formatDate(r.startDate)}`;
  if (r.endDate) return `Until ${formatDate(r.endDate)}`;
  return 'No dates';
}

export function releasePassRateRows(rows: readonly ReleaseComparisonRowDTO[]) {
  return rows.map((r) => ({ release: r.release.name, passRate: toPercent(r.passRate) }));
}

// ------------------------------------------------------------------ reports page state

export const REPORT_TABS = ['trend', 'workload', 'defects', 'releases', 'coverage'] as const;
export type ReportTab = (typeof REPORT_TABS)[number];
export const REPORT_DAYS = [7, 14, 30, 90] as const;
export const DEFAULT_DAYS = 30;

/** Which scope filters a tab honours (api.md § Reports). */
export const TAB_SCOPE: Record<ReportTab, { release: boolean; plan: boolean; days: boolean }> = {
  trend: { release: true, plan: true, days: true },
  workload: { release: true, plan: true, days: false },
  defects: { release: true, plan: false, days: true },
  releases: { release: false, plan: false, days: false },
  coverage: { release: true, plan: false, days: false },
};

export function parseTab(value: string | null): ReportTab {
  return (REPORT_TABS as readonly string[]).includes(value ?? '') ? (value as ReportTab) : 'trend';
}

export function parseDays(value: string | null): number {
  const n = Number(value);
  return (REPORT_DAYS as readonly number[]).includes(n) ? n : DEFAULT_DAYS;
}

/** Explains a filter the tab ignores, or what the tab counts. */
export function scopeNote(tab: ReportTab, planSelected: boolean): string | null {
  if (tab === 'releases')
    return 'Compares every release of the project — the scope filters do not apply.';
  if (planSelected && !TAB_SCOPE[tab].plan)
    return tab === 'defects'
      ? 'Defects are filtered by release only; the plan filter does not apply here.'
      : 'Coverage is filtered by release only; the plan filter does not apply here.';
  if (tab === 'workload')
    return 'Run cases of plans that are not completed, per effective assignee.';
  return null;
}

/** Link to a reports tab, scoped to a release. */
export function reportLink(projectId: number, tab: ReportTab, releaseId: number | null): string {
  return `${routes.reports(projectId)}${toQueryString({ tab, release: releaseId })}`;
}

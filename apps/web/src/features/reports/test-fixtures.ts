/**
 * Fixtures of the dashboard and report tests (not shipped: only `*.test.tsx` files import this
 * module).
 */
import { jest } from '@jest/globals';
import type {
  CoverageRowDTO,
  DashboardDTO,
  DefectReportDTO,
  ReleaseComparisonRowDTO,
  ReportTrendDTO,
  SavedViewDTO,
  SummaryDTO,
  TraceabilityDTO,
  WorkloadRowDTO,
} from '@tmt/shared';
import { userRef } from '@/features/cases/test-utils';
import { counts, makePlan, makeRelease, makeRunSummary } from '@/features/plans/test-fixtures';

/**
 * Gives recharts' ResponsiveContainer a size: jsdom has no layout, so charts would not render.
 * Only the container is measured; text is 0 wide so every tick label is drawn.
 */
export function stubChartSize(width = 800, height = 240) {
  jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const sized = this.classList.contains('recharts-responsive-container');
    const w = sized ? width : 0;
    const h = sized ? height : 0;
    return {
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: w,
      bottom: h,
      width: w,
      height: h,
      toJSON: () => ({}),
    };
  });
}

export function makeTrend(overrides: Partial<ReportTrendDTO> = {}): ReportTrendDTO {
  return {
    from: '2026-10-19',
    to: '2026-10-21',
    timezone: 'Asia/Bangkok',
    total: 40,
    points: [
      { date: '2026-10-19', executed: 0, byStatus: counts(), remaining: 40, passRate: null },
      {
        date: '2026-10-20',
        executed: 5,
        byStatus: counts({ ok: 4, ng: 1 }),
        remaining: 35,
        passRate: 0.8,
      },
      {
        date: '2026-10-21',
        executed: 3,
        byStatus: counts({ ok: 3 }),
        remaining: 32,
        passRate: 0.875,
      },
    ],
    ...overrides,
  };
}

export function makeWorkload(): WorkloadRowDTO[] {
  return [
    {
      user: null,
      runCases: 5,
      untested: 5,
      executed: 0,
      ng: 0,
      remainingEstimateMinutes: 0,
      executedLast7Days: 0,
    },
    {
      user: userRef(2, 'Bob Lead'),
      runCases: 10,
      untested: 2,
      executed: 8,
      ng: 0,
      remainingEstimateMinutes: 30,
      executedLast7Days: 8,
    },
    {
      user: userRef(1, 'Alice Tester'),
      runCases: 20,
      untested: 8,
      executed: 12,
      ng: 2,
      remainingEstimateMinutes: 90,
      executedLast7Days: 6,
    },
  ];
}

export function makeDefectReport(overrides: Partial<DefectReportDTO> = {}): DefectReportDTO {
  return {
    byStatus: {
      new: 1,
      open: 2,
      in_progress: 0,
      resolved: 1,
      closed: 3,
      reopened: 0,
      rejected: 0,
    },
    bySeverity: { critical: 1, major: 4, minor: 2, trivial: 0 },
    openBySeverity: { critical: 1, major: 2, minor: 0, trivial: 0 },
    trend: [
      { date: '2026-10-20', opened: 2, closed: 0, open: 4 },
      { date: '2026-10-21', opened: 1, closed: 2, open: 3 },
    ],
    byAssignee: [
      { user: null, open: 1 },
      { user: userRef(1, 'Alice Tester'), open: 2 },
    ],
    topCases: [{ testCaseId: 9, displayId: 'UOT-001', title: 'Power on the unit', defectCount: 3 }],
    ...overrides,
  };
}

export function makeReleaseRows(): ReleaseComparisonRowDTO[] {
  return [
    {
      release: {
        id: 6,
        name: 'FW 3.0',
        status: 'planned',
        startDate: null,
        endDate: null,
      },
      planCount: 0,
      runCount: 0,
      counts: counts(),
      passRate: null,
      progress: 0,
      defectsTotal: 0,
      defectsOpen: 0,
      judgements: { pass: 0, pass_with_condition: 0, not_pass: 0, none: 0 },
    },
    {
      release: {
        id: 5,
        name: 'FW 2.4.0',
        status: 'active',
        startDate: '2026-10-01',
        endDate: '2026-10-31',
      },
      planCount: 2,
      runCount: 3,
      counts: counts({ ok: 8, ng: 1, untested: 1 }),
      passRate: 8 / 9,
      progress: 0.9,
      defectsTotal: 5,
      defectsOpen: 3,
      judgements: { pass: 1, pass_with_condition: 0, not_pass: 0, none: 1 },
    },
  ];
}

export function makeCoverage(): CoverageRowDTO[] {
  return [
    {
      suite: { id: 1, name: 'Unit operation test', prefix: 'UOT' },
      cases: 20,
      byPriority: { critical: 2, high: 8, medium: 6, low: 4 },
      inScope: 15,
      executed: 12,
      passed: 9,
      failed: 2,
      neverRun: 5,
    },
    {
      suite: { id: 2, name: 'Adapter', prefix: 'ADP' },
      cases: 10,
      byPriority: { critical: 0, high: 5, medium: 5, low: 0 },
      inScope: 0,
      executed: 0,
      passed: 0,
      failed: 0,
      neverRun: 10,
    },
  ];
}

export function makeDashboard(overrides: Partial<DashboardDTO> = {}): DashboardDTO {
  return {
    release: makeRelease(),
    releases: [makeRelease(), makeRelease({ id: 6, name: 'FW 3.0', status: 'planned' })],
    builds: [],
    readiness: {
      state: 'on_track',
      total: 40,
      remaining: 12,
      remainingMinutes: 150,
      executedLast7Days: 28,
      perDay: 4,
      endDate: '2026-11-30',
      daysLeft: 19,
      projectedDate: '2026-11-14',
    },
    retest: { total: 0, items: [] },
    kpis: {
      planCount: 2,
      plansByStatus: { draft: 0, in_progress: 1, completed: 1 },
      counts: counts({ ok: 8, ng: 1, untested: 1 }),
      openDefects: 4,
      openDefectsBySeverity: { critical: 1, major: 2, minor: 0, trivial: 0 },
    },
    plans: [
      makePlan({
        runs: [
          makeRunSummary(),
          makeRunSummary({ id: 22, code: 'KR_02', scenario: null }),
          makeRunSummary({ id: 23, code: 'KR_03' }),
          makeRunSummary({ id: 24, code: 'KR_04' }),
          makeRunSummary({ id: 25, code: 'KR_05' }),
        ],
      }),
    ],
    attention: [
      {
        runCaseId: 101,
        status: 'ng',
        displayId: 'UOT-001',
        code: '1-1',
        title: 'Power on the unit',
        actualResult: 'Unit does not start',
        resultRemark: null,
        runId: 21,
        runCode: 'KR_01',
        planId: 7,
        planDocNo: '26TR-TEAM-10-001',
        executedBy: userRef(1, 'Alice Tester'),
        executedAt: '2026-10-20T03:00:00.000Z',
        defect: null,
      },
      {
        runCaseId: 102,
        status: 'ok_cond',
        displayId: 'UOT-002',
        code: null,
        title: 'Timer off',
        actualResult: 'Stops after 61 s',
        resultRemark: 'Within tolerance',
        runId: 21,
        runCode: 'KR_01',
        planId: 7,
        planDocNo: '26TR-TEAM-10-001',
        executedBy: null,
        executedAt: null,
        defect: {
          id: 12,
          key: 'BUG-12',
          title: 'Timer drift',
          status: 'in_progress',
          severity: 'minor',
        },
      },
    ],
    openDefects: [
      {
        id: 12,
        key: 'BUG-12',
        title: 'Timer drift',
        severity: 'major',
        priority: 'high',
        status: 'open',
        assignee: null,
        release: { id: 5, name: 'FW 2.4.0' },
        foundInBuild: null,
        fixedInBuild: null,
        linkSummary: null,
        externalKey: 'ACS-77',
        externalStatus: null,
        createdAt: '2026-10-20T00:00:00.000Z',
        updatedAt: '2026-10-20T00:00:00.000Z',
      },
    ],
    ...overrides,
  };
}

export function makeTraceability(overrides: Partial<TraceabilityDTO> = {}): TraceabilityDTO {
  return {
    rows: [
      {
        reference: 'REQ-1',
        cases: [
          {
            id: 11,
            displayId: 'UO-001',
            title: 'Power on',
            suite: { id: 1, name: 'Unit operation test' },
            status: 'ng',
          },
          {
            id: 12,
            displayId: 'UO-002',
            title: 'Power off',
            suite: { id: 1, name: 'Unit operation test' },
            status: 'ok',
          },
        ],
        counts: { total: 2, passed: 1, failed: 1, notExecuted: 0, neverRun: 0 },
        defects: [
          { id: 4, key: 'BUG-004', title: 'Does not start', status: 'open', severity: 'major' },
        ],
        openDefects: 1,
      },
      {
        reference: 'PROJ-7',
        cases: [
          {
            id: 13,
            displayId: 'UO-003',
            title: 'Timer',
            suite: { id: 1, name: 'Unit operation test' },
            status: 'ok',
          },
        ],
        counts: { total: 1, passed: 1, failed: 0, notExecuted: 0, neverRun: 0 },
        defects: [],
        openDefects: 0,
      },
    ],
    casesWithoutReference: 3,
    totalCases: 6,
    ...overrides,
  };
}

/** Three runs: Android × unit A / B and iOS × unit A, grouped by Platform × Unit model. */
export function makeSummary(overrides: Partial<SummaryDTO> = {}): SummaryDTO {
  const run = (id: number) => ({ id, planId: 7, code: `R${id}` });
  return {
    dimensions: [
      {
        key: 'Platform',
        label: 'Platform',
        builtin: false,
        options: [
          { value: 'Android', runs: 2 },
          { value: 'iOS', runs: 1 },
        ],
      },
      {
        key: 'Unit model',
        label: 'Unit model',
        builtin: false,
        options: [
          { value: 'A', runs: 2 },
          { value: 'B', runs: 1 },
        ],
      },
      {
        key: '@topic',
        label: 'Topic',
        builtin: true,
        options: [{ value: 'Unit operation test', runs: 3 }],
      },
    ],
    rows: null,
    cols: null,
    rowValues: [''],
    colValues: [''],
    cells: [
      {
        row: '',
        col: '',
        counts: counts({ ok: 12, ng: 2, blocked: 1, untested: 1 }),
        runs: [run(1), run(2), run(3)],
      },
    ],
    totals: { counts: counts({ ok: 12, ng: 2, blocked: 1, untested: 1 }), runs: 3 },
    scopeRuns: 3,
    ...overrides,
  };
}

export function makeSavedView(overrides: Partial<SavedViewDTO> = {}): SavedViewDTO {
  return {
    id: 21,
    name: 'Android by unit',
    shared: false,
    owner: userRef(1, 'Alice Tester'),
    config: { rows: 'Platform', cols: 'Unit model', filters: {} },
    createdAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  };
}

/**
 * Fixtures of the plan, dashboard and report tests (not shipped: only `*.test.tsx` files import this
 * module).
 */
import {
  emptyCounts,
  type BuildDTO,
  type MatrixDTO,
  type PlanDTO,
  type ReleaseDTO,
  type RunDTO,
  type RunSummaryDTO,
  type StatusCounts,
  type TemplateDTO,
} from '@tmt/shared';
import { userRef } from '@/features/cases/test-utils';

const T0 = '2026-10-01T08:00:00.000Z';

export const counts = (overrides: Partial<StatusCounts> = {}): StatusCounts => ({
  ...emptyCounts(),
  ...overrides,
});

export function makeRunSummary(overrides: Partial<RunSummaryDTO> = {}): RunSummaryDTO {
  return {
    id: 21,
    code: 'KR_01',
    scenario: 'AP mode · iOS',
    suiteName: 'Unit operation test',
    environment: [{ label: 'Unit model', value: 'ACU18' }],
    counts: counts({ ok: 8, ng: 1, untested: 1 }),
    judgement: null,
    sourceRun: null,
    ...overrides,
  };
}

export function makePlan(overrides: Partial<PlanDTO> = {}): PlanDTO {
  return {
    id: 7,
    projectId: 3,
    release: { id: 5, name: 'FW 2.4.0' },
    docNo: '26TR-TEAM-10-001',
    title: 'Unit operation test — ACU18',
    purpose: 'To confirm the unit operation',
    testMethod: null,
    judgementCriteria: null,
    rawDataPath: 'N:\\TEAM\\raw',
    overallJudgement: null,
    judgementNote: null,
    suggestedJudgement: 'not_pass',
    status: 'in_progress',
    completedAt: null,
    completedBy: null,
    templateId: null,
    signedCopy: null,
    counts: counts({ ok: 8, ng: 1, untested: 1 }),
    runs: [makeRunSummary()],
    createdBy: userRef(1, 'Alice Tester'),
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

export function makeBuild(overrides: Partial<BuildDTO> = {}): BuildDTO {
  return {
    id: 8,
    releaseId: 5,
    name: '1.1.7(2.0.0)',
    notes: null,
    builtDate: '2026-11-08',
    runCount: 1,
    defectCount: 0,
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

export function makeRun(overrides: Partial<RunDTO> = {}): RunDTO {
  return {
    id: 21,
    planId: 7,
    planDocNo: '26TR-TEAM-10-001',
    planTitle: 'Unit operation test — ACU18',
    planStatus: 'in_progress',
    planReleaseId: 4,
    suite: { id: 1, name: 'Unit operation test', prefix: 'UOT', fieldDefs: [] },
    code: 'KR_01',
    scenario: 'AP mode · iOS',
    environment: [
      { label: 'Unit model', value: 'ACU18' },
      { label: 'Adapter FW', value: '3.12.119' },
      { label: 'Phone', value: 'iPhone 15' },
    ],
    tester: userRef(1, 'Alice Tester'),
    testedDate: '2026-10-02',
    dueDate: null,
    judgement: null,
    judgementNote: null,
    remark: null,
    sortOrder: 0,
    counts: counts({ ok: 8, ng: 1, untested: 1 }),
    suggestedJudgement: 'not_pass',
    sourceRun: null,
    build: null,
    estimate: { totalMinutes: 60, remainingMinutes: 10 },
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

export function makeTemplate(overrides: Partial<TemplateDTO> = {}): TemplateDTO {
  return {
    id: 0,
    projectId: 3,
    suiteId: null,
    name: 'Built-in test report',
    description: null,
    fileName: 'test-report.xlsx',
    runSheet: null,
    isDefault: false,
    builtIn: true,
    createdBy: null,
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

export function makeMatrix(overrides: Partial<MatrixDTO> = {}): MatrixDTO {
  return {
    groupBy: 'summary',
    groups: ['Power', 'Timer'],
    rows: [
      {
        run: { id: 21, code: 'KR_01', scenario: 'AP mode · iOS', environment: [] },
        cells: ['pass', 'ng'],
      },
    ],
    ...overrides,
  };
}

export function makeRelease(overrides: Partial<ReleaseDTO> = {}): ReleaseDTO {
  return {
    id: 5,
    projectId: 3,
    name: 'FW 2.4.0',
    description: null,
    startDate: '2026-10-01',
    endDate: '2026-10-31',
    status: 'active',
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

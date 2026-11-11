/**
 * Test fixtures of the run, defect and collaboration features (only `*.test.tsx` files import this
 * module): DTO builders and a fake XMLHttpRequest for uploads with progress.
 */
import { jest } from '@jest/globals';
import {
  emptyCounts,
  type AttachmentDTO,
  type DefectDTO,
  type DefectListItem,
  type RunCaseDetailDTO,
  type RunCaseDTO,
  type RunDTO,
  type StatusCounts,
} from '@tmt/shared';
import { userRef } from '../cases/test-utils';

const T0 = '2026-11-01T02:00:00.000Z';

export const alice = userRef(1, 'Alice Tester');
export const bob = userRef(2, 'Bob Lead');

export const counts = (patch: Partial<StatusCounts> = {}): StatusCounts => ({
  ...emptyCounts(),
  ...patch,
});

export function makeRun(overrides: Partial<RunDTO> = {}): RunDTO {
  return {
    id: 7,
    planId: 2,
    planDocNo: '26TR-TEAM-11-001',
    planTitle: 'FW 2.4 regression',
    planStatus: 'in_progress',
    suite: { id: 1, name: 'Unit operation test', prefix: 'UOT', fieldDefs: [] },
    code: 'KR_01',
    scenario: 'Korea model',
    environment: [
      { label: 'FW version', value: '2.4.0' },
      { label: 'Router', value: 'ASUS AX' },
    ],
    tester: alice,
    testedDate: '2026-11-01',
    judgement: null,
    judgementNote: null,
    remark: null,
    sortOrder: 0,
    counts: counts({ untested: 2, ok: 1, ng: 1 }),
    suggestedJudgement: 'not_pass',
    sourceRun: null,
    estimate: { totalMinutes: 60, remainingMinutes: 30 },
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

export function makeRunCase(overrides: Partial<RunCaseDTO> = {}): RunCaseDTO {
  return {
    id: 101,
    runId: 7,
    testCaseId: 9,
    displayId: 'UOT-001',
    code: '1-1',
    title: 'Power on the unit',
    caseType: 'Normal',
    sectionPath: ['Power'],
    priority: 'high',
    tags: ['smoke'],
    estimateMinutes: 15,
    references: 'REQ-1',
    template: 'text',
    precondition: 'Unit is installed',
    procedure: 'Press ON',
    expected: 'Unit starts',
    steps: [],
    caseRemark: null,
    summaryGroup: null,
    custom: {},
    sortOrder: 0,
    assignee: null,
    status: 'untested',
    actualResult: null,
    resultRemark: null,
    executedBy: null,
    executedAt: null,
    elapsedSec: null,
    stepResults: null,
    defectCount: 0,
    attachmentCount: 0,
    ...overrides,
  };
}

export function makeDetail(
  rc: RunCaseDTO,
  overrides: Partial<RunCaseDetailDTO> = {},
): RunCaseDetailDTO {
  return { ...rc, history: [], attachments: [], defects: [], otherRuns: [], ...overrides };
}

export function makeDefectItem(overrides: Partial<DefectListItem> = {}): DefectListItem {
  return {
    id: 12,
    key: 'BUG-12',
    title: 'Fan does not start',
    severity: 'major',
    priority: 'high',
    status: 'open',
    assignee: bob,
    release: { id: 4, name: 'FW 2.4.0' },
    linkSummary: 'UOT-001 in KR_01',
    externalKey: null,
    externalStatus: null,
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

export function makeDefect(overrides: Partial<DefectDTO> = {}): DefectDTO {
  return {
    ...makeDefectItem(),
    projectId: 3,
    description: 'Seen after a firmware update',
    steps: '1. Press ON',
    expected: 'Fan starts',
    actual: 'Nothing happens',
    reporter: alice,
    foundIn: 'FW 2.4.0',
    fixedIn: null,
    environment: 'Router: ASUS AX',
    externalUrl: null,
    externalSyncedAt: null,
    resolvedAt: null,
    closedAt: null,
    links: [],
    attachments: [],
    allowedTransitions: ['in_progress', 'resolved', 'rejected'],
    ...overrides,
  };
}

export function makeAttachment(overrides: Partial<AttachmentDTO> = {}): AttachmentDTO {
  return {
    id: 'a1',
    entityType: 'run_case',
    entityId: 101,
    fileName: 'screen.png',
    mimeType: 'image/png',
    sizeBytes: 2048,
    createdBy: alice,
    createdAt: T0,
    url: '/api/v1/projects/3/attachments/a1/download',
    ...overrides,
  };
}

/** One request sent through the fake XMLHttpRequest. */
export interface FakeUpload {
  method: string;
  url: string;
  body: FormData;
  progress: (fraction: number) => void;
  respond: (status: number, json?: unknown) => void;
  fail: () => void;
}

/**
 * Replaces XMLHttpRequest (uploads with progress use it instead of fetch). `answer` may return the
 * response for a request; otherwise the test answers with `respond()` (restored after each test).
 */
export function installFakeXhr(answer?: (req: FakeUpload) => { status: number; json?: unknown }) {
  const requests: FakeUpload[] = [];
  class FakeXhr {
    upload: { onprogress: ((e: ProgressEvent) => void) | null } = { onprogress: null };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    status = 0;
    responseText = '';
    private method = '';
    private url = '';
    open(method: string, url: string) {
      this.method = method;
      this.url = url;
    }
    setRequestHeader() {}
    send(body: FormData) {
      const req: FakeUpload = {
        method: this.method,
        url: this.url,
        body,
        progress: (f) =>
          this.upload.onprogress?.({
            lengthComputable: true,
            loaded: f * 100,
            total: 100,
          } as ProgressEvent),
        respond: (status, json) => {
          this.status = status;
          this.responseText = json === undefined ? '' : JSON.stringify(json);
          this.onload?.();
        },
        fail: () => this.onerror?.(),
      };
      requests.push(req);
      const res = answer?.(req);
      if (res) setTimeout(() => req.respond(res.status, res.json), 0);
    }
  }
  jest
    .spyOn(globalThis, 'XMLHttpRequest')
    .mockImplementation(() => new FakeXhr() as unknown as XMLHttpRequest);
  return requests;
}

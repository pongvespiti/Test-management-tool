import { emptyCounts, type TopicRunDTO, type TopicsDTO, type TopicSuiteDTO } from '@tmt/shared';

const tom = { id: 5, username: 'tom', displayName: 'Tom' };

export function makeTopicRun(over: Partial<TopicRunDTO> = {}): TopicRunDTO {
  return {
    id: 7,
    code: 'KR_01',
    scenario: 'Model A · Pixel 9',
    planId: 2,
    planDocNo: '26TR-TEAM-11-001',
    planStatus: 'in_progress',
    tester: tom,
    build: { id: 8, name: '1.1.7(2.0.0)' },
    dueDate: '2026-11-20',
    overdue: false,
    counts: { ...emptyCounts(), ok: 1, untested: 1 },
    total: 2,
    remainingEstimateMinutes: 10,
    state: 'in_progress',
    ...over,
  };
}

export function makeTopicSuite(over: Partial<TopicSuiteDTO> = {}): TopicSuiteDTO {
  const run = makeTopicRun();
  return {
    suite: { id: 1, name: 'Adapter Model A', prefix: 'A35' },
    runs: [run],
    counts: run.counts,
    total: run.total,
    state: run.state,
    dueDate: run.dueDate,
    overdue: false,
    ...over,
  };
}

export function makeTopics(over: Partial<TopicsDTO> = {}): TopicsDTO {
  const first = makeTopicSuite();
  const second = makeTopicSuite({
    suite: { id: 2, name: 'Adapter Model B', prefix: 'A50' },
    runs: [
      makeTopicRun({
        id: 8,
        code: 'KR_02',
        tester: null,
        dueDate: '2026-11-05',
        overdue: true,
        counts: { ...emptyCounts(), untested: 2 },
        state: 'not_started',
      }),
    ],
    counts: { ...emptyCounts(), untested: 2 },
    state: 'not_started',
    dueDate: '2026-11-05',
    overdue: true,
  });
  return {
    release: { id: 5, name: 'Step 1.1.7' },
    releases: [
      { id: 5, name: 'Step 1.1.7' },
      { id: 4, name: 'Step 1.1.6' },
    ],
    user: null,
    timezone: 'Asia/Bangkok',
    topics: [
      {
        topic: 'Adapter operation test',
        suites: [first, second],
        counts: { ...emptyCounts(), ok: 1, untested: 3 },
        total: 4,
        state: 'in_progress',
      },
    ],
    suitesWithoutRuns: [{ id: 9, name: 'Modbus system test', topic: 'Modbus system test' }],
    ...over,
  };
}

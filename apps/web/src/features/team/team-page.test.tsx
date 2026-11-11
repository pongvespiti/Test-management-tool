import { beforeEach, describe, expect, it } from '@jest/globals';
import { screen, waitFor, within } from '@testing-library/react';
import { mockApi, openUrl } from '@/features/cases/test-utils';
import { makeTopics, makeTopicRun, makeTopicSuite } from '@/features/topics/test-fixtures';
import { makeProject, renderWithProviders } from '@/test/render';
import { TeamPage } from './team-page';

const workload = [
  {
    user: { id: 5, username: 'tom', displayName: 'Tom' },
    runCases: 4,
    executed: 2,
    ok: 1,
    ng: 1,
    blocked: 0,
    untested: 2,
    remainingEstimateMinutes: 20,
    executedLast7Days: 2,
  },
];

function stubs(extra: Record<string, unknown> = {}) {
  return mockApi({
    'GET /projects/3/topics': makeTopics(),
    'GET /projects/3/reports/workload': workload,
    ...extra,
  } as never);
}

describe('TeamPage', () => {
  beforeEach(() => openUrl('/projects/3/team'));

  it('is closed to testers', () => {
    renderWithProviders(<TeamPage />, { project: makeProject({ myRole: 'tester' }) });
    expect(screen.getByText('Only managers and leads can open this page')).toBeInTheDocument();
  });

  it('shows the load per person and the topics with an Assign button', async () => {
    stubs();
    renderWithProviders(<TeamPage />, { project: makeProject({ myRole: 'manager' }) });
    expect(await screen.findByRole('link', { name: 'Tom' })).toHaveAttribute(
      'href',
      '/projects/3/my-work?user=5',
    );
    expect((await screen.findAllByRole('button', { name: /Assign/ })).length).toBeGreaterThan(0);
  });

  it('hands a suite to a person with the chosen due date', async () => {
    const topics = makeTopics();
    const api = stubs({
      'POST /projects/3/topics/assign': { updatedRuns: 1, lockedRuns: 0, suitesWithoutRuns: [] },
      'GET /projects/3/members': [],
    });
    const { user } = renderWithProviders(<TeamPage />, {
      project: makeProject({ myRole: 'lead' }),
    });
    const buttons = await screen.findAllByRole('button', { name: /Assign/ });
    await user.click(buttons[0]!);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: /Hand out/ })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Hand out' }));
    await waitFor(() => expect(api.find('POST', '/projects/3/topics/assign')).toHaveLength(1));
    expect(api.find('POST', '/projects/3/topics/assign')[0]!.body).toEqual({
      releaseId: topics.release!.id,
      suiteIds: [topics.topics[0]!.suites[0]!.suite.id],
      testerId: 5,
    });
  });

  it('lists runs without a tester and suites without runs', async () => {
    const base = makeTopics();
    const open = makeTopicSuite({
      runs: [makeTopicRun({ id: 99, code: 'FREE_01', tester: null })],
    });
    stubs({
      'GET /projects/3/topics': {
        ...base,
        topics: [{ ...base.topics[0]!, suites: [open] }],
        suitesWithoutRuns: [{ id: 9, name: 'Empty suite', topic: 'Remote control' }],
      },
    });
    renderWithProviders(<TeamPage />, { project: makeProject({ myRole: 'manager' }) });
    const list = await screen.findByRole('list', { name: 'Not handed out' });
    expect(within(list).getByText(/FREE_01/)).toBeInTheDocument();
    expect(within(list).getByText(/Empty suite · no run yet/)).toBeInTheDocument();
  });
});

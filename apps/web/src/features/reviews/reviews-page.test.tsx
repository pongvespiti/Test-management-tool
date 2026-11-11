import { beforeEach, describe, expect, it } from '@jest/globals';
import { screen, waitFor, within } from '@testing-library/react';
import { makeProject, renderWithProviders } from '@/test/render';
import {
  apiError,
  followUrl,
  makeCase,
  makeSuite,
  mockApi,
  openUrl,
  urlParams,
  userRef,
} from '@/features/cases/test-utils';
import { idsBySuite, ReviewsPage } from './reviews-page';

const review = {
  reviewer: null,
  requestedBy: userRef(1, 'Alice Tester'),
  requestedAt: '2026-01-02T00:00:00.000Z',
  reviewedBy: null,
  reviewedAt: null,
  note: 'Updated the steps',
};
const first = makeCase({ status: 'in_review', review });
const second = makeCase({
  id: 10,
  suiteId: 2,
  displayId: 'MB-001',
  code: null,
  title: 'Read register',
  sectionPath: [],
  status: 'in_review',
  review: { ...review, reviewer: userRef(2, 'Bob Lead'), note: null },
});

function handlers(overrides: Record<string, unknown> = {}) {
  return {
    'GET /projects/3/reviews': [first, second],
    'GET /projects/3/suites': [makeSuite(), makeSuite({ id: 2, name: 'Modbus', prefix: 'MB' })],
    ...overrides,
  };
}

describe('ReviewsPage', () => {
  beforeEach(() => openUrl('/projects/3/reviews'));

  it('lists the cases waiting for review with links into the library', async () => {
    const api = mockApi(handlers());
    renderWithProviders(<ReviewsPage />, { project: makeProject({ requireCaseReview: true }) });
    expect(await screen.findByRole('link', { name: 'Power on the unit' })).toHaveAttribute(
      'href',
      '/projects/3/cases?suite=1&case=9',
    );
    expect(screen.getByText('Unit operation test › Power')).toBeInTheDocument();
    expect(screen.getByText('Modbus')).toBeInTheDocument();
    expect(screen.getByText('Any lead')).toBeInTheDocument();
    expect(screen.getByText('Bob Lead')).toBeInTheDocument();
    expect(screen.getByText('Updated the steps')).toBeInTheDocument();
    expect(screen.getByText('2 cases')).toBeInTheDocument();
    expect(screen.getByText(/Only approved cases become Ready/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open MB-001 in the library' })).toHaveAttribute(
      'href',
      '/projects/3/cases?suite=2&case=10',
    );
    expect(api.find('GET', '/projects/3/reviews')[0]!.query.get('mine')).toBe('false');
    expect(api.find('GET', '/projects/3/suites')[0]!.query.get('includeArchived')).toBe('true');
  });

  it('switches to the cases waiting for me through the URL', async () => {
    const api = mockApi(handlers());
    const { user, rerender } = renderWithProviders(<ReviewsPage />, { project: makeProject() });
    await screen.findByRole('link', { name: 'Power on the unit' });
    await user.click(screen.getByRole('radio', { name: 'Waiting for me' }));
    expect(urlParams()).toEqual({ mine: '1' });
    followUrl();
    rerender(<ReviewsPage />);
    expect(await screen.findByText('Assigned to you, or to any lead')).toBeInTheDocument();
    await waitFor(() =>
      expect(
        api.find('GET', '/projects/3/reviews').some((c) => c.query.get('mine') === 'true'),
      ).toBe(true),
    );
    await user.click(screen.getByRole('radio', { name: 'All in review' }));
    expect(urlParams()).toEqual({});
  });

  it('shows read-only rows to testers', async () => {
    mockApi(handlers());
    renderWithProviders(<ReviewsPage />, { project: makeProject({ myRole: 'tester' }) });
    await screen.findByRole('link', { name: 'Power on the unit' });
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByText(/waiting for a lead’s approval\.$/)).toBeInTheDocument();
  });

  it('approves one case and requests changes on another', async () => {
    const api = mockApi(
      handlers({
        'POST /projects/3/cases/9/review': makeCase({ status: 'ready' }),
        'POST /projects/3/cases/10/review': makeCase({ id: 10, status: 'draft' }),
      }),
    );
    const { user } = renderWithProviders(<ReviewsPage />, { project: makeProject() });
    await user.click((await screen.findAllByRole('button', { name: 'Approve' }))[0]!);
    let dialog = await screen.findByRole('dialog', { name: 'Approve test case' });
    expect(within(dialog).getByText('Power on the unit')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(api.find('POST', '/projects/3/cases/9/review')).toHaveLength(1));
    expect(api.find('POST', '/projects/3/cases/9/review')[0]!.body).toEqual({
      decision: 'approve',
      note: '',
    });

    await user.click(screen.getByRole('button', { name: 'Request changes on MB-001' }));
    dialog = await screen.findByRole('dialog', { name: 'Request changes' });
    await user.type(within(dialog).getByLabelText('What needs to change?'), 'Wrong register');
    await user.click(within(dialog).getByRole('button', { name: 'Request changes' }));
    await waitFor(() => expect(api.find('POST', '/projects/3/cases/10/review')).toHaveLength(1));
    expect(api.find('POST', '/projects/3/cases/10/review')[0]!.body).toEqual({
      decision: 'request_changes',
      note: 'Wrong register',
    });
  });

  it('closes the dialog when the case is no longer in review', async () => {
    mockApi(
      handlers({
        'POST /projects/3/cases/9/review': () =>
          apiError(409, 'INVALID_REVIEW_STATE', 'Not in review'),
      }),
    );
    const { user } = renderWithProviders(<ReviewsPage />, { project: makeProject() });
    await user.click((await screen.findAllByRole('button', { name: 'Approve' }))[0]!);
    const dialog = await screen.findByRole('dialog', { name: 'Approve test case' });
    await user.click(within(dialog).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('approves the selected cases suite by suite', async () => {
    const api = mockApi(
      handlers({
        'POST /projects/3/suites/1/cases/bulk': { affected: 1 },
        'POST /projects/3/suites/2/cases/bulk': { affected: 1 },
      }),
    );
    const { user } = renderWithProviders(<ReviewsPage />, { project: makeProject() });
    await user.click(await screen.findByRole('checkbox', { name: 'Select UOT-001' }));
    expect(screen.getByRole('checkbox', { name: 'Select all cases in the queue' })).toHaveAttribute(
      'data-state',
      'indeterminate',
    );
    await user.click(screen.getByRole('checkbox', { name: 'Select all cases in the queue' }));
    expect(screen.getByText('2 cases selected')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Approve selected' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Approve 2 cases?' });
    await user.click(within(confirm).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(screen.queryByText('2 cases selected')).not.toBeInTheDocument());
    expect(api.find('POST', '/projects/3/suites/1/cases/bulk')[0]!.body).toEqual({
      ids: [9],
      action: 'approve',
    });
    expect(api.find('POST', '/projects/3/suites/2/cases/bulk')[0]!.body).toEqual({
      ids: [10],
      action: 'approve',
    });
  });

  it('keeps the selection when approving fails and can clear it', async () => {
    const api = mockApi(
      handlers({ 'POST /projects/3/suites/1/cases/bulk': () => apiError(500, 'BOOM') }),
    );
    const { user } = renderWithProviders(<ReviewsPage />, { project: makeProject() });
    await user.click(await screen.findByRole('checkbox', { name: 'Select UOT-001' }));
    await user.click(screen.getByRole('button', { name: 'Approve selected' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Approve' }),
    );
    await waitFor(() =>
      expect(api.find('POST', '/projects/3/suites/1/cases/bulk')).toHaveLength(1),
    );
    expect(screen.getByText('1 case selected')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.queryByText('1 case selected')).not.toBeInTheDocument();
  });

  it('explains an empty queue and a failed load', async () => {
    openUrl('/projects/3/reviews?mine=1');
    let fail = false;
    mockApi(
      handlers({
        'GET /projects/3/reviews': () => (fail ? apiError(500, 'BOOM', 'Server down') : []),
      }),
    );
    const { unmount } = renderWithProviders(<ReviewsPage />, { project: makeProject() });
    expect(await screen.findByText('Nothing is waiting for you')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the test case library' })).toHaveAttribute(
      'href',
      '/projects/3/cases',
    );
    unmount();
    fail = true;
    renderWithProviders(<ReviewsPage />, { project: makeProject() });
    expect(await screen.findByText('Reviews could not be loaded')).toBeInTheDocument();
    expect(screen.getByText('Server down')).toBeInTheDocument();
  });

  it('groups case ids by suite', () => {
    expect([
      ...idsBySuite([
        { id: 1, suiteId: 2 },
        { id: 3, suiteId: 1 },
        { id: 4, suiteId: 2 },
      ]),
    ]).toEqual([
      [2, [1, 4]],
      [1, [3]],
    ]);
  });
});

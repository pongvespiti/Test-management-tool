import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { ProjectRole, SessionDTO } from '@tmt/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { mockRouter, setNavigation } from '@/test/mocks/next-navigation';
import { makeProject, renderWithProviders } from '@/test/render';
import { apiError, mockApi, type ApiCall } from '../cases/test-utils';
import { makeDefectItem } from '../runs/test-fixtures';
import { makeSession } from './test-fixtures';
import { SessionDetailPage } from './session-detail-page';

const as = (role: ProjectRole = 'tester') => ({ project: makeProject({ myRole: role }) });
const NOW = Date.parse('2026-11-10T09:30:00.000Z');

/** Stub whose GET follows `current`, so a mutation's refetch shows the new state. */
function stub(initial: SessionDTO, extra: Record<string, unknown> = {}) {
  const state = { current: initial };
  const api = mockApi({
    'GET /projects/3/sessions/4': () => state.current,
    'GET /projects/3/defects': {
      items: [makeDefectItem(), makeDefectItem({ id: 13, key: 'BUG-13', title: 'Pairing drops' })],
      total: 2,
      page: 1,
      pageSize: 100,
    },
    ...extra,
  });
  return { api, state };
}

describe('Exploratory session page', () => {
  beforeEach(() => {
    setNavigation({
      pathname: '/projects/3/sessions/4',
      params: { projectId: '3', sessionId: '4' },
    });
    jest.useFakeTimers({
      doNotFake: [
        'setTimeout',
        'setInterval',
        'clearTimeout',
        'clearInterval',
        'queueMicrotask',
        'nextTick',
        'setImmediate',
        'clearImmediate',
      ],
      now: NOW,
    });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows the charter, environment and a planned session with a Start button', async () => {
    stub(makeSession({ references: 'REQ-12, IOT-345' }));
    renderWithProviders(<SessionDetailPage />, as());
    expect(
      await screen.findByRole('heading', { name: 'Pairing while the router restarts' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/lost settings/)).toBeInTheDocument();
    expect(screen.getByText('REQ-12, IOT-345')).toBeInTheDocument();
    expect(screen.getByText('Android')).toBeInTheDocument();
    expect(screen.getByText(/Not started/)).toHaveTextContent('Time box 1 h');
    expect(screen.getByRole('button', { name: /Start session/ })).toBeInTheDocument();
  });

  it('starts the session and then shows the elapsed time against the time box', async () => {
    const { api, state } = stub(makeSession(), {
      'POST /projects/3/sessions/4/start': () => {
        state.current = makeSession({
          status: 'in_progress',
          startedAt: '2026-11-10T09:00:00.000Z',
        });
        return state.current;
      },
    });
    const { user } = renderWithProviders(<SessionDetailPage />, as());
    await user.click(await screen.findByRole('button', { name: /Start session/ }));
    expect(await screen.findByTestId('session-elapsed')).toHaveTextContent('30 min');
    expect(screen.getByRole('progressbar', { name: 'Time box used' })).toHaveAttribute(
      'aria-valuenow',
      '50',
    );
    expect(screen.getByRole('button', { name: /Complete session/ })).toBeInTheDocument();
    expect(api.find('POST', '/projects/3/sessions/4/start')).toHaveLength(1);
  });

  it('warns when the time box has passed', async () => {
    stub(makeSession({ status: 'in_progress', startedAt: '2026-11-10T08:00:00.000Z' }));
    renderWithProviders(<SessionDetailPage />, as());
    expect(await screen.findByText(/Time box passed/)).toBeInTheDocument();
    expect(screen.getByTestId('session-elapsed')).toHaveTextContent('1 h 30 min');
  });

  it('adds a note of the chosen kind and clears the box', async () => {
    const { api, state } = stub(
      makeSession({ status: 'in_progress', startedAt: '2026-11-10T09:00:00.000Z' }),
      {
        'POST /projects/3/sessions/4/notes': (c: ApiCall) => {
          const b = c.body as { kind: 'bug'; body: string };
          state.current = makeSession({
            status: 'in_progress',
            startedAt: '2026-11-10T09:00:00.000Z',
            notes: [
              {
                id: 1,
                kind: b.kind,
                body: b.body,
                author: { id: 1, username: 'alice', displayName: 'Alice Tester' },
                createdAt: '2026-11-10T09:20:00.000Z',
              },
            ],
          });
          return state.current.notes[0];
        },
      },
    );
    const { user } = renderWithProviders(<SessionDetailPage />, as());
    await screen.findByRole('heading', { name: /Pairing/ });
    expect(screen.getByText('No notes yet.')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Bug found' }));
    await user.type(screen.getByLabelText('New note'), 'Settings lost after restart');
    await user.click(screen.getByRole('button', { name: 'Add note' }));
    expect(await screen.findByText('Settings lost after restart')).toBeInTheDocument();
    expect(api.find('POST', '/projects/3/sessions/4/notes')[0]!.body).toEqual({
      kind: 'bug',
      body: 'Settings lost after restart',
    });
    await waitFor(() => expect(screen.getByLabelText('New note')).toHaveValue(''));
    expect(screen.getByRole('button', { name: 'Delete note' })).toBeInTheDocument();
  });

  it('does not accept notes once the session is completed', async () => {
    stub(
      makeSession({
        status: 'completed',
        startedAt: '2026-11-10T09:00:00.000Z',
        endedAt: '2026-11-10T09:40:00.000Z',
      }),
    );
    renderWithProviders(<SessionDetailPage />, as());
    expect(await screen.findByLabelText('New note')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add note' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Resume session/ })).toBeInTheDocument();
  });

  it('links and unlinks a defect', async () => {
    const linked = {
      id: 12,
      key: 'BUG-12',
      title: 'Fan does not start',
      status: 'open',
      severity: 'major',
    } as const;
    const { api, state } = stub(makeSession(), {
      'POST /projects/3/sessions/4/defects': (c: ApiCall) => {
        expect(c.body).toEqual({ defectId: 12 });
        state.current = makeSession({ defects: [linked], defectCount: 1 });
        return state.current;
      },
      'DELETE /projects/3/sessions/4/defects/12': () => {
        state.current = makeSession();
        return state.current;
      },
    });
    const { user } = renderWithProviders(<SessionDetailPage />, as());
    expect(await screen.findByText('No defects linked.')).toBeInTheDocument();
    await user.click(screen.getByRole('combobox', { name: 'Link a defect' }));
    await user.click(await screen.findByRole('option', { name: /BUG-12/ }));
    const link = await screen.findByRole('link', { name: /Fan does not start/ });
    expect(link).toHaveAttribute('href', '/projects/3/defects/12');
    await user.click(screen.getByRole('button', { name: 'Unlink BUG-12' }));
    expect(await screen.findByText('No defects linked.')).toBeInTheDocument();
    expect(api.find('DELETE', '/projects/3/sessions/4/defects/12')).toHaveLength(1);
  });

  it('saves the debrief only after it changed', async () => {
    const { api } = stub(makeSession(), {
      'PATCH /projects/3/sessions/4': (c: ApiCall) =>
        makeSession({ summary: (c.body as { summary: string }).summary }),
    });
    const { user } = renderWithProviders(<SessionDetailPage />, as());
    const save = await screen.findByRole('button', { name: 'Save debrief' });
    expect(save).toBeDisabled();
    await user.type(screen.getByRole('textbox', { name: 'Debrief' }), 'Found two issues');
    await user.click(save);
    await waitFor(() => expect(api.find('PATCH', '/projects/3/sessions/4')).toHaveLength(1));
    expect(api.find('PATCH', '/projects/3/sessions/4')[0]!.body).toEqual({
      summary: 'Found two issues',
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save debrief' })).toBeDisabled(),
    );
  });

  it('deletes the session after confirmation and returns to the list', async () => {
    const { api } = stub(makeSession(), { 'DELETE /projects/3/sessions/4': undefined });
    const { user } = renderWithProviders(<SessionDetailPage />, as('lead'));
    await user.click(await screen.findByRole('button', { name: 'Delete session' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: /Delete/ }));
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith('/projects/3/sessions'));
    expect(api.find('DELETE', '/projects/3/sessions/4')).toHaveLength(1);
  });

  it('is read-only for viewers', async () => {
    const api = stub(
      makeSession({
        summary: 'All good',
        notes: [
          {
            id: 1,
            kind: 'note',
            body: 'First look',
            author: null,
            createdAt: '2026-11-10T09:20:00.000Z',
          },
        ],
      }),
    ).api;
    renderWithProviders(<SessionDetailPage />, as('viewer'));
    expect(await screen.findByText('First look')).toBeInTheDocument();
    expect(screen.getByText('All good')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Start session|Edit|Delete/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText('New note')).not.toBeInTheDocument();
    expect(api.find('GET', '/projects/3/defects')).toHaveLength(0);
  });

  it('shows the error when the session does not exist', async () => {
    mockApi({
      'GET /projects/3/sessions/4': () => apiError(404, 'SESSION_NOT_FOUND', 'Session not found'),
    });
    renderWithProviders(<SessionDetailPage />, as());
    expect(await screen.findByText(/Session not found/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to sessions' })).toHaveAttribute(
      'href',
      '/projects/3/sessions',
    );
  });
});

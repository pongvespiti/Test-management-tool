import { beforeEach, describe, expect, it } from '@jest/globals';
import type { ProjectRole } from '@tmt/shared';
import { screen, waitFor } from '@testing-library/react';
import { mockRouter } from '@/test/mocks/next-navigation';
import { makeProject, renderWithProviders } from '@/test/render';
import { followUrl, mockApi, openUrl, urlParams } from '../cases/test-utils';
import { makeRelease } from '../plans/test-fixtures';
import { makeSession, makeSessionItem } from './test-fixtures';
import { SessionsPage } from './sessions-page';

const as = (role: ProjectRole = 'tester') => ({ project: makeProject({ myRole: role }) });

function stub(extra: Record<string, unknown> = {}) {
  return mockApi({
    'GET /projects/3/sessions': [
      makeSessionItem(),
      makeSessionItem({
        id: 5,
        key: 'EXP-5',
        title: 'Low battery pairing',
        status: 'completed',
        startedAt: '2026-11-10T09:00:00.000Z',
        endedAt: '2026-11-10T10:15:00.000Z',
        noteCount: 3,
        defectCount: 1,
        build: { id: 9, name: 'b102' },
      }),
    ],
    'GET /projects/3/releases': [makeRelease()],
    'GET /projects/3/members': [],
    'GET /projects/3/env-dimensions': { dimensions: [] },
    ...extra,
  });
}

describe('Exploratory sessions list', () => {
  beforeEach(() => openUrl('/projects/3/sessions'));

  it('lists the sessions with status, release, build, time and counts', async () => {
    stub();
    renderWithProviders(<SessionsPage />, as());
    expect(await screen.findByText('Pairing while the router restarts')).toBeInTheDocument();
    const done = screen.getByText('Low battery pairing').closest('tr')!;
    expect(done).toHaveTextContent('EXP-5');
    expect(done).toHaveTextContent('Completed');
    expect(done).toHaveTextContent('FW 2.4.0 · b102');
    expect(done).toHaveTextContent('1 h 15 min / 1 h');
    const planned = screen.getByText('Pairing while the router restarts').closest('tr')!;
    expect(planned).toHaveTextContent('1 h box');
  });

  it('filters by status and by owner through the address and the query', async () => {
    const api = stub();
    const { user, rerender } = renderWithProviders(<SessionsPage />, as());
    await screen.findByText('Low battery pairing');
    await user.click(screen.getByRole('radio', { name: 'In progress' }));
    expect(urlParams()).toEqual({ status: 'in_progress' });
    followUrl();
    rerender(<SessionsPage />);
    await waitFor(() =>
      expect(api.find('GET', '/projects/3/sessions').at(-1)!.query.get('status')).toBe(
        'in_progress',
      ),
    );
    await user.click(screen.getByRole('radio', { name: 'Mine' }));
    followUrl();
    rerender(<SessionsPage />);
    await waitFor(() =>
      expect(api.find('GET', '/projects/3/sessions').at(-1)!.query.get('ownerId')).toBe('1'),
    );
  });

  it('opens a session from its row or its title link', async () => {
    stub();
    const { user } = renderWithProviders(<SessionsPage />, as());
    expect(await screen.findByRole('link', { name: 'Low battery pairing' })).toHaveAttribute(
      'href',
      '/projects/3/sessions/5',
    );
    await user.click(screen.getByText('EXP-5'));
    expect(mockRouter.push).toHaveBeenCalledWith('/projects/3/sessions/5');
  });

  it('creates a session and opens it', async () => {
    const api = stub({
      'POST /projects/3/sessions': (c: { body: unknown }) =>
        makeSession({ id: 8, key: 'EXP-8', title: (c.body as { title: string }).title }),
    });
    const { user } = renderWithProviders(<SessionsPage />, as());
    await user.click(await screen.findByRole('button', { name: /New session/ }));
    const dialog = await screen.findByRole('dialog');
    // The title is required.
    await user.click(screen.getByRole('button', { name: 'Create session' }));
    expect(await screen.findByText(/required|enter/i)).toBeInTheDocument();
    expect(api.find('POST', '/projects/3/sessions')).toHaveLength(0);

    await user.type(screen.getByLabelText('Title'), 'Explore OTA');
    await user.type(screen.getByLabelText('Charter'), 'Update over a weak signal');
    await user.type(screen.getByLabelText('Time box (minutes)'), '45');
    await user.click(screen.getByRole('button', { name: 'Create session' }));
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith('/projects/3/sessions/8'));
    const body = api.find('POST', '/projects/3/sessions')[0]!.body as Record<string, unknown>;
    expect(body).toMatchObject({
      title: 'Explore OTA',
      charter: 'Update over a weak signal',
      timeBoxMinutes: 45,
      ownerId: 1,
      releaseId: null,
      buildId: null,
      environment: [],
    });
    expect(dialog).not.toBeInTheDocument();
  });

  it('hides the create button from viewers', async () => {
    stub();
    renderWithProviders(<SessionsPage />, as('viewer'));
    await screen.findByText('Low battery pairing');
    expect(screen.queryByRole('button', { name: /New session/ })).not.toBeInTheDocument();
  });

  it('explains an empty list and offers the first session', async () => {
    stub({ 'GET /projects/3/sessions': [] });
    renderWithProviders(<SessionsPage />, as());
    expect(await screen.findByText('No exploratory sessions yet')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /New session/ })).toHaveLength(2);
  });
});

import { beforeEach, describe, expect, it } from '@jest/globals';
import type { NotificationDTO, NotificationListDTO } from '@tmt/shared';
import { screen, waitFor } from '@testing-library/react';
import { NotificationBell } from '@/components/layout/notification-bell';
import { mockRouter, resetNavigation } from '@/test/mocks/next-navigation';
import { makeProject, renderWithProviders } from '@/test/render';
import { followUrl, mockApi, openUrl, urlParams } from '../cases/test-utils';
import { NotificationsPage } from './notifications-page';

const note = (overrides: Partial<NotificationDTO> = {}): NotificationDTO => ({
  id: 1,
  kind: 'assigned',
  title: 'Run "Smoke 1.2" is yours',
  body: 'Due 20 Nov',
  link: '/projects/3/runs/9',
  read: false,
  createdAt: new Date().toISOString(),
  ...overrides,
});

const list = (items: NotificationDTO[], unread = items.filter((n) => !n.read).length) =>
  ({ items, unread }) satisfies NotificationListDTO;

const as = () => ({ project: makeProject({ myRole: 'tester' }) });

describe('Notification bell', () => {
  beforeEach(() => {
    resetNavigation();
    openUrl('/projects/3/runs');
  });

  it('shows the unread count and opens a notification, marking it read', async () => {
    const api = mockApi({
      'GET /projects/3/notifications': list([
        note(),
        note({ id: 2, kind: 'overdue', title: 'Run "Smoke 1.1" is overdue', read: true }),
      ]),
      'POST /projects/3/notifications/1/read': undefined,
    });
    const { user } = renderWithProviders(<NotificationBell />, as());
    const bell = await screen.findByRole('button', { name: 'Notifications, 1 unread' });
    await user.click(bell);
    await user.click(await screen.findByRole('button', { name: /Run "Smoke 1.2" is yours/ }));
    expect(mockRouter.push).toHaveBeenCalledWith('/projects/3/runs/9');
    await waitFor(() =>
      expect(api.find('POST', '/projects/3/notifications/1/read')).toHaveLength(1),
    );
  });

  it('does not mark an already read notification again', async () => {
    const api = mockApi({
      'GET /projects/3/notifications': list([note({ id: 2, read: true })]),
    });
    const { user } = renderWithProviders(<NotificationBell />, as());
    await user.click(await screen.findByRole('button', { name: 'Notifications' }));
    await user.click(await screen.findByRole('button', { name: /is yours/ }));
    expect(mockRouter.push).toHaveBeenCalledWith('/projects/3/runs/9');
    expect(api.calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  });

  it('marks everything as read and disables the action when nothing is unread', async () => {
    const api = mockApi({
      'GET /projects/3/notifications': list([note(), note({ id: 3, title: 'Another' })]),
      'POST /projects/3/notifications/read-all': undefined,
    });
    const { user } = renderWithProviders(<NotificationBell />, as());
    await user.click(await screen.findByRole('button', { name: 'Notifications, 2 unread' }));
    await user.click(screen.getByRole('button', { name: 'Mark all as read' }));
    await waitFor(() =>
      expect(api.find('POST', '/projects/3/notifications/read-all')).toHaveLength(1),
    );
  });

  it('explains an empty list', async () => {
    mockApi({ 'GET /projects/3/notifications': list([]) });
    const { user } = renderWithProviders(<NotificationBell />, as());
    await user.click(await screen.findByRole('button', { name: 'Notifications' }));
    expect(await screen.findByText(/Nothing new/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark all as read' })).toBeDisabled();
  });

  it('shows the lab-wide notifications (stand requests) outside a project', async () => {
    const api = mockApi({
      'GET /notifications': list([
        note({
          id: 7,
          kind: 'stand_request',
          title: 'Ann: Install ACU-25 at L2/A-1',
          link: '/stands?tab=requests&request=4',
        }),
      ]),
      'POST /notifications/7/read': null,
    });
    const { user } = renderWithProviders(<NotificationBell />);
    await user.click(await screen.findByRole('button', { name: 'Notifications, 1 unread' }));
    expect(screen.getByRole('link', { name: 'Stand requests' })).toHaveAttribute(
      'href',
      '/stands?tab=requests',
    );
    await user.click(screen.getByRole('button', { name: /Install ACU-25/ }));
    await waitFor(() => expect(api.find('POST', '/notifications/7/read')).toHaveLength(1));
    expect(mockRouter.push).toHaveBeenCalledWith('/stands?tab=requests&request=4');
  });
});

describe('Notifications page', () => {
  beforeEach(() => {
    resetNavigation();
    openUrl('/projects/3/notifications');
  });

  it('lists notifications with their kind and opens one', async () => {
    const api = mockApi({
      'GET /projects/3/notifications': list([
        note(),
        note({
          id: 2,
          kind: 'retest',
          title: 'DEF-4 is ready for retest',
          link: '/projects/3/defects?defect=4',
        }),
      ]),
      'POST /projects/3/notifications/2/read': undefined,
    });
    const { user } = renderWithProviders(<NotificationsPage />, as());
    expect(await screen.findByText('Assigned to you', { exact: false })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /DEF-4 is ready for retest/ }));
    expect(mockRouter.push).toHaveBeenCalledWith('/projects/3/defects?defect=4');
    await waitFor(() =>
      expect(api.find('POST', '/projects/3/notifications/2/read')).toHaveLength(1),
    );
  });

  it('asks only for unread ones when filtered', async () => {
    const api = mockApi({ 'GET /projects/3/notifications': list([note()]) });
    const { user, rerender } = renderWithProviders(<NotificationsPage />, as());
    await screen.findByText(/is yours/);
    await user.click(screen.getByRole('radio', { name: 'Unread' }));
    expect(urlParams()).toEqual({ show: 'unread' });
    followUrl();
    rerender(<NotificationsPage />);
    await waitFor(() =>
      expect(
        api.find('GET', '/projects/3/notifications').some((c) => c.query.get('unread') === 'true'),
      ).toBe(true),
    );
  });

  it('shows an empty state', async () => {
    mockApi({ 'GET /projects/3/notifications': list([]) });
    renderWithProviders(<NotificationsPage />, as());
    expect(await screen.findByText('No notifications yet')).toBeInTheDocument();
  });
});

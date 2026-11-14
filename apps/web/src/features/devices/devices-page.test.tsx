import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { DeviceDTO, ProjectRole } from '@tmt/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { toast } from 'sonner';
import { makeProject, makeUser, renderWithProviders } from '@/test/render';
import { apiError, followUrl, mockApi, openUrl, urlParams } from '../cases/test-utils';
import { DevicesPage } from './devices-page';

const device = (overrides: Partial<DeviceDTO> = {}): DeviceDTO => ({
  id: 1,
  kind: 'unit',
  name: 'Unit A',
  model: 'ACU-35',
  serial: 'SN-001',
  osVersion: 'FW 2.0.1',
  status: 'available',
  holder: null,
  heldSince: null,
  note: null,
  createdAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-01T00:00:00Z',
  ...overrides,
});

const me = makeUser();
const as = (role: ProjectRole = 'tester') => ({
  project: makeProject({ myRole: role }),
  auth: { user: me },
});
const heldBy = (id: number, displayName: string) => ({
  status: 'in_use' as const,
  holder: { id, username: displayName.toLowerCase(), displayName },
  heldSince: '2026-11-10T00:00:00Z',
});

function stub(extra: Record<string, unknown> = {}) {
  return mockApi({
    'GET /projects/3/devices': [
      device(),
      device({
        id: 2,
        kind: 'phone',
        name: 'Pixel 9',
        model: null,
        serial: null,
        osVersion: 'Android 15',
        ...heldBy(99, 'Somchai'),
      }),
      device({ id: 3, kind: 'router', name: 'Router R1', status: 'repair' }),
      device({ id: 4, name: 'Unit B', ...heldBy(me.id, me.displayName) }),
    ],
    ...extra,
  });
}

const row = (name: string) => screen.getByText(name).closest('tr')!;

describe('Devices page', () => {
  beforeEach(() => openUrl('/projects/3/devices'));

  it('lists devices with status and holder', async () => {
    stub();
    renderWithProviders(<DevicesPage />, as());
    await screen.findByText('Unit A');
    expect(row('Unit A')).toHaveTextContent('Available');
    expect(row('Unit A')).toHaveTextContent('SN-001');
    expect(row('Pixel 9')).toHaveTextContent('In use');
    expect(row('Pixel 9')).toHaveTextContent('Somchai');
    expect(row('Router R1')).toHaveTextContent('In repair');
  });

  it('takes a free device', async () => {
    const api = stub({
      'POST /projects/3/devices/1/check-out': device({ ...heldBy(me.id, me.displayName) }),
    });
    const { user } = renderWithProviders(<DevicesPage />, as());
    await user.click(await screen.findByRole('button', { name: 'Take Unit A' }));
    await waitFor(() =>
      expect(api.find('POST', '/projects/3/devices/1/check-out')).toHaveLength(1),
    );
    expect(screen.queryByRole('button', { name: 'Take Pixel 9' })).not.toBeInTheDocument();
  });

  it('shows the API reason when the device was taken meanwhile', async () => {
    stub({
      'POST /projects/3/devices/1/check-out': () =>
        apiError(409, 'DEVICE_NOT_AVAILABLE', 'Unit A is held by Somchai'),
    });
    const error = jest.spyOn(toast, 'error');
    const { user } = renderWithProviders(<DevicesPage />, as());
    await user.click(await screen.findByRole('button', { name: 'Take Unit A' }));
    await waitFor(() =>
      expect(error).toHaveBeenCalledWith(
        'Could not take the device',
        expect.objectContaining({ description: 'Unit A is held by Somchai' }),
      ),
    );
  });

  it('lets me return my own device but not someone else’s', async () => {
    const api = stub({ 'POST /projects/3/devices/4/return': device({ id: 4 }) });
    const { user } = renderWithProviders(<DevicesPage />, as('tester'));
    await screen.findByText('Unit A');
    expect(screen.queryByRole('button', { name: 'Return Pixel 9' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Return Unit B' }));
    await waitFor(() => expect(api.find('POST', '/projects/3/devices/4/return')).toHaveLength(1));
  });

  it('lets a lead return a device for someone else and delete devices', async () => {
    stub();
    renderWithProviders(<DevicesPage />, as('lead'));
    await screen.findByText('Unit A');
    expect(screen.getByRole('button', { name: 'Return Pixel 9' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Unit A' })).toBeInTheDocument();
  });

  it('sends a free device to repair and back', async () => {
    const api = stub({
      'PATCH /projects/3/devices/1': device({ status: 'repair' }),
      'PATCH /projects/3/devices/3': device({ id: 3 }),
    });
    const { user } = renderWithProviders(<DevicesPage />, as());
    await user.click(await screen.findByRole('button', { name: 'Send Unit A to repair' }));
    await waitFor(() =>
      expect(api.find('PATCH', '/projects/3/devices/1').at(0)!.body).toEqual({ status: 'repair' }),
    );
    await user.click(screen.getByRole('button', { name: 'Router R1 is back from repair' }));
    await waitFor(() =>
      expect(api.find('PATCH', '/projects/3/devices/3').at(0)!.body).toEqual({
        status: 'available',
      }),
    );
    // A held device cannot be sent to repair.
    expect(
      screen.queryByRole('button', { name: 'Send Pixel 9 to repair' }),
    ).not.toBeInTheDocument();
  });

  it('adds a device and reports a name already in use', async () => {
    const api = stub({
      'POST /projects/3/devices': () => apiError(409, 'DEVICE_NAME_TAKEN', 'taken'),
    });
    const { user } = renderWithProviders(<DevicesPage />, as());
    await user.click(await screen.findByRole('button', { name: 'New device' }));
    await user.click(screen.getByRole('button', { name: 'Add device' }));
    expect(await screen.findByText('Required')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Name'), 'Unit A');
    await user.click(screen.getByRole('radio', { name: 'Router' }));
    await user.click(screen.getByRole('button', { name: 'Add device' }));
    expect(await screen.findByText('Another device has this name')).toBeInTheDocument();
    expect(api.find('POST', '/projects/3/devices')[0]!.body).toMatchObject({
      kind: 'router',
      name: 'Unit A',
    });
  });

  it('hides every action from a viewer', async () => {
    stub();
    renderWithProviders(<DevicesPage />, as('viewer'));
    await screen.findByText('Unit A');
    expect(screen.queryByRole('button', { name: 'New device' })).not.toBeInTheDocument();
    expect(within(row('Unit A')).queryByRole('button')).not.toBeInTheDocument();
  });

  it('filters by kind through the address and the query', async () => {
    const api = stub();
    const { user, rerender } = renderWithProviders(<DevicesPage />, as());
    await screen.findByText('Unit A');
    await user.click(screen.getByRole('radio', { name: 'Phone' }));
    expect(urlParams()).toEqual({ kind: 'phone' });
    followUrl();
    rerender(<DevicesPage />);
    await waitFor(() =>
      expect(api.find('GET', '/projects/3/devices').at(-1)!.query.get('kind')).toBe('phone'),
    );
  });
});

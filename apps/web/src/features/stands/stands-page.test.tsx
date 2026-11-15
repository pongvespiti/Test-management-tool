import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type {
  StandBoardDTO,
  StandBookingDTO,
  StandDTO,
  StandImportResultDTO,
  StandRequestDTO,
} from '@tmt/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { resetNavigation } from '@/test/mocks/next-navigation';
import { makeUser, renderWithProviders } from '@/test/render';
import { apiError, followUrl, mockApi, openUrl, urlParams, userRef } from '../cases/test-utils';
import { StandsPage } from './stands-page';
import { addDaysIso, todayIso } from './stand-dates';

const today = todayIso();

const stand = (overrides: Partial<StandDTO> = {}): StandDTO => ({
  id: 1,
  zoneId: 10,
  code: 'L1/A-1',
  sortOrder: 10,
  currentModel: 'ACU-25',
  inCharge: 'Ann',
  note: null,
  updatedBy: null,
  updatedAt: new Date().toISOString(),
  currentBooking: null,
  nextBooking: null,
  openRequests: 0,
  ...overrides,
});

const booking = (overrides: Partial<StandBookingDTO> = {}): StandBookingDTO => ({
  id: 5,
  standId: 2,
  standCode: 'L1/A-2',
  project: { id: 3, key: 'ACS', name: 'ACS Smart control' },
  model: 'ACU-60',
  startDate: today,
  endDate: addDaysIso(today, 3),
  startTime: null,
  endTime: null,
  note: null,
  tester: userRef(1, 'Alice Tester'),
  createdBy: userRef(1, 'Alice Tester'),
  createdAt: new Date().toISOString(),
  ...overrides,
});

const board = (overrides: Partial<StandBoardDTO> = {}): StandBoardDTO => ({
  zones: [
    {
      id: 10,
      name: 'Zone A',
      sortOrder: 10,
      stands: [
        stand(),
        stand({ id: 2, code: 'L1/A-2', currentModel: null, currentBooking: booking() }),
      ],
    },
    {
      id: 11,
      name: 'Zone B',
      sortOrder: 20,
      stands: [stand({ id: 3, code: 'L1/B-1', currentModel: 'ACU-71', openRequests: 1 })],
    },
  ],
  canManage: false,
  canRequest: true,
  ...overrides,
});

const request = (overrides: Partial<StandRequestDTO> = {}): StandRequestDTO => ({
  id: 4,
  standId: 3,
  standCode: 'L1/B-1',
  zoneName: 'Zone B',
  project: { id: 3, key: 'ACS', name: 'ACS Smart control' },
  kind: 'install',
  model: 'ACU-35',
  technician: userRef(9, 'Tina Tech'),
  requestedBy: userRef(1, 'Alice Tester'),
  requestedDate: addDaysIso(today, 2),
  scheduledDate: null,
  status: 'requested',
  note: 'Before the energy test',
  technicianNote: null,
  doneAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

/** A tester of project ACS. */
const tester = {
  auth: {
    user: makeUser(),
    me: {
      user: makeUser(),
      memberships: [
        {
          projectId: 3,
          projectKey: 'ACS',
          projectName: 'ACS Smart control',
          role: 'tester' as const,
        },
        { projectId: 4, projectKey: 'VIEW', projectName: 'Viewer only', role: 'viewer' as const },
      ],
    },
  },
};

const technician = {
  auth: {
    user: makeUser({ id: 9, displayName: 'Tina Tech', isTechnician: true }),
    isTechnician: true,
  },
};

describe('Test stands page', () => {
  beforeEach(() => {
    resetNavigation();
    openUrl('/stands');
  });

  it('shows zones with what is on each stand and who has it booked; finds a model', async () => {
    const api = mockApi({
      'GET /stands': (c: { query: URLSearchParams }) =>
        c.query.get('model')
          ? board({ zones: [{ ...board().zones[1]!, stands: [board().zones[1]!.stands[0]!] }] })
          : board(),
    });
    const { rerender } = renderWithProviders(<StandsPage />, tester);
    expect(await screen.findByRole('heading', { name: 'Zone A' })).toBeInTheDocument();
    const a2 = screen.getByRole('button', { name: 'Stand L1/A-2: empty' });
    expect(within(a2).getByText('ACS')).toBeInTheDocument();
    expect(within(a2).getByText(/ACU-60 until/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stand L1/B-1: ACU-71' })).toHaveTextContent('1');

    fireEvent.change(screen.getByLabelText('Find a model'), { target: { value: 'acu-71' } });
    followUrl();
    rerender(<StandsPage />);
    await waitFor(() =>
      expect(api.calls.some((c) => c.query.get('model') === 'acu-71')).toBe(true),
    );
    expect(await screen.findByRole('heading', { name: 'Zone B' })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Zone A' })).not.toBeInTheDocument(),
    );
    // Testers do not see the layout tools.
    expect(screen.queryByRole('button', { name: /New zone/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Import' })).not.toBeInTheDocument();
  });

  it('books a stand for a project and explains an overlapping booking', async () => {
    let attempt = 0;
    const api = mockApi({
      'GET /stands': board(),
      'GET /stands/bookings': [],
      'GET /stands/requests': [],
      'POST /stands/bookings': () =>
        ++attempt === 1
          ? apiError(409, 'STAND_BOOKED', 'L1/A-1 is booked for ACS from 2026-11-20 to 2026-11-25')
          : booking({ standId: 1, standCode: 'L1/A-1' }),
    });
    const { user, rerender } = renderWithProviders(<StandsPage />, tester);
    await user.click(await screen.findByRole('button', { name: 'Stand L1/A-1: ACU-25' }));
    followUrl();
    rerender(<StandsPage />);
    expect(urlParams()).toEqual({ stand: '1' });
    const detail = await screen.findByRole('dialog');
    await user.click(within(detail).getByRole('button', { name: 'Book' }));

    const form = await screen.findByRole('dialog', { name: 'Book a stand' });
    expect(within(form).getByRole('combobox', { name: 'Stand' })).toHaveTextContent('L1/A-1');
    // Only projects where the user is tester or lead can be chosen; ACS is the only one.
    expect(within(form).getByRole('combobox', { name: 'Project' })).toHaveTextContent('ACS');
    await user.type(within(form).getByLabelText('Model to test'), 'ACU-35');
    await user.click(within(form).getByRole('button', { name: 'Book' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent('is booked for ACS');

    await user.click(within(form).getByRole('button', { name: 'Book' }));
    await waitFor(() => expect(api.find('POST', '/stands/bookings')).toHaveLength(2));
    expect(api.find('POST', '/stands/bookings')[1]!.body).toEqual({
      standId: 1,
      projectId: 3,
      model: 'ACU-35',
      startDate: today,
      endDate: addDaysIso(today, 6),
      startTime: null,
      endTime: null,
      testerId: 1,
      note: '',
    });
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Book a stand' })).not.toBeInTheDocument(),
    );
  });

  it('sends a request to a technician', async () => {
    const api = mockApi({
      'GET /stands': board(),
      'GET /stands/technicians': [userRef(9, 'Tina Tech')],
      'POST /stands/requests': request(),
    });
    const { user } = renderWithProviders(<StandsPage />, tester);
    await user.click(await screen.findByRole('button', { name: /Request technician/ }));
    const form = await screen.findByRole('dialog', { name: 'Request a technician' });
    await user.click(within(form).getByRole('radio', { name: 'Replace' }));
    await user.click(within(form).getByRole('combobox', { name: 'Stand' }));
    await user.click(await screen.findByRole('option', { name: 'L1/B-1 (ACU-71)' }));
    await user.click(within(form).getByRole('combobox', { name: 'Technician' }));
    await user.click(await screen.findByRole('option', { name: 'Tina Tech' }));
    await user.click(within(form).getByRole('button', { name: 'Send request' }));
    // The model to install is required for a replacement.
    expect(await within(form).findByText(/model/i, { selector: 'p' })).toBeInTheDocument();
    await user.type(within(form).getByLabelText('Model to install'), 'ACU-35');
    await user.click(within(form).getByRole('button', { name: 'Send request' }));
    await waitFor(() => expect(api.find('POST', '/stands/requests')).toHaveLength(1));
    expect(api.find('POST', '/stands/requests')[0]!.body).toEqual({
      standId: 3,
      projectId: 3,
      kind: 'replace',
      model: 'ACU-35',
      technicianId: 9,
      requestedDate: addDaysIso(today, 1),
      note: '',
    });
  });

  it('a technician accepts on another day, and marks a request done', async () => {
    openUrl('/stands?tab=requests&request=4');
    const api = mockApi({
      'GET /stands': board({ canManage: true, canRequest: false }),
      'GET /stands/requests': [
        request(),
        request({
          id: 6,
          status: 'accepted',
          scheduledDate: addDaysIso(today, 3),
          kind: 'uninstall',
          model: null,
        }),
      ],
      'POST /stands/requests/4/accept': request({ status: 'accepted' }),
      'POST /stands/requests/6/done': request({ id: 6, status: 'done' }),
    });
    const { user } = renderWithProviders(<StandsPage />, technician);
    const list = await screen.findByRole('list', { name: 'Stand requests' });
    const items = within(list).getAllByRole('listitem');
    expect(items[0]).toHaveAttribute('aria-current', 'true');
    expect(screen.queryByRole('button', { name: /Book a stand/ })).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Import' })).toBeInTheDocument();

    await user.click(within(items[0]!).getByRole('button', { name: 'Accept' }));
    const dialog = await screen.findByRole('dialog', { name: 'Accept request' });
    await user.type(within(dialog).getByLabelText('Note (optional)'), 'Morning');
    await user.click(within(dialog).getByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(api.find('POST', '/stands/requests/4/accept')).toHaveLength(1));
    expect(api.find('POST', '/stands/requests/4/accept')[0]!.body).toEqual({
      scheduledDate: addDaysIso(today, 2),
      technicianNote: 'Morning',
    });

    await user.click(within(items[1]!).getByRole('button', { name: 'Done' }));
    const done = await screen.findByRole('dialog', { name: 'Mark as done' });
    expect(done).toHaveTextContent('The stand will show as empty.');
    await user.click(within(done).getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(api.find('POST', '/stands/requests/6/done')).toHaveLength(1));
  });

  it('a technician must give a reason to reject', async () => {
    openUrl('/stands?tab=requests');
    const api = mockApi({
      'GET /stands': board({ canManage: true, canRequest: false }),
      'GET /stands/requests': [request()],
      'POST /stands/requests/4/reject': request({ status: 'rejected' }),
    });
    const { user } = renderWithProviders(<StandsPage />, technician);
    await user.click(await screen.findByRole('button', { name: 'Reject' }));
    const dialog = await screen.findByRole('dialog', { name: 'Reject request' });
    await user.click(within(dialog).getByRole('button', { name: 'Reject' }));
    expect(await within(dialog).findByText(/Say why/)).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Reason'), 'Stand under repair');
    await user.click(within(dialog).getByRole('button', { name: 'Reject' }));
    await waitFor(() =>
      expect(api.find('POST', '/stands/requests/4/reject')[0]?.body).toEqual({
        technicianNote: 'Stand under repair',
      }),
    );
  });

  it('the requester can cancel an open request', async () => {
    openUrl('/stands?tab=requests');
    const api = mockApi({
      'GET /stands': board(),
      'GET /stands/requests': [request()],
      'POST /stands/requests/4/cancel': request({ status: 'cancelled' }),
    });
    const { user } = renderWithProviders(<StandsPage />, tester);
    await user.click(await screen.findByRole('button', { name: 'Cancel request' }));
    await waitFor(() => expect(api.find('POST', '/stands/requests/4/cancel')).toHaveLength(1));
    expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument();
  });

  it('shows bookings on a four-week timeline', async () => {
    openUrl('/stands?tab=bookings');
    mockApi({ 'GET /stands': board(), 'GET /stands/bookings': [booking()] });
    renderWithProviders(<StandsPage />, tester);
    expect(
      await screen.findByRole('button', { name: /L1\/A-2 booked by ACS for ACU-60/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Later weeks' })).toBeInTheDocument();
  });

  it('a technician previews the stand sheet, then applies it', async () => {
    openUrl('/stands?tab=import');
    const result = (applied: boolean): StandImportResultDTO => ({
      rows: [
        {
          zone: 'Zone A',
          code: 'L1/A-1',
          model: 'ACU-35',
          inCharge: 'Ann',
          note: null,
          action: 'update',
        },
        {
          zone: 'Zone C',
          code: 'L1/C-1',
          model: 'IoT',
          inCharge: null,
          note: 'Request: Stay',
          action: 'create',
        },
      ],
      zonesCreated: 1,
      created: 1,
      updated: 1,
      unchanged: 0,
      applied,
      warnings: [],
    });
    let n = 0;
    const api = mockApi({
      'GET /stands': board({ canManage: true, canRequest: false }),
      'POST /stands/import': () => result(++n > 1),
    });
    const { user } = renderWithProviders(<StandsPage />, technician);
    const input = await screen.findByLabelText('Stand sheet (.xlsx)');
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'stands.xlsx')] },
    });
    expect(await screen.findByText('L1/C-1')).toBeInTheDocument();
    expect(screen.getByText(/1 new zones/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Apply 2 changes' }));
    await waitFor(() => expect(api.find('POST', '/stands/import')).toHaveLength(2));
  });

  it('switches the whole page to Thai', async () => {
    mockApi({ 'GET /stands': board() });
    const { user } = renderWithProviders(<StandsPage />, tester);
    await screen.findByRole('heading', { name: 'Zone A' });
    await user.click(screen.getByRole('radio', { name: 'ไทย' }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('สแตนด์ทดสอบ');
    expect(screen.getByRole('button', { name: /จอง stand/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'การจอง' })).toBeInTheDocument();
    const a1 = screen.getByRole('button', { name: 'Stand L1/A-1: ACU-25' });
    expect(a1).toHaveTextContent('ผู้รับผิดชอบ: Ann');
    expect(screen.getByRole('button', { name: 'Stand L1/A-2: ว่าง' })).toHaveTextContent(
      /ACU-60 ถึง \d+ /,
    );
    await user.click(screen.getByRole('radio', { name: 'English' }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Test stands');
  });

  it('books hours for someone else of the project', async () => {
    const api = mockApi({
      'GET /stands': board(),
      'GET /stands/bookings': [],
      'GET /stands/requests': [],
      'GET /projects/3/members': [
        { user: userRef(1, 'Alice Tester'), role: 'tester' },
        { user: userRef(7, 'Bob Lead'), role: 'lead' },
      ],
      'POST /stands/bookings': booking({ startTime: '13:00', endTime: '15:30' }),
    });
    const { user } = renderWithProviders(<StandsPage />, tester);
    await user.click(await screen.findByRole('button', { name: /Book a stand/ }));
    const form = await screen.findByRole('dialog', { name: 'Book a stand' });
    await user.click(within(form).getByRole('combobox', { name: 'Stand' }));
    await user.click(await screen.findByRole('option', { name: 'L1/A-1 (ACU-25)' }));
    await user.click(within(form).getByRole('combobox', { name: 'Who tests' }));
    await user.click(await screen.findByRole('option', { name: 'Bob Lead' }));
    await user.click(within(form).getByRole('radio', { name: 'Hours' }));
    expect(within(form).getByText('To')).toBeInTheDocument();
    fireEvent.change(within(form).getByLabelText('Start time'), { target: { value: '13:00' } });
    fireEvent.change(within(form).getByLabelText('End time'), { target: { value: '15:30' } });
    await user.type(within(form).getByLabelText('Model to test'), 'ACU-25');
    await user.click(within(form).getByRole('button', { name: 'Book' }));
    await waitFor(() => expect(api.find('POST', '/stands/bookings')).toHaveLength(1));
    expect(api.find('POST', '/stands/bookings')[0]!.body).toMatchObject({
      standId: 1,
      startDate: today,
      endDate: today,
      startTime: '13:00',
      endTime: '15:30',
      testerId: 7,
    });
  });

  it('shows who tests on the stand card', async () => {
    mockApi({ 'GET /stands': board() });
    renderWithProviders(<StandsPage />, tester);
    const a2 = await screen.findByRole('button', { name: 'Stand L1/A-2: empty' });
    expect(a2).toHaveTextContent('Testing: Alice Tester');
  });

  it('shows the unit history and brings a unit back with a request', async () => {
    openUrl('/stands?tab=history');
    const api = mockApi({
      'GET /stands': board(),
      'GET /stands/technicians': [userRef(9, 'Tina Tech')],
      'GET /stands/events': [
        {
          id: 1,
          standId: 3,
          standCode: 'L1/B-1',
          zoneName: 'Zone B',
          kind: 'uninstall',
          source: 'request',
          modelBefore: 'ACU-60',
          modelAfter: null,
          project: { id: 3, key: 'ACS' },
          requestId: 2,
          actor: userRef(9, 'Tina Tech'),
          note: 'Back to storage',
          at: '2026-06-01T03:00:00.000Z',
        },
      ],
      'GET /stands/bookings': [booking({ startDate: '2026-05-01', endDate: '2026-05-31' })],
    });
    const { user } = renderWithProviders(<StandsPage />, tester);
    const events = await screen.findByRole('table', { name: 'Installs and removals' });
    expect(events).toHaveTextContent('ACU-60 → Empty');
    expect(events).toHaveTextContent('Back to storage');
    const bookings = await screen.findByRole('table', { name: 'Bookings' });
    expect(bookings).toHaveTextContent('ACU-60');
    expect(bookings).toHaveTextContent('Alice Tester');
    await waitFor(() =>
      expect(api.find('GET', '/stands/bookings').at(-1)!.query.get('from')).toBe('2000-01-01'),
    );
    await user.click(screen.getByRole('button', { name: 'Request ACU-60 again' }));
    const form = await screen.findByRole('dialog', { name: 'Request a technician' });
    expect(within(form).getByLabelText('Model to install')).toHaveValue('ACU-60');
    expect(within(form).getByRole('combobox', { name: 'Stand' })).toHaveTextContent('L1/B-1');
  });

  it("sums up a technician's year and exports it", async () => {
    openUrl('/stands?tab=history');
    mockApi({
      'GET /stands': board({ canManage: true, canRequest: false }),
      'GET /stands/technicians': [userRef(9, 'Tina Tech')],
      'GET /stands/events': [],
      'GET /stands/bookings': [],
      'GET /stands/work': {
        technician: userRef(9, 'Tina Tech'),
        year: 2026,
        totals: { install: 3, uninstall: 1, replace: 2, rejected: 1, manual: 4 },
        months: Array.from({ length: 12 }, (_, i) => ({
          month: i + 1,
          install: i === 10 ? 3 : 0,
          uninstall: i === 10 ? 1 : 0,
          replace: i === 9 ? 2 : 0,
        })),
        requests: [request({ status: 'done', doneAt: '2026-11-10T03:00:00.000Z' })],
        events: [],
      },
    });
    const create = jest.fn(() => 'blob:x');
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: jest.fn() });
    const { user } = renderWithProviders(<StandsPage />, technician);
    await user.click(await screen.findByRole('radio', { name: 'Technician work' }));
    const totals = await screen.findByLabelText('Totals');
    expect(totals).toHaveTextContent('Install3');
    expect(totals).toHaveTextContent('Stand updates4');
    const months = screen.getByRole('table', { name: 'Done per month' });
    expect(within(months).getAllByRole('row')).toHaveLength(3);
    expect(screen.getByText('Install ACU-35')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Export CSV/ }));
    expect(create).toHaveBeenCalled();
  });
});

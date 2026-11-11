import { beforeEach, describe, expect, it } from '@jest/globals';
import { screen, waitFor, within } from '@testing-library/react';
import { makeProject, renderWithProviders } from '@/test/render';
import {
  apiError,
  followUrl,
  makeSuite,
  mockApi,
  openUrl,
  urlParams,
} from '@/features/cases/test-utils';
import { SuitesSettingsPage } from './suites-settings-page';

const unit = makeSuite({
  description: 'Unit operation workbook',
  fieldDefs: [{ key: 'test_id', label: 'Test ID', type: 'text', showInTable: true }],
  envTemplate: ['Indoor unit'],
});
const modbus = makeSuite({ id: 2, name: 'Modbus', prefix: 'MB', caseCount: 0 });
const old = makeSuite({ id: 3, name: 'Legacy', prefix: 'LG', isArchived: true });

function handlers(overrides: Record<string, unknown> = {}) {
  return { 'GET /projects/3/suites': [unit, modbus, old], ...overrides };
}

const lead = { project: makeProject() };

describe('SuitesSettingsPage', () => {
  beforeEach(() => openUrl('/projects/3/settings/suites'));

  it('lists the active suites and edits the first one', async () => {
    const api = mockApi(handlers());
    renderWithProviders(<SuitesSettingsPage />, lead);
    expect(await screen.findByLabelText('Name')).toHaveValue('Unit operation test');
    expect(screen.getByLabelText('ID prefix')).toHaveValue('UOT');
    expect(screen.getByLabelText('Description')).toHaveValue('Unit operation workbook');
    expect(screen.getAllByLabelText('Label')[0]).toHaveValue('Test ID');
    expect(screen.getByLabelText('Environment label 1')).toHaveValue('Indoor unit');
    expect(screen.getByText('All changes saved.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Unit operation test/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(screen.queryByRole('button', { name: /^Legacy/ })).not.toBeInTheDocument();
    expect(api.find('GET', '/projects/3/suites')[0]!.query.get('includeArchived')).toBe('true');
  });

  it('is read only for testers', async () => {
    mockApi(handlers());
    renderWithProviders(<SuitesSettingsPage />, { project: makeProject({ myRole: 'tester' }) });
    expect(await screen.findByLabelText('Name')).toHaveAttribute('readonly');
    expect(screen.getByText(/read only — leads can edit/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New suite' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save suite' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add field' })).not.toBeInTheDocument();
  });

  it('selects a suite through the URL and shows archived suites on request', async () => {
    openUrl('/projects/3/settings/suites?suite=2');
    mockApi(handlers());
    const { user, rerender } = renderWithProviders(<SuitesSettingsPage />, lead);
    expect(await screen.findByLabelText('Name')).toHaveValue('Modbus');
    expect(screen.getByText('No custom fields.', { exact: false })).toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: 'Show archived (1)' }));
    await user.click(screen.getByRole('button', { name: /^Legacy/ }));
    expect(urlParams()).toEqual({ suite: '3' });
    followUrl();
    rerender(<SuitesSettingsPage />);
    expect(await screen.findByRole('heading', { name: 'Legacy' })).toBeInTheDocument();
    expect(screen.getAllByText('Archived').length).toBeGreaterThan(0);
  });

  it('creates a suite with a suggested prefix and selects it', async () => {
    const api = mockApi(
      handlers({
        'POST /projects/3/suites': makeSuite({ id: 9, name: 'Modbus system test', prefix: 'MST' }),
      }),
    );
    const { user } = renderWithProviders(<SuitesSettingsPage />, lead);
    await user.click(await screen.findByRole('button', { name: 'New suite' }));
    const dialog = await screen.findByRole('dialog', { name: 'New suite' });
    await user.type(within(dialog).getByLabelText('Name'), 'Modbus system test');
    expect(within(dialog).getByLabelText('ID prefix')).toHaveValue('MST');
    await user.click(within(dialog).getByRole('button', { name: 'Create suite' }));
    await waitFor(() => expect(urlParams()).toEqual({ suite: '9' }));
    expect(api.find('POST', '/projects/3/suites')[0]!.body).toMatchObject({
      name: 'Modbus system test',
      prefix: 'MST',
      description: null,
    });
  });

  it('keeps an edited prefix and shows a taken prefix at the field', async () => {
    mockApi(handlers({ 'POST /projects/3/suites': () => apiError(409, 'SUITE_PREFIX_TAKEN') }));
    const { user } = renderWithProviders(<SuitesSettingsPage />, lead);
    await user.click(await screen.findByRole('button', { name: 'New suite' }));
    const dialog = await screen.findByRole('dialog', { name: 'New suite' });
    await user.type(within(dialog).getByLabelText('ID prefix'), 'uot');
    await user.type(within(dialog).getByLabelText('Name'), 'Another unit test');
    expect(within(dialog).getByLabelText('ID prefix')).toHaveValue('UOT');
    await user.click(within(dialog).getByRole('button', { name: 'Create suite' }));
    expect(
      await within(dialog).findByText('Another suite of this project uses this prefix'),
    ).toBeInTheDocument();
  });

  it('saves fields and environment labels', async () => {
    const api = mockApi(handlers({ 'PATCH /projects/3/suites/1': unit }));
    const { user } = renderWithProviders(<SuitesSettingsPage />, lead);
    const prefix = await screen.findByLabelText('ID prefix');
    await user.clear(prefix);
    await user.type(prefix, 'uo');
    await user.click(screen.getByRole('button', { name: 'Add field' }));
    const label = screen.getAllByLabelText('Label')[1]!;
    await user.type(label, 'Register (MB)');
    expect(screen.getAllByLabelText('Key')[1]).toHaveValue('register_mb');
    expect(screen.getAllByLabelText('Key')[0]).toHaveAttribute('readonly');
    await user.click(screen.getAllByRole('combobox', { name: 'Type' })[1]!);
    await user.click(await screen.findByRole('option', { name: 'Choice list' }));
    await user.type(screen.getByLabelText('Options'), '40001,40002{Enter}');
    await user.click(screen.getAllByRole('checkbox', { name: 'Show in table' })[1]!);
    await user.click(screen.getByRole('button', { name: 'Move Register (MB) up' }));
    await user.click(screen.getByRole('button', { name: 'Paste a list…' }));
    await user.type(screen.getByLabelText('One label per line'), 'FW version{Enter}indoor unit');
    await user.click(screen.getByRole('button', { name: 'Add labels' }));
    expect(screen.getByLabelText('Environment label 2')).toHaveValue('FW version');
    expect(screen.queryByLabelText('Environment label 3')).not.toBeInTheDocument();
    expect(screen.getByText('You have unsaved changes.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save suite' }));
    await waitFor(() => expect(screen.getByText('All changes saved.')).toBeInTheDocument());
    expect(api.find('PATCH', '/projects/3/suites/1')[0]!.body).toEqual({
      name: 'Unit operation test',
      prefix: 'UO',
      description: 'Unit operation workbook',
      fieldDefs: [
        {
          key: 'register_mb',
          label: 'Register (MB)',
          type: 'select',
          options: ['40001', '40002'],
          showInTable: true,
        },
        { key: 'test_id', label: 'Test ID', type: 'text', showInTable: true },
      ],
      envTemplate: ['Indoor unit', 'FW version'],
    });
  });

  it('validates rows before saving and discards changes', async () => {
    const api = mockApi(handlers());
    const { user } = renderWithProviders(<SuitesSettingsPage />, lead);
    await user.click(await screen.findByRole('button', { name: 'Add label' }));
    await user.type(screen.getByLabelText('Environment label 2'), 'indoor UNIT');
    await user.click(screen.getByRole('button', { name: 'Add field' }));
    await user.click(screen.getAllByRole('combobox', { name: 'Type' })[1]!);
    await user.click(await screen.findByRole('option', { name: 'Choice list' }));
    await user.click(screen.getByRole('button', { name: 'Save suite' }));
    expect(await screen.findByText('Duplicate label')).toBeInTheDocument();
    expect(screen.getByText('Add at least one option')).toBeInTheDocument();
    expect(screen.getByText('Environment labels must be unique')).toBeInTheDocument();
    expect(api.find('PATCH', '/projects/3/suites/1')).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Remove indoor UNIT' }));
    expect(screen.queryByText('Duplicate label')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.getAllByLabelText('Label')).toHaveLength(1);
    expect(screen.getByText('All changes saved.')).toBeInTheDocument();
  });

  it('asks before removing a saved field', async () => {
    const api = mockApi(handlers({ 'PATCH /projects/3/suites/1': { ...unit, fieldDefs: [] } }));
    const { user } = renderWithProviders(<SuitesSettingsPage />, lead);
    await user.click(await screen.findByRole('button', { name: 'Remove Test ID' }));
    await user.click(screen.getByRole('button', { name: 'Save suite' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Remove 1 field?' });
    expect(confirm).toHaveTextContent('Values of “Test ID” are deleted from all 2 cases');
    await user.click(within(confirm).getByRole('button', { name: 'Save and remove' }));
    await waitFor(() => expect(api.find('PATCH', '/projects/3/suites/1')).toHaveLength(1));
    expect(api.find('PATCH', '/projects/3/suites/1')[0]!.body).toMatchObject({ fieldDefs: [] });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  it('shows a taken prefix at the field', async () => {
    mockApi(handlers({ 'PATCH /projects/3/suites/1': () => apiError(409, 'SUITE_PREFIX_TAKEN') }));
    const { user } = renderWithProviders(<SuitesSettingsPage />, lead);
    await user.type(await screen.findByLabelText('ID prefix'), 'X');
    await user.click(screen.getByRole('button', { name: 'Save suite' }));
    expect(
      await screen.findByText('Another suite of this project uses this prefix'),
    ).toBeInTheDocument();
  });

  it('archives, exports and deletes a suite from the menu', async () => {
    const api = mockApi(
      handlers({
        'PATCH /projects/3/suites/1': { ...unit, isArchived: true },
        'DELETE /projects/3/suites/1': undefined,
        'GET /projects/3/suites/1/export.xlsx': () => apiError(500, 'BOOM'),
      }),
    );
    openUrl('/projects/3/settings/suites?suite=1');
    const { user } = renderWithProviders(<SuitesSettingsPage />, lead);
    await user.click(await screen.findByRole('button', { name: 'More suite actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Archive suite' }));
    await waitFor(() => expect(api.find('PATCH', '/projects/3/suites/1')).toHaveLength(1));
    expect(api.find('PATCH', '/projects/3/suites/1')[0]!.body).toEqual({ isArchived: true });

    await user.click(screen.getByRole('button', { name: 'More suite actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Export cases (.xlsx)' }));
    await waitFor(() =>
      expect(api.find('GET', '/projects/3/suites/1/export.xlsx')).toHaveLength(1),
    );

    await user.click(screen.getByRole('button', { name: 'More suite actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete suite' }));
    const confirm = await screen.findByRole('alertdialog', {
      name: 'Delete suite “Unit operation test”?',
    });
    expect(confirm).toHaveTextContent('Its 2 test cases and sections are deleted too.');
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(urlParams()).toEqual({}));
    expect(api.find('DELETE', '/projects/3/suites/1')).toHaveLength(1);
  });

  it('keeps a suite that runs still use', async () => {
    const api = mockApi(
      handlers({ 'DELETE /projects/3/suites/1': () => apiError(409, 'SUITE_IN_USE') }),
    );
    openUrl('/projects/3/settings/suites?suite=1');
    const { user } = renderWithProviders(<SuitesSettingsPage />, lead);
    await user.click(await screen.findByRole('button', { name: 'More suite actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete suite' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }),
    );
    await waitFor(() => expect(api.find('DELETE', '/projects/3/suites/1')).toHaveLength(1));
    expect(urlParams()).toEqual({ suite: '1' });
  });

  it('invites to create the first suite', async () => {
    mockApi(handlers({ 'GET /projects/3/suites': [] }));
    renderWithProviders(<SuitesSettingsPage />, lead);
    expect(await screen.findByText('No suites yet')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'New suite' })).toHaveLength(2);
  });
});

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { TemplateCheckDTO } from '@tmt/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { makeProject, renderWithProviders } from '@/test/render';
import { apiError, makeSuite, mockApi, userRef } from '../cases/test-utils';
import { makeTemplate } from '../plans/test-fixtures';
import { TemplatesPage } from './templates-page';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const builtIn = makeTemplate({ id: 0, builtIn: true, isDefault: true });
const custom = makeTemplate({
  id: 4,
  builtIn: false,
  name: 'Controlled form rev. B',
  description: 'TEAM-F-012 rev. B',
  fileName: 'team-f-012.xlsx',
  suiteId: 1,
  runSheet: 'RUN',
  createdBy: userRef(1, 'Alice Tester'),
  createdAt: '2026-10-21T00:00:00.000Z',
});

const placeholders = {
  workbook: ['${plan.docNo}', '${plan.title}'],
  runs: ['${table:runs.code}'],
  run: ['${run.code}', '${env.unit_model}'],
  cases: ['${table:cases.title}'],
};

const check = (overrides: Partial<TemplateCheckDTO> = {}): TemplateCheckDTO => ({
  placeholders: ['plan.docNo', 'table:cases.title', 'plan.docno'],
  unknown: ['plan.docno'],
  sheets: ['Summary', 'Cases'],
  runSheetFound: false,
  ...overrides,
});

function renderPage(overrides: Record<string, unknown> = {}, role: 'lead' | 'viewer' = 'lead') {
  const api = mockApi({
    'GET /projects/3/templates': [builtIn, custom],
    'GET /projects/3/suites': [
      makeSuite({
        id: 1,
        name: 'Unit operation test',
        envTemplate: ['Unit model'],
      }),
    ],
    'GET /projects/3/templates/placeholders': placeholders,
    'GET /projects/3/templates/4/check': check(),
    'GET /projects/3/templates/0/check': check({
      placeholders: ['plan.docNo'],
      unknown: [],
      sheets: ['Report'],
      runSheetFound: true,
    }),
    ...overrides,
  });
  const view = renderWithProviders(<TemplatesPage />, {
    project: makeProject({ myRole: role }),
  });
  return { ...view, api };
}

const rowOf = async (name: string) => (await screen.findByText(name)).closest('tr')!;

describe('TemplatesPage', () => {
  it('lists the templates and the placeholder reference', async () => {
    const { user } = renderPage();
    const builtInRow = await rowOf('Built-in test report');
    expect(within(builtInRow).getByText('Default')).toBeInTheDocument();
    expect(within(builtInRow).getByText('Built-in')).toBeInTheDocument();
    expect(within(builtInRow).getByText('Ships with TMT')).toBeInTheDocument();
    expect(within(builtInRow).getByText('All suites')).toBeInTheDocument();
    const customRow = await rowOf('Controlled form rev. B');
    expect(within(customRow).getByText('Unit operation test')).toBeInTheDocument();
    expect(within(customRow).getByText('RUN')).toBeInTheDocument();
    expect(within(customRow).getByText('by Alice Tester')).toBeInTheDocument();

    expect(await screen.findByRole('button', { name: 'Copy ${plan.docNo}' })).toBeInTheDocument();
    expect(screen.getByText('Document number of the test plan')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /Run sheet/ }));
    expect(await screen.findByText('Environment “Unit model”')).toBeInTheDocument();
  });

  it('checks a template: missing run sheet and a misspelt placeholder', async () => {
    const { user } = renderPage();
    await user.click(await screen.findByRole('button', { name: 'Check Controlled form rev. B' }));
    const dialog = await screen.findByRole('dialog', { name: 'Check · Controlled form rev. B' });
    expect(await within(dialog).findByText('Run sheet “RUN” is missing')).toBeInTheDocument();
    expect(within(dialog).getByText('1 unknown placeholder')).toBeInTheDocument();
    expect(within(dialog).getByText('2 known · 1 unknown')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Copy ${plan.docno}' })).toBeInTheDocument();
    // The suggestion next to the typo, and the known placeholder in the Workbook group.
    expect(
      await within(dialog).findAllByRole('button', { name: 'Copy ${plan.docNo}' }),
    ).toHaveLength(2);
    expect(within(dialog).getByText('Did you mean')).toBeInTheDocument();
    expect(within(dialog).getByText('Title / test item')).toBeInTheDocument();
  });

  it('confirms a working template', async () => {
    const { user } = renderPage();
    await user.click(await screen.findByRole('button', { name: 'Check Built-in test report' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Ready to use')).toBeInTheDocument();
    expect(
      within(dialog).getByText('All 1 placeholder are known. This template has no per-run sheet.'),
    ).toBeInTheDocument();
  });

  it('uploads a template and opens its check', async () => {
    const created = makeTemplate({ id: 9, builtIn: false, name: 'Report form', runSheet: 'RUN' });
    const { user } = renderPage({
      'POST /projects/3/templates': created,
      'GET /projects/3/templates/9/check': check({ unknown: [], runSheetFound: true }),
    });
    await user.click(await screen.findByRole('button', { name: 'Upload template' }));
    const dialog = await screen.findByRole('dialog', { name: 'Upload report template' });
    await user.click(within(dialog).getByRole('button', { name: /Upload and check/ }));
    expect(await within(dialog).findByText('Required')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Name'), 'x');
    await user.click(within(dialog).getByRole('button', { name: /Upload and check/ }));
    expect(
      await within(dialog).findByText('Choose the .xlsx workbook of the form'),
    ).toBeInTheDocument();
    await user.clear(within(dialog).getByLabelText('Name'));

    await user.upload(
      within(dialog).getByLabelText('Template workbook file'),
      new File(['xlsx'], 'Report form.xlsx', { type: XLSX }),
    );
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Report form');
    await user.type(within(dialog).getByLabelText('Run sheet'), 'RUN');
    await user.click(within(dialog).getByRole('switch', { name: /default template/ }));
    await user.click(within(dialog).getByRole('button', { name: /Upload and check/ }));

    expect(await screen.findByRole('dialog', { name: 'Check · Report form' })).toBeInTheDocument();
    const post = jest
      .mocked(globalThis.fetch)
      .mock.calls.find(([, init]) => init?.method === 'POST')!;
    expect(post[0]).toBe('/api/v1/projects/3/templates');
    const body = post[1]!.body as FormData;
    expect(body.get('name')).toBe('Report form');
    expect(body.get('runSheet')).toBe('RUN');
    expect(body.get('isDefault')).toBe('true');
    expect(body.get('suiteId')).toBeNull();
    expect((body.get('file') as File).name).toBe('Report form.xlsx');
  });

  it('shows a refused workbook next to the drop zone', async () => {
    const { user } = renderPage({
      'POST /projects/3/templates': apiError(422, 'BAD_TEMPLATE_FILE', 'Not a valid workbook'),
    });
    await user.click(await screen.findByRole('button', { name: 'Upload template' }));
    const dialog = await screen.findByRole('dialog');
    await user.upload(
      within(dialog).getByLabelText('Template workbook file'),
      new File(['x'], 'broken.xlsx', { type: XLSX }),
    );
    await user.click(within(dialog).getByRole('button', { name: /Upload and check/ }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Not a valid workbook');
  });

  it('edits the details of a template', async () => {
    const { user, api } = renderPage({
      'PATCH /projects/3/templates/4': { ...custom, name: 'Form rev. C' },
    });
    await user.click(
      await screen.findByRole('button', { name: 'More actions for Controlled form rev. B' }),
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Edit details' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit template' });
    const runSheet = within(dialog).getByLabelText('Run sheet');
    expect(runSheet).toHaveValue('RUN');
    // The sheets of the workbook come from the check.
    expect(
      await within(dialog).findByText(/Sheets in this workbook: Summary, Cases/),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Save template' }));
    expect(
      await within(dialog).findByText('The workbook has no sheet with this name'),
    ).toBeInTheDocument();
    await user.clear(runSheet);
    await user.type(runSheet, 'cases');
    const name = within(dialog).getByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'Form rev. C');
    await user.click(within(dialog).getByRole('button', { name: 'Save template' }));
    await waitFor(() => expect(api.find('PATCH', '/projects/3/templates/4')).toHaveLength(1));
    expect(api.find('PATCH', '/projects/3/templates/4')[0]!.body).toEqual({
      name: 'Form rev. C',
      description: 'TEAM-F-012 rev. B',
      suiteId: 1,
      runSheet: 'cases',
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('changes the default template', async () => {
    const { user, api } = renderPage({
      'GET /projects/3/templates': [
        makeTemplate({ id: 0, builtIn: true, isDefault: false }),
        { ...custom, isDefault: true },
      ],
      'PATCH /projects/3/templates/4': custom,
    });
    await user.click(
      await screen.findByRole('button', { name: 'More actions for Built-in test report' }),
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Set as default' }));
    await waitFor(() => expect(api.find('PATCH', '/projects/3/templates/4')).toHaveLength(1));
    expect(api.find('PATCH', '/projects/3/templates/4')[0]!.body).toEqual({ isDefault: false });
  });

  it('makes an uploaded template the default and deletes it after a confirmation', async () => {
    const { user, api } = renderPage({
      'PATCH /projects/3/templates/4': custom,
      'DELETE /projects/3/templates/4': undefined,
    });
    const more = await screen.findByRole('button', {
      name: 'More actions for Controlled form rev. B',
    });
    await user.click(more);
    await user.click(await screen.findByRole('menuitem', { name: 'Set as default' }));
    await waitFor(() => expect(api.find('PATCH', '/projects/3/templates/4')).toHaveLength(1));
    expect(api.find('PATCH', '/projects/3/templates/4')[0]!.body).toEqual({ isDefault: true });

    await user.click(more);
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    const confirm = await screen.findByRole('alertdialog');
    expect(confirm).toHaveTextContent('Delete template “Controlled form rev. B”?');
    expect(confirm).toHaveTextContent('Plans that use it export with the default template');
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(api.find('DELETE', '/projects/3/templates/4')).toHaveLength(1));
  });

  describe('download', () => {
    const url = URL as unknown as Record<string, unknown>;
    const saved = { create: url.createObjectURL, revoke: url.revokeObjectURL };
    beforeEach(() => {
      url.createObjectURL = jest.fn(() => 'blob:template');
      url.revokeObjectURL = jest.fn();
    });
    afterEach(() => {
      url.createObjectURL = saved.create;
      url.revokeObjectURL = saved.revoke;
    });

    it('downloads the workbook of a template', async () => {
      const { user, api } = renderPage({
        'GET /projects/3/templates/0/download': () =>
          new Response('xlsx', { headers: { 'content-type': XLSX } }),
      });
      await user.click(
        await screen.findByRole('button', { name: 'Download Built-in test report' }),
      );
      await waitFor(() =>
        expect(api.find('GET', '/projects/3/templates/0/download')).toHaveLength(1),
      );
      expect(url.createObjectURL).toHaveBeenCalled();
    });
  });

  it('is read only for viewers', async () => {
    renderPage({}, 'viewer');
    await rowOf('Controlled form rev. B');
    expect(screen.queryByRole('button', { name: 'Upload template' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /More actions/ })).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Check Controlled form rev. B' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/read only — leads can upload and edit/)).toBeInTheDocument();
  });
});

import { describe, expect, it } from '@jest/globals';
import type {
  ImportAnalysisDTO,
  ImportPreviewDTO,
  ImportRecordDTO,
  ImportResultDTO,
} from '@tmt/shared';
import { act, screen, waitFor, within } from '@testing-library/react';
import { makeProject, renderWithProviders } from '@/test/render';
import { setNavigation } from '@/test/mocks/next-navigation';
import { apiError, makeSuite, makeTree, mockApi, type ApiCall } from '../cases/test-utils';
import { installFakeXhr } from '../runs/test-fixtures';
import { ImportPage } from './import-page';

const UPLOAD_ID = '6f1c1d4e-2b1a-4c3d-9e8f-0a1b2c3d4e5f';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const suite = makeSuite({
  id: 1,
  name: 'Unit operation test',
  prefix: 'UOT',
  fieldDefs: [{ key: 'test_id', label: 'Test ID', type: 'text', showInTable: false }],
});

const analysis = (overrides: Partial<ImportAnalysisDTO> = {}): ImportAnalysisDTO => ({
  uploadId: UPLOAD_ID,
  fileName: 'UOP_cases.xlsx',
  sheets: [
    { name: 'Cases', state: 'visible', rowCount: 40, columnCount: 5 },
    { name: 'Old', state: 'hidden', rowCount: 3, columnCount: 2 },
  ],
  sheet: 'Cases',
  headerRow: 2,
  headerCandidates: [2, 3],
  layout: 'unit_operation',
  columns: [
    {
      col: 1,
      letter: 'A',
      header: 'No.',
      span: 1,
      samples: ['1-1'],
      suggested: { target: 'code' },
    },
    {
      col: 2,
      letter: 'B',
      header: 'Test item',
      span: 1,
      samples: ['Power on', 'Power off'],
      suggested: { target: 'title' },
    },
    {
      col: 3,
      letter: 'C',
      header: 'Result',
      span: 1,
      samples: [],
      suggested: { target: 'ignore' },
    },
    {
      col: 4,
      letter: 'D',
      header: 'Procedure',
      span: 2,
      samples: ['Press ON'],
      suggested: { target: 'procedure' },
    },
  ],
  envBlock: { labels: ['Unit model', 'FW version'], columns: [['ACU', '2.4.0']] },
  dataRowCount: 38,
  ...overrides,
});

const preview: ImportPreviewDTO = {
  counts: { cases: 2, create: 1, update: 1, skip: 0, sections: 1, newSections: 1, newFields: 0 },
  newFields: [],
  warnings: [
    { kind: 'section_filled_down', message: 'Section names filled down', count: 2, rows: [4, 5] },
    { kind: 'type_defaulted', message: 'Empty type set to Normal', count: 1, rows: [7] },
  ],
  sample: [
    {
      row: 3,
      sectionPath: ['Power'],
      code: '1-1',
      title: 'Power on',
      caseType: 'Normal',
      priority: 'high',
      tags: ['smoke'],
      estimateMinutes: 90,
      references: 'REQ-1',
      precondition: null,
      procedure: 'Press ON',
      expected: 'Unit starts',
      remark: null,
      summaryGroup: null,
      custom: {},
      action: 'create',
    },
  ],
};

const result: ImportResultDTO = {
  importId: 4,
  suiteId: 1,
  created: 1,
  updated: 1,
  skipped: 0,
  sectionsCreated: 1,
  fieldsCreated: 0,
  warnings: [],
};

const record: ImportRecordDTO = {
  id: 4,
  kind: 'cases',
  suite: { id: 1, name: 'Unit operation test' },
  run: null,
  fileName: 'old-cases.xlsx',
  sheet: 'Cases',
  layout: 'unit_operation',
  stats: { created: 12 },
  createdBy: { id: 1, username: 'alice', displayName: 'Alice Tester' },
  createdAt: '2026-11-01T00:00:00.000Z',
};

const uploaded = { uploadId: UPLOAD_ID, fileName: 'UOP_cases.xlsx', sheets: analysis().sheets };
const xlsx = (name = 'UOP_cases.xlsx') => new File(['x'], name, { type: XLSX });

function handlers(overrides: Record<string, unknown> = {}) {
  return {
    'GET /projects/3/suites': [suite],
    'GET /projects/3/imports': [record],
    'GET /projects/3/suites/1/sections': makeTree(),
    // Like the server: the requested sheet and header row come back.
    'POST /projects/3/imports/analyze': ({ body }: ApiCall) => {
      const b = body as { sheet?: string; headerRow?: number };
      return analysis({ sheet: b.sheet ?? 'Cases', headerRow: b.headerRow ?? 2 });
    },
    'POST /projects/3/imports/preview': preview,
    'POST /projects/3/imports/commit': result,
    ...overrides,
  };
}

/** Renders the wizard and uploads a workbook (the fake XHR answers the upload). */
async function startImport(overrides: Record<string, unknown> = {}, project = makeProject()) {
  const api = mockApi(handlers(overrides));
  const uploads = installFakeXhr(() => ({ status: 200, json: uploaded }));
  const view = renderWithProviders(<ImportPage />, { project });
  // The suites must be known before the upload picks the default target.
  await screen.findByText('old-cases.xlsx');
  await waitFor(() => expect(api.find('GET', '/projects/3/suites')).toHaveLength(1));
  await view.user.upload(screen.getByLabelText('Workbook to import'), xlsx());
  return { ...view, api, uploads };
}

describe('ImportPage', () => {
  it('walks through upload, mapping, options, preview and import', async () => {
    const { user, api, uploads } = await startImport();

    expect(await screen.findByText('Layout recognised: Unit operation test.')).toBeInTheDocument();
    expect(uploads[0]!.url).toBe('/api/v1/projects/3/imports/upload');
    expect((uploads[0]!.body.get('file') as File).name).toBe('UOP_cases.xlsx');
    expect(api.find('POST', '/projects/3/imports/analyze')[0]!.body).toEqual({
      uploadId: UPLOAD_ID,
      suiteId: 1,
    });
    expect(screen.getByRole('combobox', { name: 'Suite' })).toHaveTextContent(
      'Unit operation test (UOT)',
    );
    expect(screen.getByText('2 sheets (1 hidden)', { exact: false })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Next: map columns/ }));
    expect(screen.getByText('Column mapping')).toBeInTheDocument();
    expect(screen.getByText('3 of 4 columns imported')).toBeInTheDocument();
    expect(screen.getByText('D–E')).toBeInTheDocument();
    await user.click(screen.getByRole('combobox', { name: 'Import column D–E Procedure as' }));
    await user.click(await screen.findByRole('option', { name: 'Test ID' }));
    expect(
      screen.getByRole('combobox', { name: 'Import column D–E Procedure as' }),
    ).toHaveTextContent('Test ID');

    await user.click(screen.getByRole('button', { name: /Next: options/ }));
    await user.click(screen.getByRole('radio', { name: 'Skip the row, keep the existing case' }));
    expect(
      screen.getByRole('checkbox', {
        name: 'Save the 2 environment labels as the suite’s environment template',
      }),
    ).toBeChecked();

    await user.click(screen.getByRole('button', { name: /Preview import/ }));
    expect(
      await screen.findByText('Check before import · Unit operation test'),
    ).toBeInTheDocument();
    const body = {
      uploadId: UPLOAD_ID,
      sheet: 'Cases',
      headerRow: 2,
      columns: [
        { col: 1, target: 'code' },
        { col: 2, target: 'title' },
        { col: 4, target: 'custom', customKey: 'test_id' },
      ],
      options: {
        onDuplicateInFile: 'renumber',
        onExisting: 'skip',
        saveEnvTemplate: true,
        parentSectionId: null,
      },
      suiteId: 1,
    };
    expect(api.find('POST', '/projects/3/imports/preview')[0]!.body).toEqual(body);
    expect(screen.getByText('Section names filled down')).toBeInTheDocument();
    expect(screen.getByText('rows 4, 5')).toBeInTheDocument();
    expect(screen.getByText('1h 30m · REQ-1')).toBeInTheDocument();
    expect(screen.getByText('New')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Import 2 test cases/ }));
    expect(await screen.findByText('Import finished')).toBeInTheDocument();
    expect(api.find('POST', '/projects/3/imports/commit')[0]!.body).toEqual(body);
    expect(screen.getByRole('link', { name: /Open the suite/ })).toHaveAttribute(
      'href',
      '/projects/3/cases?suite=1',
    );
    await user.click(screen.getByRole('button', { name: /Import another file/ }));
    expect(screen.getByLabelText('Workbook to import')).toBeInTheDocument();
  });

  it('re-analyses another sheet or header row and goes back with the stepper', async () => {
    const { user, api } = await startImport();
    await screen.findByText('Layout recognised: Unit operation test.');

    await user.click(screen.getByRole('radio', { name: 'Row 3' }));
    await waitFor(() => expect(api.find('POST', '/projects/3/imports/analyze')).toHaveLength(2));
    expect(api.find('POST', '/projects/3/imports/analyze')[1]!.body).toEqual({
      uploadId: UPLOAD_ID,
      sheet: 'Cases',
      headerRow: 3,
      suiteId: 1,
    });

    const headerRow = screen.getByLabelText('Header row');
    await user.clear(headerRow);
    await user.type(headerRow, '5{Enter}');
    await waitFor(() => expect(api.find('POST', '/projects/3/imports/analyze')).toHaveLength(3));
    expect(api.find('POST', '/projects/3/imports/analyze')[2]!.body).toMatchObject({
      headerRow: 5,
    });

    await user.click(screen.getByRole('combobox', { name: 'Sheet' }));
    await user.click(await screen.findByRole('option', { name: /Old \(hidden\)/ }));
    await waitFor(() => expect(api.find('POST', '/projects/3/imports/analyze')).toHaveLength(4));
    expect(api.find('POST', '/projects/3/imports/analyze')[3]!.body).toEqual({
      uploadId: UPLOAD_ID,
      sheet: 'Old',
      suiteId: 1,
    });

    await user.click(screen.getByRole('button', { name: /Next: map columns/ }));
    await user.click(screen.getByRole('button', { name: /Next: options/ }));
    await user.click(screen.getByRole('button', { name: /Sheet & suite/ }));
    expect(screen.getByText('Import into')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Start over/ }));
    expect(screen.getByLabelText('Workbook to import')).toBeInTheDocument();
  });

  it('blocks the mapping without a title or case code', async () => {
    const { user } = await startImport();
    await screen.findByText('Layout recognised: Unit operation test.');
    await user.click(screen.getByRole('button', { name: /Next: map columns/ }));
    for (const name of ['Import column A No. as', 'Import column B Test item as']) {
      await user.click(screen.getByRole('combobox', { name }));
      await user.click(await screen.findByRole('option', { name: 'Do not import' }));
    }
    await user.click(screen.getByRole('button', { name: /Next: options/ }));
    expect(
      screen.getByText('Import at least one column as Title or Case code.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Column mapping')).toBeInTheDocument();
  });

  it('creates a new suite named after the file and handles a taken prefix', async () => {
    const { user, api } = await startImport({
      'GET /projects/3/suites': [],
      'POST /projects/3/imports/preview': apiError(409, 'SUITE_PREFIX_TAKEN', 'Prefix in use'),
    });
    await screen.findByText('Layout recognised: Unit operation test.');
    expect(api.find('POST', '/projects/3/imports/analyze')[0]!.body).toEqual({
      uploadId: UPLOAD_ID,
    });
    expect(screen.getByLabelText('Suite name')).toHaveValue('UOP cases');
    expect(screen.getByLabelText('ID prefix')).toHaveValue('UC');

    await user.clear(screen.getByLabelText('Suite name'));
    await user.click(screen.getByRole('button', { name: /Next: map columns/ }));
    expect(screen.getByText('Required')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Suite name'), 'Unit ops');
    expect(screen.getByLabelText('ID prefix')).toHaveValue('UO');

    await user.click(screen.getByRole('button', { name: /Next: map columns/ }));
    await user.click(screen.getByRole('button', { name: /Next: options/ }));
    expect(screen.getByRole('radio', { name: /Update the existing case/ })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /Preview import/ }));
    expect(await screen.findByText('Prefix in use')).toBeInTheDocument();
    expect(screen.getByLabelText('ID prefix')).toHaveAttribute('aria-invalid', 'true');
    expect(api.find('POST', '/projects/3/imports/preview')[0]!.body).toMatchObject({
      newSuite: { name: 'Unit ops', prefix: 'UO' },
      options: { parentSectionId: null },
    });
  });

  it('asks to upload again when the upload expired', async () => {
    const { user } = await startImport({
      'POST /projects/3/imports/preview': apiError(404, 'UPLOAD_NOT_FOUND', 'Upload expired'),
    });
    await screen.findByText('Layout recognised: Unit operation test.');
    await user.click(screen.getByRole('button', { name: /Next: map columns/ }));
    await user.click(screen.getByRole('button', { name: /Next: options/ }));
    await user.click(screen.getByRole('button', { name: /Preview import/ }));
    expect(await screen.findByText('The uploaded file expired')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Upload again' }));
    expect(screen.getByLabelText('Workbook to import')).toBeInTheDocument();
    expect(screen.queryByText('The uploaded file expired')).not.toBeInTheDocument();
  });

  it('shows a section problem next to the section option', async () => {
    const { user } = await startImport({
      'POST /projects/3/imports/preview': apiError(422, 'BAD_SECTION', 'Section was deleted'),
    });
    await screen.findByText('Layout recognised: Unit operation test.');
    await user.click(screen.getByRole('button', { name: /Next: map columns/ }));
    await user.click(screen.getByRole('button', { name: /Next: options/ }));
    await user.click(screen.getByRole('button', { name: /Preview import/ }));
    expect(await screen.findByText('Section was deleted')).toBeInTheDocument();
    expect(screen.getByText('Put the imported cases under')).toBeInTheDocument();
  });

  it('explains a workbook the server cannot read', async () => {
    mockApi(handlers());
    const uploads = installFakeXhr();
    const { user } = renderWithProviders(<ImportPage />, { project: makeProject() });
    await screen.findByText('old-cases.xlsx');
    await user.upload(screen.getByLabelText('Workbook to import'), xlsx('broken.xlsx'));
    await waitFor(() => expect(uploads).toHaveLength(1));
    act(() => uploads[0]!.progress(0.5));
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Upload progress' })).toBeInTheDocument();
    await act(async () =>
      uploads[0]!.respond(422, { error: { code: 'CORRUPT_FILE', message: 'Not a workbook' } }),
    );
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The file could not be read');
    expect(alert).toHaveTextContent('Not a workbook');
  });

  it('refuses old .xls workbooks before uploading', async () => {
    mockApi(handlers());
    const uploads = installFakeXhr();
    const { user } = renderWithProviders(<ImportPage />, { project: makeProject() });
    await screen.findByText('old-cases.xlsx');
    await user.upload(
      screen.getByLabelText('Workbook to import'),
      new File(['x'], 'old.xls', { type: 'application/vnd.ms-excel' }),
    );
    expect(await screen.findByText(/old .xls workbooks cannot be imported/)).toBeInTheDocument();
    expect(uploads).toHaveLength(0);
  });

  it('only lists earlier imports for viewers', async () => {
    setNavigation({ search: '?suite=1' });
    mockApi(handlers());
    renderWithProviders(<ImportPage />, { project: makeProject({ myRole: 'viewer' }) });
    expect(await screen.findByText('Importing needs the tester role')).toBeInTheDocument();
    const row = (await screen.findByText('old-cases.xlsx')).closest('tr')!;
    expect(within(row).getByText('12 created')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: 'Unit operation test' })).toHaveAttribute(
      'href',
      '/projects/3/cases?suite=1',
    );
    expect(screen.getByRole('link', { name: 'Test cases' })).toHaveAttribute(
      'href',
      '/projects/3/cases?suite=1',
    );
    expect(screen.queryByLabelText('Workbook to import')).not.toBeInTheDocument();
  });
});

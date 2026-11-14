import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type {
  RequirementImportAnalysisDTO,
  RequirementImportPreviewDTO,
  RequirementImportResultDTO,
} from '@tmt/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { toast } from 'sonner';
import { makeProject, renderWithProviders } from '@/test/render';
import { apiError, mockApi, openUrl } from '../cases/test-utils';
import { installFakeXhr } from '../runs/test-fixtures';
import { ImportRequirementsDialog } from './import-dialog';

const UPLOAD_ID = 'up-1';

const analysis = (
  over: Partial<RequirementImportAnalysisDTO> = {},
): RequirementImportAnalysisDTO => ({
  uploadId: UPLOAD_ID,
  fileName: 'requirements.xlsx',
  sheets: [
    { name: 'Spec', rowCount: 12 },
    { name: 'Old', rowCount: 3 },
  ] as RequirementImportAnalysisDTO['sheets'],
  sheet: 'Spec',
  headerRow: 1,
  headerCandidates: [1],
  dataRowCount: 11,
  columns: [
    { col: 0, letter: 'A', header: 'Req ID', samples: ['REQ-1'], suggested: 'key' },
    { col: 1, letter: 'B', header: 'Requirement', samples: ['Power on'], suggested: 'title' },
    { col: 2, letter: 'C', header: 'Detail', samples: ['…'], suggested: null },
  ],
  ...over,
});

const preview = (over: Partial<RequirementImportPreviewDTO> = {}): RequirementImportPreviewDTO => ({
  create: 2,
  update: 1,
  skip: 0,
  invalid: 1,
  truncated: false,
  rows: [
    { row: 2, key: 'REQ-1', title: 'Power on', action: 'create', reason: null },
    { row: 3, key: 'REQ-2', title: 'Power off', action: 'update', reason: null },
    { row: 4, key: '', title: 'No id', action: 'invalid', reason: 'ID is empty' },
  ],
  ...over,
});

const xlsx = () =>
  new File(['x'], 'requirements.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

async function start(handlers: Record<string, unknown> = {}, onClose = jest.fn()) {
  const api = mockApi({
    'POST /projects/3/requirements/import/analyze': analysis(),
    'POST /projects/3/requirements/import/preview': preview(),
    'POST /projects/3/requirements/import/commit': {
      created: 2,
      updated: 1,
      skipped: 0,
      invalid: 1,
    } satisfies RequirementImportResultDTO,
    ...handlers,
  });
  const uploads = installFakeXhr(() => ({
    status: 200,
    json: { uploadId: UPLOAD_ID, fileName: 'requirements.xlsx', sheets: [] },
  }));
  const view = renderWithProviders(<ImportRequirementsDialog onClose={onClose} />, {
    project: makeProject({ myRole: 'tester' }),
  });
  await view.user.upload(screen.getByLabelText('Workbook to import'), xlsx());
  return { ...view, api, uploads, onClose };
}

describe('ImportRequirementsDialog', () => {
  beforeEach(() => openUrl('/projects/3/requirements'));
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uploads, guesses the columns, previews and imports', async () => {
    const success = jest.spyOn(toast, 'success');
    const { user, api, uploads, onClose } = await start();
    expect(await screen.findByText('requirements.xlsx')).toBeInTheDocument();
    expect(uploads[0]!.url).toBe('/api/v1/projects/3/imports/upload');
    expect(api.find('POST', '/projects/3/requirements/import/analyze')[0]!.body).toEqual({
      uploadId: UPLOAD_ID,
    });
    // ID and title come from the header guesses; the import waits for a preview.
    expect(screen.getByRole('combobox', { name: 'Requirement ID *' })).toHaveTextContent(
      'A · Req ID',
    );
    expect(screen.getByRole('combobox', { name: 'Title *' })).toHaveTextContent('B · Requirement');
    expect(screen.getByRole('button', { name: 'Import' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Preview' }));
    const region = await screen.findByRole('region', { name: 'Import preview' });
    expect(region).toHaveTextContent('2 new · 1 updated · 0 skipped · 1 invalid');
    expect(within(region).getByText(/ID is empty/)).toBeInTheDocument();
    expect(api.find('POST', '/projects/3/requirements/import/preview')[0]!.body).toEqual({
      uploadId: UPLOAD_ID,
      sheet: 'Spec',
      headerRow: 1,
      mapping: { key: 0, title: 1, description: null, sourceRef: null },
      onExisting: 'update',
    });

    await user.click(screen.getByRole('button', { name: 'Import' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(api.find('POST', '/projects/3/requirements/import/commit')[0]!.body).toMatchObject({
      mapping: { key: 0, title: 1 },
    });
    expect(success).toHaveBeenCalledWith(
      'Requirements imported',
      expect.objectContaining({ description: '2 new, 1 updated, 0 skipped, 1 invalid.' }),
    );
  });

  it('maps an extra column and leaves existing IDs alone, dropping the stale preview', async () => {
    const { user, api } = await start();
    await screen.findByText('requirements.xlsx');
    await user.click(screen.getByRole('button', { name: 'Preview' }));
    await screen.findByRole('region', { name: 'Import preview' });

    await user.click(screen.getByRole('combobox', { name: 'Description' }));
    await user.click(await screen.findByRole('option', { name: /C · Detail/ }));
    // Changing the mapping throws the old preview away.
    expect(screen.queryByRole('region', { name: 'Import preview' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import' })).toBeDisabled();

    await user.click(screen.getByRole('radio', { name: 'Leave it' }));
    await user.click(screen.getByRole('button', { name: 'Preview' }));
    await screen.findByRole('region', { name: 'Import preview' });
    expect(api.find('POST', '/projects/3/requirements/import/preview').at(-1)!.body).toMatchObject({
      mapping: { key: 0, title: 1, description: 2, sourceRef: null },
      onExisting: 'skip',
    });
  });

  it('asks for the ID and title columns when no header looks like them', async () => {
    const { user } = await start({
      'POST /projects/3/requirements/import/analyze': analysis({
        columns: [{ col: 0, letter: 'A', header: 'Notes', samples: [], suggested: null }],
      }),
    });
    expect(
      await screen.findByText('Choose a column for Requirement ID and Title.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Preview' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Preview' }));
  });

  it('reads another sheet and another header row', async () => {
    const { user, api } = await start();
    await screen.findByText('requirements.xlsx');
    await user.click(screen.getByRole('combobox', { name: 'Sheet' }));
    await user.click(await screen.findByRole('option', { name: /Old/ }));
    await waitFor(() =>
      expect(api.find('POST', '/projects/3/requirements/import/analyze')).toHaveLength(2),
    );
    expect(api.find('POST', '/projects/3/requirements/import/analyze')[1]!.body).toEqual({
      uploadId: UPLOAD_ID,
      sheet: 'Old',
    });
    const header = screen.getByLabelText('Header row');
    await user.clear(header);
    await user.type(header, '3{Enter}');
    await waitFor(() =>
      expect(api.find('POST', '/projects/3/requirements/import/analyze').at(-1)!.body).toEqual({
        uploadId: UPLOAD_ID,
        sheet: 'Spec',
        headerRow: 3,
      }),
    );
    // Typing alone re-reads nothing; an invalid row goes back to the current one.
    const reads = api.find('POST', '/projects/3/requirements/import/analyze').length;
    await user.clear(header);
    await user.type(header, '0');
    await user.tab();
    expect(api.find('POST', '/projects/3/requirements/import/analyze')).toHaveLength(reads);
  });

  it('nothing to import when the preview has no new or updated row', async () => {
    const { user } = await start({
      'POST /projects/3/requirements/import/preview': preview({
        create: 0,
        update: 0,
        skip: 4,
        invalid: 0,
        truncated: true,
        rows: [],
      }),
    });
    await screen.findByText('requirements.xlsx');
    await user.click(screen.getByRole('button', { name: 'Preview' }));
    const region = await screen.findByRole('region', { name: 'Import preview' });
    expect(region).toHaveTextContent('longer than the import limit');
    expect(screen.getByRole('button', { name: 'Import' })).toBeDisabled();
  });

  it('shows the server error of a failed step and lets the user pick another file', async () => {
    const { user } = await start({
      'POST /projects/3/requirements/import/preview': () =>
        apiError(422, 'SHEET_NOT_FOUND', 'Sheet "Spec" was not found in the file'),
    });
    await screen.findByText('requirements.xlsx');
    await user.click(screen.getByRole('button', { name: 'Preview' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Sheet "Spec" was not found');
    await user.click(screen.getByRole('button', { name: /Another file/ }));
    expect(screen.getByLabelText('Workbook to import')).toBeInTheDocument();
  });

  it('keeps the upload step when the analysis fails', async () => {
    await start({
      'POST /projects/3/requirements/import/analyze': () =>
        apiError(422, 'BAD_FILE', 'The file is not a readable workbook'),
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('not a readable workbook');
    expect(screen.getByLabelText('Workbook to import')).toBeInTheDocument();
  });
});

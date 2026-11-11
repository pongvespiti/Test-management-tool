import { describe, expect, it } from '@jest/globals';
import { screen, waitFor, within } from '@testing-library/react';
import { makeProject, renderWithProviders } from '@/test/render';
import { apiError, mockApi, type ApiCall } from '../cases/test-utils';
import { makePlan } from '../plans/test-fixtures';
import { unknownTokens } from './doc-no-pattern-field';
import { GeneralSettingsPage } from './general-settings-page';

const plans = [makePlan({ id: 1, docNo: 'TR-1' }), makePlan({ id: 2, docNo: 'TR- 7' })];

function renderPage(project = makeProject({ docNoPattern: 'TR-{SEQ}' }), overrides = {}) {
  const api = mockApi({
    'GET /projects/3/plans': plans,
    'PATCH /projects/3': ({ body }: ApiCall) => ({ ...project, ...(body as object) }),
    ...overrides,
  });
  return { ...renderWithProviders(<GeneralSettingsPage />, { project }), api };
}

describe('GeneralSettingsPage', () => {
  it('previews the next document number from the pattern and the existing plans', async () => {
    const { user } = renderPage();
    expect(await screen.findByText('TR-8')).toBeInTheDocument();
    expect(screen.getByText(/after the 2 existing plans/)).toBeInTheDocument();

    const pattern = screen.getByLabelText('Document number pattern');
    await user.clear(pattern);
    await user.type(pattern, 'DOC-');
    expect(screen.getByText('DOC-')).toBeInTheDocument();
    expect(
      screen.getByText('Without {SEQ} every plan of a month gets the same suggestion.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Insert {SEQ}' }));
    expect(pattern).toHaveValue('DOC-{SEQ}');
    // The caret moves behind the inserted token in the next animation frame.
    await waitFor(() => expect(pattern).toHaveFocus());
    expect(screen.getByText('DOC-1')).toBeInTheDocument();
    await user.type(pattern, '{{X}');
    expect(screen.getByText('{X} is not a token and stays as text.')).toBeInTheDocument();
  });

  it('saves the settings and shows server validation errors next to the field', async () => {
    const { user, api } = renderPage(makeProject({ docNoPattern: 'TR-{SEQ}' }), {
      'PATCH /projects/3': apiError(400, 'VALIDATION_ERROR', 'invalid', {
        issues: [{ path: 'name', message: 'Name is reserved' }],
      }),
    });
    const name = await screen.findByLabelText('Name');
    expect(screen.getByRole('button', { name: 'Save settings' })).toBeDisabled();
    await user.clear(name);
    await user.type(name, 'Admin');
    expect(screen.getByText('You have unsaved changes.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(await screen.findByText('Name is reserved')).toBeInTheDocument();
    expect(api.find('PATCH', '/projects/3')[0]!.body).toEqual({
      name: 'Admin',
      description: null,
      docNoPattern: 'TR-{SEQ}',
      requireCaseReview: false,
    });
    await user.click(screen.getByRole('button', { name: 'Discard' }));
    expect(name).toHaveValue('ACS Smart control');
  });

  it('saves the review rule', async () => {
    const { user, api } = renderPage();
    await user.click(
      await screen.findByRole('switch', { name: 'Require review before cases are Ready' }),
    );
    expect(screen.getByText('On — only leads make cases Ready.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() => expect(api.find('PATCH', '/projects/3')).toHaveLength(1));
    expect(api.find('PATCH', '/projects/3')[0]!.body).toMatchObject({ requireCaseReview: true });
    expect(await screen.findByText(/All changes saved/)).toBeInTheDocument();
  });

  it('archives after a confirmation and restores directly', async () => {
    const { user, api } = renderPage();
    await user.click(await screen.findByRole('button', { name: 'Archive project' }));
    const confirm = await screen.findByRole('alertdialog');
    expect(confirm).toHaveTextContent('Archive ACS?');
    await user.click(within(confirm).getByRole('button', { name: 'Archive project' }));
    await waitFor(() => expect(api.find('PATCH', '/projects/3')).toHaveLength(1));
    expect(api.find('PATCH', '/projects/3')[0]!.body).toEqual({ isArchived: true });
  });

  it('restores an archived project', async () => {
    const { user, api } = renderPage(makeProject({ isArchived: true }));
    expect(await screen.findByText(/This project is archived/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Archive project' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Restore project' }));
    await waitFor(() => expect(api.find('PATCH', '/projects/3')).toHaveLength(1));
    expect(api.find('PATCH', '/projects/3')[0]!.body).toEqual({ isArchived: false });
  });

  it('is read only for testers', async () => {
    renderPage(makeProject({ myRole: 'tester' }));
    expect(
      await screen.findByText('Only project leads can change these settings.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveAttribute('readonly');
    expect(screen.getByLabelText('Document number pattern')).toHaveAttribute('readonly');
    expect(screen.getByRole('switch')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save settings' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Insert/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Archive project' })).not.toBeInTheDocument();
  });
});

describe('unknownTokens', () => {
  it('lists each unknown token once', () => {
    expect(unknownTokens('{YY}-{X}-{X}-{SEQ}-{MONTH}')).toEqual(['{X}', '{MONTH}']);
    expect(unknownTokens('{YYYY}{MM}')).toEqual([]);
  });
});

import { describe, expect, it } from '@jest/globals';
import type { JiraConfigDTO } from '@tmt/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { makeProject, renderWithProviders } from '@/test/render';
import { apiError, mockApi, userRef, type ApiCall } from '../cases/test-utils';
import { IntegrationsPage } from './integrations-page';
import {
  jiraFormErrors,
  originOf,
  storedSecretUsable,
  toJiraBody,
  toJiraValues,
} from './jira-settings';

const storedConfig = (overrides: Partial<JiraConfigDTO> = {}): JiraConfigDTO => ({
  enabled: true,
  baseUrl: 'https://jira.example.com',
  projectKey: 'TEAM',
  issueType: 'Bug',
  authType: 'pat',
  username: null,
  hasSecret: true,
  verifyTls: true,
  updatedBy: userRef(2, 'Bob Lead'),
  updatedAt: '2026-11-01T02:00:00.000Z',
  ...overrides,
});

function renderPage(
  { config = null, role = 'lead' }: { config?: JiraConfigDTO | null; role?: 'lead' | 'tester' },
  overrides: Record<string, unknown> = {},
) {
  const api = mockApi({
    'GET /projects/3/integrations': {
      jira: config
        ? { enabled: config.enabled, baseUrl: config.baseUrl, projectKey: config.projectKey }
        : null,
    },
    'GET /projects/3/integrations/jira': config,
    'PUT /projects/3/integrations/jira': ({ body }: ApiCall) => {
      const b = body as JiraConfigDTO;
      return storedConfig({ ...b, username: b.username ?? null, updatedBy: userRef(1, 'Alice') });
    },
    'POST /projects/3/integrations/jira/test': {
      ok: true,
      message: '',
      serverTitle: 'Jira DC 9.12',
      projectName: 'TEAM products',
    },
    'DELETE /projects/3/integrations/jira': undefined,
    ...overrides,
  });
  const view = renderWithProviders(<IntegrationsPage />, {
    project: makeProject({ myRole: role }),
  });
  return { ...view, api };
}

describe('IntegrationsPage', () => {
  it('sets up Jira: tests the connection, then saves', async () => {
    const { user, api } = renderPage({});
    expect(await screen.findByText('Not set up')).toBeInTheDocument();
    await user.type(await screen.findByLabelText('Jira URL'), 'https://jira.example.com/');
    await user.type(screen.getByLabelText('Project key'), 'team');
    expect(screen.getByLabelText('Project key')).toHaveValue('TEAM');

    await user.click(screen.getByRole('button', { name: 'Test connection' }));
    expect(await screen.findByText('Enter the token')).toBeInTheDocument();
    expect(api.find('POST', '/projects/3/integrations/jira/test')).toHaveLength(0);

    await user.type(screen.getByLabelText('Personal access token'), 'pat-123');
    await user.click(screen.getByRole('button', { name: 'Test connection' }));
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('Connected');
    expect(status).toHaveTextContent('Server: Jira DC 9.12 · Project: TEAM products');
    expect(api.find('POST', '/projects/3/integrations/jira/test')[0]!.body).toEqual({
      enabled: true,
      baseUrl: 'https://jira.example.com/',
      projectKey: 'TEAM',
      issueType: 'Bug',
      authType: 'pat',
      username: null,
      verifyTls: true,
      secret: 'pat-123',
    });

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/Last saved .* by Alice/)).toBeInTheDocument();
    expect(api.find('PUT', '/projects/3/integrations/jira')[0]!.body).toMatchObject({
      baseUrl: 'https://jira.example.com/',
      secret: 'pat-123',
    });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByLabelText('Personal access token')).toHaveValue('');
    expect(
      screen.getByText('Leave blank to keep the stored token; type a new one to replace it.'),
    ).toBeInTheDocument();
  });

  it('uses e-mail + API token for Jira Cloud', async () => {
    const { user, api } = renderPage({});
    await user.type(await screen.findByLabelText('Jira URL'), 'https://acme.atlassian.net');
    await user.type(screen.getByLabelText('Project key'), 'QA');
    await user.click(screen.getByRole('radio', { name: /E-mail \+ API token/ }));
    await user.type(screen.getByLabelText('API token'), 'cloud-token');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(
      await screen.findByText('Username (e-mail for Jira Cloud) is required for basic auth'),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText('Atlassian account e-mail'), 'qa@acme.com');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.find('PUT', '/projects/3/integrations/jira')).toHaveLength(1));
    expect(api.find('PUT', '/projects/3/integrations/jira')[0]!.body).toMatchObject({
      authType: 'basic',
      username: 'qa@acme.com',
      secret: 'cloud-token',
    });
  });

  it('keeps the stored token only for the same server and reports failed tests', async () => {
    const { user, api } = renderPage(
      { config: storedConfig() },
      {
        'POST /projects/3/integrations/jira/test': {
          ok: false,
          message: 'Jira answered 401 Unauthorized',
          serverTitle: null,
          projectName: null,
        },
      },
    );
    expect(await screen.findByText('Enabled', { selector: 'span' })).toBeInTheDocument();
    expect(
      await screen.findByText(/^Last saved Nov 1, 2026 \d\d:\d\d by Bob Lead$/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Personal access token')).toHaveAttribute(
      'placeholder',
      '•••••• stored',
    );
    await user.click(screen.getByRole('button', { name: 'Test connection' }));
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('Connection failed');
    expect(status).toHaveTextContent('Jira answered 401 Unauthorized');
    expect(api.find('POST', '/projects/3/integrations/jira/test')[0]!.body).not.toHaveProperty(
      'secret',
    );

    // Any change clears the old test result.
    await user.click(screen.getByRole('switch', { name: "Verify the server's TLS certificate" }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByText(/Certificate checks are off/)).toBeInTheDocument();

    const url = screen.getByLabelText('Jira URL');
    await user.clear(url);
    await user.type(url, 'https://other-jira.example.com');
    expect(
      screen.getByText(/The stored token is only sent to the Jira server it was saved for/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(
      await screen.findByText('Enter the token again — the Jira server changed'),
    ).toBeInTheDocument();
    expect(api.find('PUT', '/projects/3/integrations/jira')).toHaveLength(0);
  });

  it('shows a missing secret reported by the server next to the token', async () => {
    const { user } = renderPage(
      { config: storedConfig({ enabled: false }) },
      {
        'PUT /projects/3/integrations/jira': apiError(
          422,
          'SECRET_REQUIRED',
          'No token is stored for this server',
        ),
      },
    );
    expect(await screen.findByText('Turned off')).toBeInTheDocument();
    await user.click(await screen.findByRole('switch', { name: 'Enabled' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('No token is stored for this server')).toBeInTheDocument();
  });

  it('removes the connection after a confirmation', async () => {
    const { user, api } = renderPage({ config: storedConfig() });
    await user.click(await screen.findByRole('button', { name: 'Remove' }));
    const confirm = await screen.findByRole('alertdialog');
    expect(confirm).toHaveTextContent('Remove the Jira connection?');
    await user.click(within(confirm).getByRole('button', { name: 'Remove connection' }));
    await waitFor(() =>
      expect(api.find('DELETE', '/projects/3/integrations/jira')).toHaveLength(1),
    );
    expect(await screen.findByText('Not saved yet')).toBeInTheDocument();
    expect(screen.getByLabelText('Jira URL')).toHaveValue('');
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
  });

  it('shows only the connection status to testers', async () => {
    renderPage({ config: storedConfig(), role: 'tester' });
    expect(await screen.findByRole('link', { name: /jira.example.com/ })).toHaveAttribute(
      'href',
      'https://jira.example.com',
    );
    expect(screen.getByText('TEAM')).toBeInTheDocument();
    expect(screen.getByText(/On a defect, use “Create Jira issue”/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Jira URL')).not.toBeInTheDocument();
    expect(screen.queryByText('Creating a token')).not.toBeInTheDocument();
  });

  it('tells testers when Jira is not connected or turned off', async () => {
    const { unmount } = renderPage({ role: 'tester' });
    expect(await screen.findByText(/Jira is not connected to this project/)).toBeInTheDocument();
    unmount();
    renderPage({ config: storedConfig({ enabled: false }), role: 'tester' });
    expect(
      await screen.findByText(/The connection is turned off: Jira actions on defects/),
    ).toBeInTheDocument();
  });

  it('explains when the settings cannot be loaded', async () => {
    renderPage(
      {},
      { 'GET /projects/3/integrations/jira': apiError(500, 'INTERNAL_ERROR', 'Server down') },
    );
    expect(await screen.findByText('Could not load the Jira settings')).toBeInTheDocument();
  });
});

describe('jira settings helpers', () => {
  it('builds the body and keeps a blank secret out of it', () => {
    const values = { ...toJiraValues(null), baseUrl: 'https://j', projectKey: 'A' };
    expect(toJiraValues(null)).toMatchObject({ enabled: true, issueType: 'Bug', authType: 'pat' });
    expect(toJiraBody(values)).not.toHaveProperty('secret');
    expect(toJiraBody({ ...values, secret: ' s ' })).toMatchObject({ secret: 's' });
    expect(toJiraBody({ ...values, authType: 'basic', username: 'u' })).toMatchObject({
      username: 'u',
    });
  });

  it('compares servers by origin', () => {
    expect(originOf(' https://jira.example.com/path ')).toBe('https://jira.example.com');
    expect(originOf('not a url')).toBeNull();
    expect(storedSecretUsable(null, 'https://jira.example.com')).toBe(false);
    expect(storedSecretUsable(storedConfig(), 'https://jira.example.com/x')).toBe(true);
    expect(storedSecretUsable(storedConfig({ hasSecret: false }), 'https://jira.example.com')).toBe(
      false,
    );
  });

  it('asks for a token unless the stored one applies', () => {
    const base = {
      ...toJiraValues(null),
      baseUrl: 'https://jira.example.com',
      projectKey: 'TEAM',
    };
    expect(jiraFormErrors(base, null)).toEqual({ secret: 'Enter the token' });
    expect(jiraFormErrors(base, storedConfig())).toEqual({});
    expect(jiraFormErrors({ ...base, secret: 'x' }, null)).toEqual({});
    expect(jiraFormErrors({ ...base, baseUrl: 'ftp://x' }, storedConfig())).toMatchObject({
      baseUrl: 'Use a full http(s) URL, e.g. https://jira.example.com',
      secret: 'Enter the token again — the Jira server changed',
    });
  });
});

import { describe, expect, it } from '@jest/globals';
import type { ApiTokenDTO } from '@tmt/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { apiError, mockApi } from '../cases/test-utils';
import { ApiTokensPage, expirySoon, isExpired, MAX_ACTIVE } from './api-tokens-page';
import { junitUploadCommand, whoAmICommand } from './token-examples';

const DAY = 24 * 60 * 60 * 1000;
const inDays = (days: number) => new Date(Date.now() + days * DAY).toISOString();

const token = (overrides: Partial<ApiTokenDTO> = {}): ApiTokenDTO => ({
  id: 1,
  name: 'Jenkins nightly',
  prefix: 'tmt_3fA9',
  createdAt: '2026-10-01T00:00:00.000Z',
  lastUsedAt: null,
  expiresAt: null,
  ...overrides,
});

const row = (name: string) => screen.getByText(name).closest('tr')!;

function renderPage(list: ApiTokenDTO[], overrides: Record<string, unknown> = {}) {
  const api = mockApi({ 'GET /auth/tokens': list, ...overrides });
  return { ...renderWithProviders(<ApiTokensPage />), api };
}

describe('ApiTokensPage', () => {
  it('lists tokens with their expiry and usage', async () => {
    renderPage([
      token(),
      token({ id: 2, name: 'Old script', expiresAt: '2026-01-01T00:00:00.000Z' }),
      token({ id: 3, name: 'Soon', expiresAt: inDays(3.5), lastUsedAt: inDays(-1) }),
    ]);
    expect(await screen.findByText('Jenkins nightly')).toBeInTheDocument();
    expect(within(row('Jenkins nightly')).getByText('tmt_3fA9…')).toBeInTheDocument();
    expect(within(row('Jenkins nightly')).getAllByText('Never')).toHaveLength(2);
    expect(within(row('Old script')).getByText('Expired')).toBeInTheDocument();
    expect(within(row('Soon')).getByText('In 3 days')).toBeInTheDocument();
    expect(within(row('Soon')).getByText('1 day ago')).toBeInTheDocument();
    expect(screen.getByText(/2 of 20 active tokens/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'REST API reference' })).toHaveAttribute(
      'href',
      '/api-docs',
    );
    expect(screen.getByText(whoAmICommand())).toBeInTheDocument();
  });

  it('creates a token and shows it once', async () => {
    const { user, api } = renderPage([], {
      'POST /auth/tokens': {
        ...token({ id: 5, name: 'CI', expiresAt: null }),
        token: 'tmt_secret_value',
      },
    });
    expect(await screen.findByText('No API tokens yet')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'New token' })[0]!);
    const dialog = await screen.findByRole('dialog', { name: 'New API token' });
    await user.click(within(dialog).getByRole('button', { name: 'Create token' }));
    expect(await within(dialog).findByText('Required')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Name'), 'CI');
    expect(within(dialog).getByText(/The token stops working on/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('radio', { name: 'Never' }));
    expect(within(dialog).getByText(/works until you revoke it/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Create token' }));

    const shown = await screen.findByRole('dialog', { name: 'Your new API token' });
    expect(api.find('POST', '/auth/tokens')[0]!.body).toEqual({ name: 'CI', expiresInDays: null });
    expect(within(shown).getByRole('textbox', { name: 'CI' })).toHaveValue('tmt_secret_value');
    expect(within(shown).getByText(whoAmICommand('tmt_secret_value'))).toBeInTheDocument();
    expect(within(shown).getByText(/Never expires/)).toBeInTheDocument();
    // Escape does not close the dialog while the token is shown.
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: 'Your new API token' })).toBeInTheDocument();
    await user.click(within(shown).getByRole('button', { name: 'I have copied the token' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('sends the chosen expiry', async () => {
    const { user, api } = renderPage([], {
      'POST /auth/tokens': { ...token({ expiresAt: inDays(30) }), token: 'tmt_x' },
    });
    await user.click((await screen.findAllByRole('button', { name: 'New token' }))[0]!);
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Name'), 'Script');
    await user.click(within(dialog).getByRole('radio', { name: '30 days' }));
    await user.click(within(dialog).getByRole('button', { name: 'Create token' }));
    await waitFor(() => expect(api.find('POST', '/auth/tokens')).toHaveLength(1));
    expect(api.find('POST', '/auth/tokens')[0]!.body).toEqual({
      name: 'Script',
      expiresInDays: 30,
    });
  });

  it('revokes a token after a confirmation (already revoked is fine)', async () => {
    const { user, api } = renderPage([token()], {
      'DELETE /auth/tokens/1': apiError(404, 'TOKEN_NOT_FOUND'),
    });
    await user.click(await screen.findByRole('button', { name: 'Revoke Jenkins nightly' }));
    const confirm = await screen.findByRole('alertdialog');
    expect(confirm).toHaveTextContent('Revoke “Jenkins nightly”?');
    await user.click(within(confirm).getByRole('button', { name: 'Revoke token' }));
    await waitFor(() => expect(api.find('DELETE', '/auth/tokens/1')).toHaveLength(1));
  });

  it('blocks new tokens at the limit', async () => {
    renderPage(Array.from({ length: MAX_ACTIVE }, (_, i) => token({ id: i + 1, name: `T${i}` })));
    expect(await screen.findByText('T0')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New token' })).toBeDisabled();
  });
});

describe('token helpers', () => {
  it('detects expired and soon-expiring tokens', () => {
    const now = new Date('2026-11-10T00:00:00.000Z');
    expect(isExpired({ expiresAt: null }, now)).toBe(false);
    expect(isExpired({ expiresAt: '2026-11-09T00:00:00.000Z' }, now)).toBe(true);
    expect(expirySoon('2026-11-10T05:00:00.000Z', now)).toBe('Expires today');
    expect(expirySoon('2026-11-11T05:00:00.000Z', now)).toBe('In 1 day');
    expect(expirySoon('2026-11-20T00:00:00.000Z', now)).toBeNull();
  });

  it('builds example commands for this server', () => {
    expect(whoAmICommand()).toBe(
      'curl -H "Authorization: Bearer <token>" http://localhost/api/v1/auth/me',
    );
    expect(junitUploadCommand()).toContain(
      '"http://localhost/api/v1/projects/<projectId>/runs/<runId>/junit?matchBy=auto"',
    );
  });
});

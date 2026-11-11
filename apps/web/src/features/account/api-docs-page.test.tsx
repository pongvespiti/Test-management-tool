import { afterEach, describe, expect, it } from '@jest/globals';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { setNavigation } from '@/test/mocks/next-navigation';
import { apiError, mockApi } from '../cases/test-utils';
import { ApiDocsPage } from './api-docs-page';
import { openApiFixture } from './openapi-fixture';

function renderPage(document: unknown = openApiFixture) {
  const api = mockApi({ 'GET /openapi.json': document });
  return { ...renderWithProviders(<ApiDocsPage />), api };
}

const opButton = (name: string) => screen.getByRole('button', { name });

describe('ApiDocsPage', () => {
  afterEach(() => window.history.replaceState(null, '', '/'));

  it('renders the operations of the generated document by section', async () => {
    renderPage();
    expect(
      await screen.findByText(/TMT — Test Management Tool API 2.0.0 · 5 endpoints/),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Projects' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'API tokens' })).toBeInTheDocument();
    const members = opButton('PUT /api/v1/projects/{projectId}/members — Set members');
    expect(within(members).getByText('Lead')).toBeInTheDocument();
    expect(
      within(
        opButton('POST /api/v1/projects/{projectId}/runs/{runId}/junit — Import junit'),
      ).getByText('Tester'),
    ).toBeInTheDocument();
    expect(screen.getByText('VALIDATION_ERROR')).toBeInTheDocument();
    // The cookie name is the one the server documents, not a literal of the web app.
    expect(screen.getByText('tmt_custom_session')).toBeInTheDocument();
    expect(screen.getByText('POST /api/v1/auth/login')).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'API sections' });
    expect(within(nav).getByRole('link', { name: /Automation/ })).toHaveAttribute(
      'href',
      '#tag-automation',
    );
  });

  it('shows role, parameters, error codes and a curl example when an operation opens', async () => {
    const { user } = renderPage();
    await user.click(await screen.findByRole('button', { name: /— Set members$/ }));
    expect(await screen.findByText('project leads (and administrators)')).toBeInTheDocument();
    expect(screen.getByText('LEAD_REQUIRED')).toBeInTheDocument();
    expect(screen.getByText('projectId')).toBeInTheDocument();
    expect(screen.getByText('Not documented.')).toBeInTheDocument();
    expect(
      screen.getByText(/curl -X PUT "http:\/\/localhost\/api\/v1\/projects\/<projectId>\/members"/),
    ).toBeInTheDocument();
    expect(window.location.hash).toBe('#op-ProjectsController_setMembers');
    await user.click(screen.getByRole('button', { name: 'Show JSON schema' }));
    expect(screen.getByText(/"maxItems": 500/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /— Create token$/ }));
    expect(await screen.findByText('Session only')).toBeInTheDocument();
    expect(screen.getByText('TOO_MANY_TOKENS')).toBeInTheDocument();
    expect(screen.getByText(/Session only: sign in first/)).toBeInTheDocument();
    expect(screen.getByText('not documented')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Collapse all' }));
    await waitFor(() => expect(screen.queryByText('LEAD_REQUIRED')).not.toBeInTheDocument());
  });

  it('searches by path, summary or error code and keeps the search in the URL', async () => {
    const { user } = renderPage();
    const search = await screen.findByRole('textbox', { name: 'Search endpoints' });
    await user.type(search, 'bad_xml');
    expect(screen.getByText('1 of 5 endpoints')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Projects' })).not.toBeInTheDocument();
    expect(window.location.search).toBe('?q=bad_xml');
    await user.type(search, 'zz');
    expect(screen.getByText('No endpoints match “bad_xmlzz”')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByText('5 endpoints')).toBeInTheDocument();
  });

  it('opens the search and operation of a shared link', async () => {
    setNavigation({ pathname: '/api-docs', search: '?q=members' });
    window.history.replaceState(null, '', '/api-docs?q=members#op-ProjectsController_setMembers');
    renderPage();
    expect(await screen.findByText('LEAD_REQUIRED')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Search endpoints' })).toHaveValue('members');
    expect(screen.getByText('1 of 5 endpoints')).toBeInTheDocument();
  });

  it('explains a document that cannot be read', async () => {
    renderPage({ not: 'openapi' });
    expect(await screen.findByText('Could not load the API description')).toBeInTheDocument();
    expect(screen.getByText('The server did not return an OpenAPI document.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'openapi.json' })).toBeDisabled();
  });

  it('explains when the server refuses the document', async () => {
    mockApi({ 'GET /openapi.json': apiError(500, 'INTERNAL_ERROR', 'Server down') });
    renderWithProviders(<ApiDocsPage />);
    expect(await screen.findByText('Server down')).toBeInTheDocument();
  });
});

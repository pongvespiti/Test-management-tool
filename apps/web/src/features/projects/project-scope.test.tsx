import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { screen, waitFor } from '@testing-library/react';
import { getLastProjectId, setLastProjectId } from '@/lib/storage';
import { resetNavigation, setNavigation } from '@/test/mocks/next-navigation';
import { useOptionalProject } from '@/providers/project-provider';
import { jsonResponse, makeProject, renderWithProviders } from '@/test/render';
import { ProjectGate, ProjectScope } from './project-scope';

type FetchMock = jest.MockedFunction<typeof fetch>;

function Current() {
  const project = useOptionalProject();
  return <p data-testid="current">{project ? `${project.project.key}:${project.role}` : 'none'}</p>;
}

const apiError = (status: number, code: string, message: string) =>
  jsonResponse({ error: { code, message } }, status);

describe('project scope', () => {
  let fetchMock: FetchMock;
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    resetNavigation();
    setLastProjectId(null);
    fetchMock = jest.fn() as FetchMock;
    globalThis.fetch = fetchMock;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  describe('ProjectScope', () => {
    it('provides no project outside /projects/[projectId] and asks the server nothing', () => {
      renderWithProviders(
        <ProjectScope>
          <Current />
        </ProjectScope>,
      );
      expect(screen.getByTestId('current')).toHaveTextContent('none');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('loads the project of the URL and provides it with the caller’s role', async () => {
      setNavigation({ params: { projectId: '3' } });
      fetchMock.mockResolvedValue(jsonResponse(makeProject({ myRole: 'tester' })));
      renderWithProviders(
        <ProjectScope>
          <Current />
        </ProjectScope>,
      );
      expect(screen.getByTestId('current')).toHaveTextContent('none');
      await waitFor(() => expect(screen.getByTestId('current')).toHaveTextContent('ACS:tester'));
      expect(fetchMock.mock.calls[0]![0]).toBe('/api/v1/projects/3');
    });

    it('ignores a malformed project id', () => {
      setNavigation({ params: { projectId: 'abc' } });
      renderWithProviders(
        <ProjectScope>
          <Current />
        </ProjectScope>,
      );
      expect(screen.getByTestId('current')).toHaveTextContent('none');
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('ProjectGate', () => {
    const gate = () =>
      renderWithProviders(
        <ProjectGate>
          <p>project page</p>
        </ProjectGate>,
      );

    it('shows the page once the project is loaded and remembers it as the last project', async () => {
      setNavigation({ params: { projectId: '3' } });
      fetchMock.mockResolvedValue(jsonResponse(makeProject()));
      gate();
      expect(screen.queryByText('project page')).not.toBeInTheDocument();
      expect(await screen.findByText('project page')).toBeInTheDocument();
      expect(getLastProjectId()).toBe(3);
    });

    it('explains a project the user cannot open and forgets it as the last project', async () => {
      setLastProjectId(3);
      setNavigation({ params: { projectId: '3' } });
      fetchMock.mockResolvedValue(apiError(404, 'PROJECT_NOT_FOUND', 'Project not found'));
      gate();
      expect(await screen.findByText('Project not available')).toBeInTheDocument();
      expect(screen.getByText('Project not found')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Back to projects' })).toHaveAttribute(
        'href',
        '/projects',
      );
      expect(screen.queryByText('project page')).not.toBeInTheDocument();
      await waitFor(() => expect(getLastProjectId()).toBeNull());
    });

    it('keeps the last project when the server merely fails', async () => {
      setLastProjectId(3);
      setNavigation({ params: { projectId: '3' } });
      fetchMock.mockResolvedValue(apiError(503, 'DB_UNAVAILABLE', 'Database is not reachable'));
      gate();
      expect(await screen.findByText('Database is not reachable')).toBeInTheDocument();
      expect(getLastProjectId()).toBe(3);
    });

    it('answers a malformed id without calling the server', () => {
      setNavigation({ params: { projectId: '0' } });
      gate();
      expect(screen.getByText('Project not available')).toBeInTheDocument();
      expect(screen.getByText('This project does not exist.')).toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});

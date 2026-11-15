import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { MeDTO, ProjectDTO, ProjectRole, UserDTO } from '@tmt/shared';
import { render, type RenderOptions } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement, ReactNode } from 'react';
import { ConfirmHost } from '@/components/common/confirm-host';
import { TooltipProvider } from '@/components/ui/tooltip';
import { LocaleProvider } from '@/lib/i18n';
import { AuthContext, type AuthContextValue } from '@/providers/auth-provider';
import { ProjectProvider } from '@/providers/project-provider';

export function makeUser(overrides: Partial<UserDTO> = {}): UserDTO {
  return {
    id: 1,
    username: 'alice',
    displayName: 'Alice Tester',
    email: null,
    isAdmin: false,
    isTechnician: false,
    isActive: true,
    mustChangePassword: false,
    lastLoginAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export function makeProject(overrides: Partial<ProjectDTO> = {}): ProjectDTO {
  return {
    id: 3,
    key: 'ACS',
    name: 'ACS Smart control',
    description: null,
    docNoPattern: '{YY}TR-TEAM-{MM}-{SEQ}',
    isArchived: false,
    requireCaseReview: false,
    myRole: 'lead',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** Auth context with sensible defaults; override any field (e.g. `login`). */
export function makeAuth(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  const user = overrides.user === undefined ? makeUser() : overrides.user;
  const me: MeDTO | null = user ? { user, memberships: [] } : null;
  return {
    me,
    user,
    isAdmin: user?.isAdmin ?? false,
    isTechnician: user?.isTechnician ?? false,
    loading: false,
    error: null,
    login: async () => me!,
    logout: async () => undefined,
    roleIn: (): ProjectRole | null => (user?.isAdmin ? 'lead' : null),
    ...overrides,
  };
}

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
}

interface ProvidersOptions {
  auth?: Partial<AuthContextValue>;
  /** Renders inside a project (as on `/projects/[projectId]/…` pages). */
  project?: ProjectDTO | null;
  queryClient?: QueryClient;
}

/**
 * Renders `ui` with the providers of the app (React Query, auth, project, tooltips, confirm
 * dialogs) and returns Testing Library queries plus a `user` for interactions.
 */
export function renderWithProviders(
  ui: ReactElement,
  {
    auth,
    project = null,
    queryClient = createTestQueryClient(),
    ...options
  }: ProvidersOptions & Omit<RenderOptions, 'wrapper'> = {},
) {
  const authValue = makeAuth(auth);
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <LocaleProvider>
          <AuthContext.Provider value={authValue}>
            <ProjectProvider project={project}>
              <TooltipProvider>
                {children}
                <ConfirmHost />
              </TooltipProvider>
            </ProjectProvider>
          </AuthContext.Provider>
        </LocaleProvider>
      </QueryClientProvider>
    );
  }
  return { user: userEvent.setup(), queryClient, ...render(ui, { wrapper: Wrapper, ...options }) };
}

/** JSON `Response` for mocked `fetch` calls. */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

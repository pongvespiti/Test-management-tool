import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { screen, waitFor } from '@testing-library/react';
import { mockRouter } from '@/test/mocks/next-navigation';
import { jsonResponse, makeUser, renderWithProviders } from '@/test/render';
import { ChangePasswordForm, changePasswordFormSchema } from './change-password-form';

type FetchMock = jest.MockedFunction<typeof fetch>;

describe('ChangePasswordForm', () => {
  let fetchMock: FetchMock;
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    fetchMock = jest.fn() as FetchMock;
    globalThis.fetch = fetchMock;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  async function fill(user: ReturnType<typeof renderWithProviders>['user'], values: string[]) {
    const [current, next, repeat] = values;
    await user.type(screen.getByLabelText('Current password'), current!);
    await user.type(screen.getByLabelText('New password'), next!);
    await user.type(screen.getByLabelText('Repeat new password'), repeat!);
    await user.click(screen.getByRole('button', { name: 'Change password' }));
  }

  it('asks users with a temporary password to set their own', () => {
    renderWithProviders(<ChangePasswordForm />, {
      auth: { user: makeUser({ mustChangePassword: true }) },
    });
    expect(
      screen.getByText('Please set your own password before you continue.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('checks length, reuse and the repeated password locally', async () => {
    const { user } = renderWithProviders(<ChangePasswordForm />);
    await fill(user, ['Old-pass-1', 'Old-pass-1', 'other']);
    expect(
      await screen.findByText('Choose a password different from the current one'),
    ).toBeInTheDocument();
    expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('changes the password and goes to the start page', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const { user } = renderWithProviders(<ChangePasswordForm />);
    await fill(user, ['Old-pass-1', 'New-pass-22', 'New-pass-22']);
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/'));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/auth/change-password');
    expect(JSON.parse(String(init?.body))).toEqual({
      currentPassword: 'Old-pass-1',
      newPassword: 'New-pass-22',
    });
  });

  it('marks the current password when the server says it is wrong', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { error: { code: 'WRONG_PASSWORD', message: 'The current password is not correct' } },
        422,
      ),
    );
    const { user } = renderWithProviders(<ChangePasswordForm />);
    await fill(user, ['Bad-pass-1', 'New-pass-22', 'New-pass-22']);
    expect(await screen.findByText('Current password is wrong')).toBeInTheDocument();
  });
});

describe('changePasswordFormSchema', () => {
  it('requires the minimum length from the shared contract', () => {
    const result = changePasswordFormSchema.safeParse({
      currentPassword: 'x',
      newPassword: 'short',
      confirm: 'short',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('Use at least 8 characters');
  });
});

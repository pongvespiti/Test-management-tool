import { describe, expect, it, jest } from '@jest/globals';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GRAY } from '@/lib/status';
import { renderWithProviders } from '@/test/render';
import { confirmAction, confirmDelete } from './confirm-host';
import { parseDateOnly, toDateOnly } from './date-input';
import { EmptyState } from './empty-state';
import { PasswordInput } from './password-input';
import { StatusPill } from './status-pill';

describe('StatusPill', () => {
  it('renders the label in the tone colours', () => {
    render(<StatusPill tone={GRAY}>Archived</StatusPill>);
    expect(screen.getByText('Archived')).toHaveStyle({ color: '#495057' });
  });
});

describe('EmptyState', () => {
  it('shows title, description and action', () => {
    render(<EmptyState title="Nothing here" description="Add one" action={<button>Add</button>} />);
    expect(screen.getByRole('heading', { name: 'Nothing here' })).toBeInTheDocument();
    expect(screen.getByText('Add one')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });
});

describe('PasswordInput', () => {
  it('toggles visibility', async () => {
    const user = userEvent.setup();
    render(<PasswordInput aria-label="Password" defaultValue="s3cret" />);
    const input = screen.getByLabelText('Password');
    expect(input).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});

describe('date-only helpers', () => {
  it('round-trips YYYY-MM-DD without a time-zone shift', () => {
    const date = parseDateOnly('2026-02-28');
    expect(date?.getDate()).toBe(28);
    expect(toDateOnly(date)).toBe('2026-02-28');
    expect(parseDateOnly('')).toBeUndefined();
    expect(parseDateOnly('2026-13-40')).toBeUndefined();
    expect(toDateOnly(undefined)).toBeNull();
  });
});

describe('confirm dialogs', () => {
  it('runs the action only after confirmation', async () => {
    const onConfirm = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const { user } = renderWithProviders(<div />);
    act(() => confirmDelete('suite “Modbus”', onConfirm));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Delete suite “Modbus”?');
    expect(dialog).toHaveTextContent('This cannot be undone.');
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('does nothing when cancelled', async () => {
    const onConfirm = jest.fn<() => void>();
    const { user } = renderWithProviders(<div />);
    act(() =>
      confirmAction({ title: 'Start the run?', message: 'Testers get notified.', onConfirm }),
    );
    await screen.findByRole('alertdialog');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

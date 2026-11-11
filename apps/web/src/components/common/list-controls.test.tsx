import { describe, expect, it, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { matchLabel } from './combobox-select';
import { PagePagination, pageRange, SearchInput, SegmentedControl } from './list-controls';

function Box() {
  const [v, setV] = useState('fan');
  return <SearchInput aria-label="Search" value={v} onValueChange={setV} />;
}

describe('pageRange', () => {
  it('shows every page when there are few', () => {
    expect(pageRange(1, 1)).toEqual([1]);
    expect(pageRange(7, 4)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('puts gaps around the current page', () => {
    expect(pageRange(10, 1)).toEqual([1, 2, 3, 4, 5, 'dots', 10]);
    expect(pageRange(10, 5)).toEqual([1, 'dots', 4, 5, 6, 'dots', 10]);
    expect(pageRange(10, 10)).toEqual([1, 'dots', 6, 7, 8, 9, 10]);
  });
});

describe('PagePagination', () => {
  it('moves between pages', async () => {
    const onChange = jest.fn<(page: number) => void>();
    const user = userEvent.setup();
    render(<PagePagination page={1} pages={3} onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Go to previous page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Page 1' })).toHaveAttribute('aria-current', 'page');
    await user.click(screen.getByRole('button', { name: 'Go to next page' }));
    await user.click(screen.getByRole('button', { name: 'Page 3' }));
    expect(onChange.mock.calls).toEqual([[2], [3]]);
  });
});

describe('SegmentedControl', () => {
  it('always keeps one option selected', async () => {
    const onChange = jest.fn<(v: 'a' | 'b') => void>();
    const user = userEvent.setup();
    render(
      <SegmentedControl
        aria-label="Mode"
        value="a"
        onChange={onChange}
        options={[
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ]}
      />,
    );
    await user.click(screen.getByRole('radio', { name: 'A' }));
    expect(onChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole('radio', { name: 'B' }));
    expect(onChange).toHaveBeenCalledWith('b');
  });
});

describe('SearchInput', () => {
  it('clears the text', async () => {
    const user = userEvent.setup();
    render(<Box />);
    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByLabelText('Search')).toHaveValue('');
    expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument();
  });
});

describe('matchLabel', () => {
  it('matches combobox labels case-insensitively', () => {
    expect(matchLabel('opt:1', '', ['Power'])).toBe(1);
    expect(matchLabel('opt:1', 'pow', ['Power'])).toBe(1);
    expect(matchLabel('opt:1', 'net', ['Power'])).toBe(0);
    expect(matchLabel('opt:1', 'net')).toBe(0);
  });
});

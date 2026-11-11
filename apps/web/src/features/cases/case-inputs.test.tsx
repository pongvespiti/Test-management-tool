import { describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { customFieldOptions } from './custom-field-input';
import { stepNumbers } from './steps-editor';
import { addTags, TagsInput } from './tags-input';

const shared = (n: number, missing = false) => ({
  uid: `u${n}${missing}`,
  kind: 'shared' as const,
  sharedStepId: n,
  name: 'S',
  steps: Array.from({ length: n }, () => ({ action: 'a', expected: '' })),
  missing,
});

function Tags({
  initial = [],
  ...props
}: Partial<Parameters<typeof TagsInput>[0]> & { initial?: string[] }) {
  const [tags, setTags] = useState(initial);
  return <TagsInput aria-label="Tags" value={tags} onChange={setTags} {...props} />;
}

const chips = () =>
  screen
    .queryAllByRole('button', { name: /^Remove (?!all)/ })
    .map((b) => b.getAttribute('aria-label'));

describe('case input helpers', () => {
  it('keeps an imported choice that is not an option', () => {
    const def = {
      key: 'r',
      label: 'R',
      type: 'select' as const,
      showInTable: false,
      options: ['a'],
    };
    expect(customFieldOptions(def, 'a')).toEqual(['a']);
    expect(customFieldOptions(def, 'z')).toEqual(['a', 'z']);
    expect(customFieldOptions({ ...def, options: undefined }, '')).toEqual([]);
  });

  it('numbers steps the way a run shows them', () => {
    const step = { uid: 's', kind: 'step' as const, action: '', expected: '' };
    expect(stepNumbers([step, shared(2), shared(1), shared(3, true), step])).toEqual([
      '1',
      '2–3',
      '4',
      '–',
      '5',
    ]);
  });
});

describe('TagsInput', () => {
  it('adds unique tags with Enter, separators and on blur', async () => {
    const user = userEvent.setup();
    render(<Tags maxTags={4} />);
    const input = screen.getByLabelText('Tags');
    await user.type(input, 'smoke{Enter}');
    await user.type(input, 'wifi;SMOKE,');
    await user.type(input, '  ');
    await user.keyboard('{Enter}');
    await user.click(input);
    await user.paste('a,b,c');
    await user.tab();
    expect(chips()).toEqual(['Remove smoke', 'Remove wifi', 'Remove a', 'Remove b']);
    expect(addTags(['x'], [' y ', '', 'X'], 5)).toEqual(['x', 'y']);
  });

  it('removes tags with Backspace, the chip button and "Remove all"', async () => {
    const user = userEvent.setup();
    render(<Tags initial={['a', 'b', 'c']} />);
    await user.click(screen.getByLabelText('Tags'));
    await user.keyboard('{Backspace}');
    expect(chips()).toEqual(['Remove a', 'Remove b']);
    await user.click(screen.getByRole('button', { name: 'Remove a' }));
    expect(chips()).toEqual(['Remove b']);
    await user.click(screen.getByRole('button', { name: 'Remove all' }));
    expect(chips()).toEqual([]);
  });

  it('offers suggestions to pick with the keyboard or the mouse', async () => {
    const user = userEvent.setup();
    render(<Tags suggestions={['smoke', 'smart', 'wifi']} />);
    const input = screen.getByLabelText('Tags');
    await user.type(input, 'sm');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['smoke', 'smart']);
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowUp}{Enter}');
    expect(chips()).toEqual(['Remove smoke']);
    await user.type(input, 's');
    await user.click(screen.getByRole('option', { name: 'smart' }));
    expect(chips()).toEqual(['Remove smoke', 'Remove smart']);
    await user.type(input, 'w');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('shows read-only tags without controls', () => {
    const { rerender } = render(<TagsInput readOnly value={['a']} onChange={() => undefined} />);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    rerender(<TagsInput readOnly value={[]} onChange={() => undefined} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});

import { describe, expect, it, jest } from '@jest/globals';
import { screen, waitFor } from '@testing-library/react';
import type { EnvDimension } from '@tmt/shared';
import { makeProject, renderWithProviders } from '@/test/render';
import { mockApi } from '../cases/test-utils';
import { EnvEditor } from './env-editor';
import type { EnvRow } from './env-rows';

const dims: EnvDimension[] = [
  {
    label: 'Platform',
    parent: null,
    values: [
      { value: 'Android', parent: null },
      { value: 'iOS', parent: null },
    ],
  },
  {
    label: 'OS ver',
    parent: 'Platform',
    values: [
      { value: '15', parent: 'Android' },
      { value: '18', parent: 'iOS' },
    ],
  },
];
const rows = (platform: string): EnvRow[] => [
  { uid: 'a', label: 'Platform', value: platform },
  { uid: 'b', label: 'OS ver', value: '' },
];

const optionsOf = (input: HTMLElement) =>
  [...(document.getElementById(input.getAttribute('list')!)?.querySelectorAll('option') ?? [])].map(
    (o) => o.getAttribute('value'),
  );

describe('EnvEditor suggestions', () => {
  it('suggests the labels and the values of the lists, scoped by the parent row', async () => {
    mockApi({ 'GET /projects/3/env-dimensions': { dimensions: dims } });
    renderWithProviders(<EnvEditor value={rows('iOS')} onChange={jest.fn()} />, {
      project: makeProject(),
    });
    const platform = await screen.findByLabelText('Value of Platform');
    await screen.findByLabelText('Value of OS ver');
    expect(optionsOf(platform)).toEqual(['Android', 'iOS']);
    // OS ver follows the Platform chosen in the same environment.
    expect(optionsOf(screen.getByLabelText('Value of OS ver'))).toEqual(['18']);
    expect(optionsOf(screen.getByLabelText('Environment item 1'))).toEqual(['Platform', 'OS ver']);
  });

  it('offers every OS version while the platform is not chosen', async () => {
    mockApi({ 'GET /projects/3/env-dimensions': { dimensions: dims } });
    renderWithProviders(<EnvEditor value={rows('')} onChange={jest.fn()} />, {
      project: makeProject(),
    });
    await screen.findByLabelText('Value of OS ver');
    await waitFor(() =>
      expect(optionsOf(screen.getByLabelText('Value of OS ver'))).toEqual(['15', '18']),
    );
  });
});

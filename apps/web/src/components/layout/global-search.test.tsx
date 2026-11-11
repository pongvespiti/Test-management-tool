import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { CaseSearchHit, CaseSearchResultDTO } from '@tmt/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { mockRouter, resetNavigation, setNavigation } from '@/test/mocks/next-navigation';
import { jsonResponse, makeProject, renderWithProviders } from '@/test/render';
import { GlobalSearch } from './global-search';

type FetchMock = jest.MockedFunction<typeof fetch>;

const hit = (overrides: Partial<CaseSearchHit> = {}): CaseSearchHit => ({
  id: 41,
  displayId: 'RC-004',
  code: null,
  title: 'Power off during compressor start',
  status: 'ready',
  priority: 'high',
  suiteId: 7,
  suiteName: 'Remote control',
  ...overrides,
});

const result = (items: CaseSearchHit[], total = items.length): CaseSearchResultDTO => ({
  items,
  total,
});

const box = () => screen.getByRole('combobox', { name: 'Search the test case library' });

describe('GlobalSearch', () => {
  let fetchMock: FetchMock;
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    resetNavigation();
    fetchMock = jest.fn() as FetchMock;
    globalThis.fetch = fetchMock;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('renders nothing to type in outside a project', () => {
    renderWithProviders(<GlobalSearch />);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('waits for two characters, then lists matches of every suite', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        result([
          hit(),
          hit({
            id: 52,
            displayId: 'WF-002',
            title: 'Compressor log',
            suiteId: 9,
            suiteName: 'Wi-Fi adapter',
          }),
        ]),
      ),
    );
    const { user } = renderWithProviders(<GlobalSearch />, { project: makeProject() });

    await user.type(box(), 'c');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    await user.type(box(), 'ompressor');
    const list = await screen.findByRole('listbox', { name: 'Matching test cases' });
    const options = await within(list).findAllByRole('option');
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent('RC-004');
    expect(options[0]).toHaveTextContent('Remote control');
    expect(options[1]).toHaveTextContent('Wi-Fi adapter');
    expect(screen.getByRole('status')).toHaveTextContent('2 matches in all suites');
    expect(fetchMock.mock.calls.at(-1)![0]).toBe(
      '/api/v1/projects/3/cases/search?q=compressor&limit=8',
    );
    expect(box()).toHaveAttribute('aria-expanded', 'true');
  });

  it('opens the clicked match in its own suite', async () => {
    fetchMock.mockResolvedValue(jsonResponse(result([hit()])));
    const { user } = renderWithProviders(<GlobalSearch />, { project: makeProject() });
    await user.type(box(), 'power');
    await user.click(await screen.findByRole('option', { name: /Power off during compressor/ }));
    expect(mockRouter.push).toHaveBeenCalledWith('/projects/3/cases?suite=7&case=41');
    expect(box()).toHaveValue('');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('moves the highlight with the arrow keys and opens it with Enter', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(result([hit(), hit({ id: 52, displayId: 'WF-002', suiteId: 9 })])),
    );
    const { user } = renderWithProviders(<GlobalSearch />, { project: makeProject() });
    await user.type(box(), 'power');
    await screen.findAllByRole('option');

    await user.keyboard('{ArrowDown}{ArrowDown}');
    const options = screen.getAllByRole('option');
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
    expect(box()).toHaveAttribute('aria-activedescendant', options[1]!.id);
    await user.keyboard('{ArrowUp}');
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
    // Up from the first row leaves the list; up again wraps to the last row.
    await user.keyboard('{ArrowUp}');
    expect(box()).not.toHaveAttribute('aria-activedescendant');
    await user.keyboard('{ArrowUp}{Enter}');
    expect(mockRouter.push).toHaveBeenCalledWith('/projects/3/cases?suite=9&case=52');
  });

  it('Enter without a highlight filters the library in the suite of the best match', async () => {
    fetchMock.mockResolvedValue(jsonResponse(result([hit()], 14)));
    const { user } = renderWithProviders(<GlobalSearch />, { project: makeProject() });
    await user.type(box(), '  power ');
    await screen.findByRole('option');
    expect(screen.getByRole('status')).toHaveTextContent('Showing 1 of 14 matches');
    await user.keyboard('{Enter}');
    expect(mockRouter.push).toHaveBeenCalledWith('/projects/3/cases?suite=7&q=power');
  });

  it('keeps the suite that is open in the library when it has a match', async () => {
    setNavigation({ pathname: '/projects/3/cases', search: 'suite=9' });
    fetchMock.mockResolvedValue(
      jsonResponse(result([hit(), hit({ id: 52, suiteId: 9, suiteName: 'Wi-Fi adapter' })])),
    );
    const { user } = renderWithProviders(<GlobalSearch />, { project: makeProject() });
    await user.type(box(), 'power');
    await screen.findAllByRole('option');
    await user.keyboard('{Enter}');
    expect(mockRouter.push).toHaveBeenCalledWith('/projects/3/cases?suite=9&q=power');
  });

  it('says so when nothing matches and still lets Enter open the library', async () => {
    setNavigation({ pathname: '/projects/3/cases', search: 'suite=9' });
    fetchMock.mockResolvedValue(jsonResponse(result([])));
    const { user } = renderWithProviders(<GlobalSearch />, { project: makeProject() });
    await user.type(box(), 'zzz');
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('No test case matches “zzz”.'),
    );
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(mockRouter.push).toHaveBeenCalledWith('/projects/3/cases?suite=9&q=zzz');
  });

  it('reports a failed search and closes with Escape', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: 'INTERNAL', message: 'Something went wrong' } }, 500),
    );
    const { user } = renderWithProviders(<GlobalSearch />, { project: makeProject() });
    await user.type(box(), 'power');
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Search is not available right now.'),
    );
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(box()).toHaveAttribute('aria-expanded', 'false');
  });
});

import { describe, expect, it } from '@jest/globals';
import { screen, waitFor, within } from '@testing-library/react';
import { mockApi } from '@/features/cases/test-utils';
import { makeRunCase } from '@/features/runs/test-fixtures';
import { renderWithProviders } from '@/test/render';
import { makeTopics } from './test-fixtures';
import { TopicTree } from './topic-tree';

describe('TopicTree', () => {
  it('shows topic, suites and runs with state, due date and tester', () => {
    renderWithProviders(<TopicTree projectId={3} topics={makeTopics().topics} userId={null} />);
    const topic = screen.getByRole('region', { name: 'Adapter operation test' });
    expect(within(topic).getByText('Adapter Model A')).toBeInTheDocument();
    expect(within(topic).getByText('Adapter Model B')).toBeInTheDocument();
    const first = within(topic).getByRole('list', { name: 'Runs of Adapter Model A' });
    expect(within(first).getByRole('link', { name: 'KR_01' })).toHaveAttribute(
      'href',
      '/projects/3/runs/7',
    );
    expect(first).toHaveTextContent('Tom');
    expect(first).toHaveTextContent('Due Nov 20, 2026');
    expect(first).toHaveTextContent('In progress');
    const second = within(topic).getByRole('list', { name: 'Runs of Adapter Model B' });
    expect(second).toHaveTextContent('Not assigned');
    expect(second).toHaveTextContent('Not started');
    expect(second).toHaveTextContent('Overdue');
  });

  it('opens a run into its sections and the cases of a section', async () => {
    mockApi({
      'GET /projects/3/runs/7/cases': [
        makeRunCase({
          id: 1,
          displayId: 'AO-001',
          title: 'Pair',
          status: 'ok',
          sectionPath: ['Pairing'],
        }),
        makeRunCase({ id: 2, displayId: 'AO-002', title: 'Sync', sectionPath: ['Cloud sync'] }),
      ],
    });
    const { user } = renderWithProviders(
      <TopicTree projectId={3} topics={makeTopics().topics} userId={null} />,
    );
    await user.click(screen.getByRole('button', { name: 'Show sections of KR_01' }));
    const sections = await screen.findByRole('list', { name: 'Sections of KR_01' });
    expect(within(sections).getByText('Pairing')).toBeInTheDocument();
    expect(within(sections).getByText('Cloud sync')).toBeInTheDocument();
    expect(within(sections).queryByText('Pair')).not.toBeInTheDocument();
    await user.click(within(sections).getByRole('button', { name: 'Show cases of Pairing' }));
    expect(within(sections).getByRole('link', { name: 'Pair' })).toHaveAttribute(
      'href',
      '/projects/3/runs/7?case=1',
    );
  });

  it("lists only the person's own cases of a run", async () => {
    mockApi({
      'GET /projects/3/runs/7/cases': [
        makeRunCase({ id: 1, title: 'Mine', sectionPath: ['Pairing'] }),
        makeRunCase({
          id: 2,
          title: 'Hers',
          sectionPath: ['Cloud sync'],
          assignee: { id: 9, username: 'ann', displayName: 'Ann' },
        }),
      ],
    });
    const { user } = renderWithProviders(
      <TopicTree projectId={3} topics={makeTopics().topics} userId={5} />,
    );
    await user.click(screen.getByRole('button', { name: 'Show sections of KR_01' }));
    const sections = await screen.findByRole('list', { name: 'Sections of KR_01' });
    await waitFor(() => expect(within(sections).getByText('Pairing')).toBeInTheDocument());
    expect(within(sections).queryByText('Cloud sync')).not.toBeInTheDocument();
  });
});

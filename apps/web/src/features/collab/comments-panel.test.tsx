import { describe, expect, it } from '@jest/globals';
import type { CommentDTO } from '@tmt/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { makeProject, renderWithProviders } from '@/test/render';
import { makeComment, mockApi, type ApiCall } from '../cases/test-utils';
import { alice, bob } from '../runs/test-fixtures';
import { CommentsPanel } from './comments-panel';

const mine = makeComment({
  id: 1,
  entityType: 'run_case',
  entityId: 5,
  body: 'Fan noise\non the second try',
  author: alice,
});
const theirs = makeComment({
  id: 2,
  entityType: 'run_case',
  entityId: 5,
  body: 'Reproduced on FW 2.4',
  author: bob,
});

function handlers(list: CommentDTO[] = [mine, theirs]) {
  return {
    'GET /projects/3/comments': list,
    'POST /projects/3/comments': (c: ApiCall) =>
      makeComment({
        id: 3,
        entityType: 'run_case',
        entityId: 5,
        body: (c.body as CommentDTO).body,
      }),
    'DELETE /projects/3/comments/1': undefined,
    'DELETE /projects/3/comments/2': undefined,
  };
}

const panel = <CommentsPanel entityType="run_case" entityId={5} canComment />;

describe('CommentsPanel', () => {
  it('lists the comments and lets testers delete only their own', async () => {
    const api = mockApi(handlers());
    renderWithProviders(panel, { project: makeProject({ myRole: 'tester' }) });
    expect(await screen.findByText('Reproduced on FW 2.4')).toBeInTheDocument();
    expect(screen.getByText(/Fan noise/)).toHaveClass('whitespace-multiline');
    expect(screen.getByText('Bob Lead')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Delete comment' })).toHaveLength(1);
    const get = api.find('GET', '/projects/3/comments')[0]!;
    expect(Object.fromEntries(get.query)).toEqual({ entityType: 'run_case', entityId: '5' });
  });

  it('lets a lead delete any comment after confirming', async () => {
    const api = mockApi(handlers());
    const { user } = renderWithProviders(panel, { project: makeProject({ myRole: 'lead' }) });
    await screen.findByText('Reproduced on FW 2.4');
    const buttons = screen.getAllByRole('button', { name: 'Delete comment' });
    expect(buttons).toHaveLength(2);
    await user.click(buttons[1]!);
    const confirm = await screen.findByRole('alertdialog');
    expect(confirm).toHaveTextContent('Delete this comment?');
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(api.find('DELETE', '/projects/3/comments/2')).toHaveLength(1));
  });

  it('adds comments with the button and with Ctrl+Enter', async () => {
    const api = mockApi(handlers([]));
    const { user } = renderWithProviders(panel, { project: makeProject({ myRole: 'tester' }) });
    expect(await screen.findByText('No comments yet.')).toBeInTheDocument();
    const box = screen.getByRole('textbox', { name: 'Add a comment' });
    expect(screen.getByRole('button', { name: 'Comment' })).toBeDisabled();
    await user.type(box, 'Looks good');
    await user.click(screen.getByRole('button', { name: 'Comment' }));
    await waitFor(() => expect(box).toHaveValue(''));
    await user.type(box, 'Second note{Control>}{Enter}{/Control}');
    await waitFor(() => expect(api.find('POST', '/projects/3/comments')).toHaveLength(2));
    expect(api.find('POST', '/projects/3/comments').map((c) => c.body)).toEqual([
      { entityType: 'run_case', entityId: 5, body: 'Looks good' },
      { entityType: 'run_case', entityId: 5, body: 'Second note' },
    ]);
  });

  it('hides the comment box without the comment permission', async () => {
    mockApi(handlers([theirs]));
    renderWithProviders(<CommentsPanel entityType="defect" entityId={5} canComment={false} />, {
      project: makeProject({ myRole: 'viewer' }),
    });
    await screen.findByText('Reproduced on FW 2.4');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete comment' })).not.toBeInTheDocument();
  });
});

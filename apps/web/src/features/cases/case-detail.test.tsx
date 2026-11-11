import { describe, expect, it, jest } from '@jest/globals';
import type { ProjectDTO, TestCaseDTO } from '@tmt/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { makeProject, renderWithProviders } from '@/test/render';
import { CaseDetail } from './case-detail';
import { apiError, makeCase, makeComment, makeSuite, member, mockApi, userRef } from './test-utils';

const suite = makeSuite({
  fieldDefs: [{ key: 'test_id', label: 'Test ID', type: 'text', showInTable: true }],
});

function renderDetail(
  testCase: TestCaseDTO,
  {
    project = makeProject(),
    handlers = {},
  }: { project?: ProjectDTO; handlers?: Record<string, unknown> } = {},
) {
  const api = mockApi({
    [`GET /projects/3/cases/${testCase.id}`]: testCase,
    'GET /projects/3/comments': [],
    'GET /projects/3/members': [member(2, 'Bob Lead', 'lead'), member(1, 'Alice Tester', 'tester')],
    ...handlers,
  });
  const callbacks = {
    onClose: jest.fn<() => void>(),
    onEdit: jest.fn<(tc: TestCaseDTO) => void>(),
    onOpenCase: jest.fn<(id: number) => void>(),
  };
  const view = renderWithProviders(
    <CaseDetail
      caseId={testCase.id}
      suite={suite}
      sectionName={(id) => (id === 11 ? 'Power' : null)}
      {...callbacks}
    />,
    { project },
  );
  return { ...view, ...callbacks, api };
}

describe('CaseDetail', () => {
  it('shows the case header, properties and provenance', async () => {
    renderDetail(
      makeCase({
        custom: { test_id: 'T-1' },
        remark: 'Old firmware only',
        summaryGroup: 'Power',
        source: { fileName: 'cases.xlsx', sheet: 'Unit', row: 12 },
        createdBy: userRef(1, 'Alice Tester'),
      }),
    );
    expect(await screen.findByRole('heading', { name: 'Power on the unit' })).toBeInTheDocument();
    expect(screen.getByText('UOT-001')).toBeInTheDocument();
    expect(screen.getByText('1-1')).toBeInTheDocument();
    expect(screen.getByText('15m')).toBeInTheDocument();
    expect(screen.getByText('REQ-1')).toBeInTheDocument();
    expect(screen.getByText('1. Press ON')).toBeInTheDocument();
    expect(screen.getByText('Old firmware only')).toBeInTheDocument();
    expect(screen.getByText('T-1')).toBeInTheDocument();
    expect(
      screen.getByText('Imported from cases.xlsx · sheet “Unit” · row 12'),
    ).toBeInTheDocument();
    expect(screen.getByText(/by Alice Tester · updated .* · version 3/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close case details' })).toBeInTheDocument();
  });

  it('shows the steps of a step-by-step case and warns about deleted shared steps', async () => {
    renderDetail(
      makeCase({
        template: 'steps',
        sectionPath: [],
        steps: [
          { kind: 'step', action: 'Press ON', expected: 'Unit starts' },
          {
            kind: 'shared',
            sharedStepId: 5,
            name: 'Log in',
            steps: [{ action: 'Sign in', expected: '' }],
          },
          { kind: 'shared', sharedStepId: 6, name: 'Gone', steps: [], missing: true },
        ],
      }),
    );
    expect(await screen.findByText('Steps (2)')).toBeInTheDocument();
    expect(screen.getByText('Shared: Log in')).toBeInTheDocument();
    expect(screen.getByText('No section')).toBeInTheDocument();
    expect(
      screen.getByText(/1 shared step used by this case was deleted and add no steps/),
    ).toBeInTheDocument();
  });

  it('edits, clones and deletes the case', async () => {
    const testCase = makeCase();
    const { user, api, onEdit, onOpenCase, onClose } = renderDetail(testCase, {
      handlers: {
        'POST /projects/3/cases/9/clone': makeCase({ id: 31, displayId: 'UOT-031' }),
        'DELETE /projects/3/cases/9': undefined,
      },
    });
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    expect(onEdit).toHaveBeenCalledWith(testCase);
    await user.click(screen.getByRole('button', { name: 'Clone' }));
    await waitFor(() => expect(onOpenCase).toHaveBeenCalledWith(31));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Delete test case UOT-001?' });
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(api.find('DELETE', '/projects/3/cases/9')).toHaveLength(1);
  });

  it('is read only for viewers', async () => {
    renderDetail(makeCase({ status: 'draft' }), { project: makeProject({ myRole: 'viewer' }) });
    await screen.findByRole('heading', { name: 'Power on the unit' });
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submit for review' })).not.toBeInTheDocument();
    expect(screen.getByText('Not reviewed yet.')).toBeInTheDocument();
  });

  it('shows a failed case load with a close button', async () => {
    mockApi({ 'GET /projects/3/cases/9': () => apiError(404, 'NOT_FOUND', 'Case not found') });
    const onClose = jest.fn<() => void>();
    const { user } = renderWithProviders(
      <CaseDetail
        caseId={9}
        suite={suite}
        sectionName={() => null}
        onClose={onClose}
        onEdit={jest.fn()}
        onOpenCase={jest.fn()}
      />,
      { project: makeProject() },
    );
    expect(await screen.findByText('Case not found')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('submits a draft case for review to a chosen lead', async () => {
    const draft = makeCase({ status: 'draft' });
    const { user, api } = renderDetail(draft, {
      project: makeProject({ myRole: 'tester', requireCaseReview: true }),
      handlers: {
        'POST /projects/3/cases/9/submit-review': makeCase({ status: 'in_review' }),
      },
    });
    expect(
      await screen.findByText('Not reviewed yet. A lead’s approval makes the case Ready.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Submit for review' }));
    const dialog = await screen.findByRole('dialog', { name: 'Submit for review' });
    await user.click(within(dialog).getByRole('combobox', { name: 'Reviewer' }));
    expect(screen.queryByRole('option', { name: 'Alice Tester' })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('option', { name: 'Bob Lead' }));
    await user.type(within(dialog).getByLabelText('Note for the reviewer'), 'Please check');
    await user.click(within(dialog).getByRole('button', { name: 'Submit for review' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.find('POST', '/projects/3/cases/9/submit-review')[0]!.body).toEqual({
      reviewerId: 2,
      note: 'Please check',
    });
  });

  it('shows a rejected reviewer at the field', async () => {
    const { user } = renderDetail(makeCase({ status: 'draft' }), {
      handlers: {
        'POST /projects/3/cases/9/submit-review': () =>
          apiError(422, 'BAD_REVIEWER', 'The reviewer must be a lead of the project'),
      },
    });
    await user.click(await screen.findByRole('button', { name: 'Submit for review' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Submit for review' }));
    expect(
      await within(dialog).findByText('The reviewer must be a lead of the project'),
    ).toBeInTheDocument();
  });

  it('lets a lead request changes (note required) and approve', async () => {
    const inReview = makeCase({
      status: 'in_review',
      review: {
        reviewer: userRef(2, 'Bob Lead'),
        requestedBy: userRef(1, 'Alice Tester'),
        requestedAt: '2026-01-02T00:00:00.000Z',
        reviewedBy: null,
        reviewedAt: null,
        note: 'Updated step 2',
      },
    });
    const { user, api } = renderDetail(inReview, {
      handlers: {
        'POST /projects/3/cases/9/review': (call: { body: { decision: string } }) =>
          makeCase({ status: call.body.decision === 'approve' ? 'ready' : 'draft' }),
      },
    });
    const review = await screen.findByRole('region', { name: 'Review' });
    expect(review).toHaveTextContent('Waiting for Bob Lead');
    expect(review).toHaveTextContent('Requested by Alice Tester');
    expect(review).toHaveTextContent('Updated step 2');

    await user.click(within(review).getByRole('button', { name: 'Request changes' }));
    let dialog = await screen.findByRole('dialog', { name: 'Request changes' });
    await user.click(within(dialog).getByRole('button', { name: 'Request changes' }));
    expect(within(dialog).getByText('Say what needs to change')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('What needs to change?'), 'Fix step 2');
    await user.click(within(dialog).getByRole('button', { name: 'Request changes' }));
    await waitFor(() => expect(api.find('POST', '/projects/3/cases/9/review')).toHaveLength(1));
    expect(api.find('POST', '/projects/3/cases/9/review')[0]!.body).toEqual({
      decision: 'request_changes',
      note: 'Fix step 2',
    });

    await user.click(within(review).getByRole('button', { name: 'Approve' }));
    dialog = await screen.findByRole('dialog', { name: 'Approve test case' });
    await user.click(within(dialog).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(api.find('POST', '/projects/3/cases/9/review')).toHaveLength(2));
    expect(api.find('POST', '/projects/3/cases/9/review')[1]!.body).toEqual({
      decision: 'approve',
      note: '',
    });
  });

  it('summarises an approved case and offers to submit it again', async () => {
    renderDetail(
      makeCase({
        review: {
          reviewer: null,
          requestedBy: userRef(1, 'Alice Tester'),
          requestedAt: '2026-01-02T00:00:00.000Z',
          reviewedBy: userRef(2, 'Bob Lead'),
          reviewedAt: '2026-01-03T00:00:00.000Z',
          note: null,
        },
      }),
    );
    const review = await screen.findByRole('region', { name: 'Review' });
    expect(review).toHaveTextContent('Approved by Bob Lead');
    expect(review).toHaveTextContent('Submitted by Alice Tester');
    expect(
      within(review).getByRole('button', { name: 'Submit for review again' }),
    ).toBeInTheDocument();
  });

  it('hides the review panel of a deprecated case without history', async () => {
    renderDetail(makeCase({ status: 'deprecated' }));
    await screen.findByRole('heading', { name: 'Power on the unit' });
    expect(screen.queryByRole('region', { name: 'Review' })).not.toBeInTheDocument();
  });

  it('posts comments with Ctrl+Enter and deletes own comments', async () => {
    const { user, api } = renderDetail(makeCase(), {
      project: makeProject({ myRole: 'tester' }),
      handlers: {
        'GET /projects/3/comments': [
          makeComment(),
          makeComment({ id: 8, author: userRef(2, 'Bob Lead'), body: 'Not yours' }),
        ],
        'POST /projects/3/comments': makeComment({ id: 9, body: 'Looks good' }),
        'DELETE /projects/3/comments/7': undefined,
      },
    });
    await user.click(await screen.findByRole('tab', { name: /Comments/ }));
    expect(screen.getByRole('tab', { name: /Comments/ })).toHaveTextContent('2');
    expect(await screen.findByText('Check the fan too')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Delete comment' })).toHaveLength(1);
    await user.type(screen.getByLabelText('New comment'), 'Looks good');
    await user.keyboard('{Control>}{Enter}{/Control}');
    await waitFor(() => expect(api.find('POST', '/projects/3/comments')).toHaveLength(1));
    expect(api.find('POST', '/projects/3/comments')[0]!.body).toEqual({
      entityType: 'test_case',
      entityId: 9,
      body: 'Looks good',
    });
    await waitFor(() => expect(screen.getByLabelText('New comment')).toHaveValue(''));
    await user.click(screen.getByRole('button', { name: 'Delete comment' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }),
    );
    await waitFor(() => expect(api.find('DELETE', '/projects/3/comments/7')).toHaveLength(1));
  });

  it('lists the results of the case in runs', async () => {
    const { user } = renderDetail(makeCase(), {
      handlers: {
        'GET /projects/3/cases/9/runs': [
          {
            runCaseId: 1,
            runId: 7,
            runCode: 'R1',
            planId: 4,
            planDocNo: '26TR-01',
            planTitle: 'FW 2.4 regression',
            releaseName: 'FW 2.4',
            status: 'ng',
            actualResult: 'Fan stays off',
            executedBy: userRef(1, 'Alice Tester'),
            executedAt: '2026-01-05T00:00:00.000Z',
          },
        ],
      },
    });
    await user.click(await screen.findByRole('tab', { name: 'Results' }));
    expect(await screen.findByRole('link', { name: '26TR-01' })).toHaveAttribute(
      'href',
      '/projects/3/plans/4',
    );
    expect(screen.getByRole('link', { name: 'Run R1' })).toHaveAttribute(
      'href',
      '/projects/3/runs/7',
    );
    expect(screen.getByText('NG')).toBeInTheDocument();
    expect(screen.getByText('Fan stays off')).toBeInTheDocument();
  });

  it('shows the version history with the changed fields', async () => {
    const { user } = renderDetail(makeCase(), {
      handlers: {
        'GET /projects/3/cases/9/versions': [
          {
            version: 3,
            data: { title: 'Power on', sectionId: 11 },
            changedBy: userRef(1, 'Alice Tester'),
            changedAt: '2026-01-03T00:00:00.000Z',
          },
          {
            version: 2,
            data: { title: 'Power', sectionId: 11 },
            changedBy: null,
            changedAt: '2026-01-02T00:00:00.000Z',
          },
          {
            version: 1,
            data: { title: 'Power', sectionId: 11 },
            changedBy: null,
            changedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
    });
    await user.click(await screen.findByRole('tab', { name: 'History' }));
    expect(await screen.findByText('Changed: Title')).toBeInTheDocument();
    expect(screen.getByText('No visible field changes')).toBeInTheDocument();
    expect(screen.getByText('Created')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show details' }));
    expect(screen.getByRole('cell', { name: 'Power on' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide details' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('copies a link to the case', async () => {
    renderDetail(makeCase());
    expect(
      await screen.findByRole('button', { name: 'Copy link to this case' }),
    ).toBeInTheDocument();
  });
});

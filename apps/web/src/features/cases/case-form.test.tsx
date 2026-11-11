import { describe, expect, it, jest } from '@jest/globals';
import type { ProjectDTO, TestCaseDTO } from '@tmt/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { makeProject, renderWithProviders } from '@/test/render';
import { CaseFormDialog } from './case-form';
import { apiError, makeCase, makeSharedStep, makeSuite, makeTree, mockApi } from './test-utils';

const suite = makeSuite({
  fieldDefs: [
    { key: 'test_id', label: 'Test ID', type: 'text', showInTable: true },
    {
      key: 'register',
      label: 'Register',
      type: 'select',
      options: ['40001', '40002'],
      showInTable: false,
    },
    { key: 'notes', label: 'Notes', type: 'longtext', showInTable: false },
  ],
});

function renderForm({
  testCase = null,
  project = makeProject(),
  handlers = {},
}: {
  testCase?: TestCaseDTO | null;
  project?: ProjectDTO;
  handlers?: Record<string, unknown>;
} = {}) {
  const api = mockApi({
    'GET /projects/3/tags': [{ tag: 'smoke', count: 2 }],
    'GET /projects/3/shared-steps': [makeSharedStep()],
    ...handlers,
  });
  const onClose = jest.fn<(saved?: TestCaseDTO) => void>();
  const view = renderWithProviders(
    <CaseFormDialog
      open
      formKey={1}
      projectId={3}
      suite={suite}
      tree={makeTree()}
      testCase={testCase}
      defaultSectionId={11}
      onClose={onClose}
    />,
    { project },
  );
  const dialog = screen.getByRole('dialog');
  return { ...view, api, onClose, dialog };
}

describe('CaseFormDialog', () => {
  it('creates a case with every kind of field', async () => {
    const saved = makeCase({ id: 30, displayId: 'UOT-003' });
    const { user, api, onClose, dialog } = renderForm({
      handlers: { 'POST /projects/3/suites/1/cases': saved },
    });
    expect(dialog).toHaveAccessibleName('New test case · Unit operation test');
    expect(within(dialog).getByRole('combobox', { name: 'Section' })).toHaveTextContent('Power');
    await user.type(within(dialog).getByLabelText('Title'), 'Fan speed');
    await user.type(within(dialog).getByLabelText('Case code'), '3-2-1');
    await user.click(within(dialog).getByRole('radio', { name: 'Abnormal' }));
    await user.click(within(dialog).getByRole('combobox', { name: 'Priority' }));
    await user.click(await screen.findByRole('option', { name: 'Critical' }));
    await user.type(within(dialog).getByLabelText('Tags'), 'wifi;');
    await user.type(within(dialog).getByLabelText('Tags'), 'smo');
    await user.click(await screen.findByRole('option', { name: 'smoke' }));
    await user.type(within(dialog).getByLabelText('Estimate'), '90');
    expect(within(dialog).getByText('1h 30m')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('References'), 'REQ-7');
    await user.type(within(dialog).getByLabelText('Precondition'), 'Unit off');
    await user.type(within(dialog).getByLabelText('Procedure'), '1. Press ON');
    await user.type(within(dialog).getByLabelText('Expected result'), '1. Fan runs');
    await user.type(within(dialog).getByLabelText('Test ID'), 'T-9');
    await user.click(within(dialog).getByRole('combobox', { name: 'Register' }));
    await user.click(await screen.findByRole('option', { name: '40002' }));
    await user.type(within(dialog).getByLabelText('Notes'), 'Check twice');
    await user.click(within(dialog).getByRole('button', { name: 'Create case' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledWith(saved));
    expect(api.find('POST', '/projects/3/suites/1/cases')[0]!.body).toEqual({
      sectionId: 11,
      code: '3-2-1',
      title: 'Fan speed',
      caseType: 'Abnormal',
      status: 'ready',
      priority: 'critical',
      tags: ['wifi', 'smoke'],
      estimateMinutes: 90,
      references: 'REQ-7',
      template: 'text',
      precondition: 'Unit off',
      procedure: '1. Press ON',
      expected: '1. Fan runs',
      steps: [],
      remark: '',
      summaryGroup: '',
      custom: { test_id: 'T-9', register: '40002', notes: 'Check twice' },
    });
  });

  it('shows the validation errors next to the fields and sends nothing', async () => {
    const { user, api, dialog } = renderForm();
    await user.type(within(dialog).getByLabelText('Estimate'), '-5');
    await user.type(within(dialog).getByLabelText('Tags'), `${'x'.repeat(51)}{Enter}`);
    await user.click(within(dialog).getByRole('button', { name: 'Create case' }));
    expect(await within(dialog).findByText('Required')).toBeInTheDocument();
    expect(within(dialog).getByText('Must be at least 0')).toBeInTheDocument();
    expect(within(dialog).getByText('Use at most 50 characters')).toBeInTheDocument();
    expect(api.find('POST', '/projects/3/suites/1/cases')).toHaveLength(0);
    await user.type(within(dialog).getByLabelText('Title'), 'Now valid');
    await waitFor(() => expect(within(dialog).queryByText('Required')).not.toBeInTheDocument());
  });

  it('sends only the changed fields with the edited version', async () => {
    const testCase = makeCase();
    const saved = makeCase({ title: 'Power on twice', version: 4 });
    const { user, api, onClose, dialog } = renderForm({
      testCase,
      handlers: { 'PATCH /projects/3/cases/9': saved },
    });
    expect(dialog).toHaveAccessibleName('Edit UOT-001');
    const title = within(dialog).getByLabelText('Title');
    await user.clear(title);
    await user.type(title, 'Power on twice');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledWith(saved));
    expect(api.find('PATCH', '/projects/3/cases/9')[0]!.body).toEqual({
      version: 3,
      title: 'Power on twice',
    });
  });

  it('closes without a request when nothing changed', async () => {
    const { user, api, onClose, dialog } = renderForm({ testCase: makeCase() });
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledWith());
    expect(api.find('PATCH', '/projects/3/cases/9')).toHaveLength(0);
  });

  it('offers the latest version after a conflict', async () => {
    const latest = makeCase({ title: 'Changed by Bob', version: 5 });
    const { user, api, dialog } = renderForm({
      testCase: makeCase(),
      handlers: {
        'PATCH /projects/3/cases/9': (call: { body: { version: number } }) =>
          call.body.version === 3 ? apiError(409, 'VERSION_CONFLICT') : latest,
        'GET /projects/3/cases/9': latest,
      },
    });
    await user.type(within(dialog).getByLabelText('Remark'), 'mine');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText('Changed by someone else')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: 'Load latest version' }));
    await waitFor(() =>
      expect(within(dialog).getByLabelText('Title')).toHaveValue('Changed by Bob'),
    );
    expect(within(dialog).queryByText('Changed by someone else')).not.toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Remark'), 'again');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.find('PATCH', '/projects/3/cases/9')).toHaveLength(2));
    expect(api.find('PATCH', '/projects/3/cases/9')[1]!.body).toEqual({
      version: 5,
      remark: 'again',
    });
  });

  it('shows a taken case code at the field', async () => {
    const { user, dialog } = renderForm({
      handlers: { 'POST /projects/3/suites/1/cases': () => apiError(409, 'CASE_CODE_TAKEN') },
    });
    await user.type(within(dialog).getByLabelText('Title'), 'Dup');
    await user.type(within(dialog).getByLabelText('Case code'), '1-1');
    await user.click(within(dialog).getByRole('button', { name: 'Create case' }));
    expect(
      await within(dialog).findByText('Another case in this suite uses this code'),
    ).toBeInTheDocument();
  });

  it('converts numbered text to steps and back', async () => {
    const testCase = makeCase({ procedure: '1. Press ON\n2. Wait', expected: '2. Fan runs' });
    const { user, api, dialog } = renderForm({
      testCase,
      handlers: { 'PATCH /projects/3/cases/9': testCase },
    });
    await user.click(within(dialog).getByRole('radio', { name: 'Steps' }));
    await user.click(
      within(dialog).getByRole('button', { name: 'Convert numbered lines to steps' }),
    );
    expect(within(dialog).getByLabelText('Step 1 action')).toHaveValue('Press ON');
    expect(within(dialog).getByLabelText('Step 2 expected result')).toHaveValue('Fan runs');
    await user.click(within(dialog).getByRole('button', { name: 'Move step 2 up' }));
    expect(within(dialog).getByLabelText('Step 1 action')).toHaveValue('Wait');

    await user.click(within(dialog).getByRole('radio', { name: 'Text' }));
    expect(within(dialog).getByText(/This case also has steps/)).toBeInTheDocument();
    await user.click(
      within(dialog).getByRole('button', { name: 'Replace the text with the steps' }),
    );
    expect(within(dialog).getByLabelText('Procedure')).toHaveValue('1. Wait\n2. Press ON');
    expect(within(dialog).getByLabelText('Expected result')).toHaveValue('1. Fan runs');

    await user.click(within(dialog).getByRole('radio', { name: 'Steps' }));
    await user.click(within(dialog).getByRole('button', { name: 'Remove step 2' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.find('PATCH', '/projects/3/cases/9')).toHaveLength(1));
    expect(api.find('PATCH', '/projects/3/cases/9')[0]!.body).toEqual({
      version: 3,
      template: 'steps',
      procedure: '1. Wait\n2. Press ON',
      expected: '1. Fan runs',
      steps: [{ kind: 'step', action: 'Wait', expected: 'Fan runs' }],
    });
  });

  it('starts a step-by-step case with one empty step and inserts shared steps', async () => {
    const { user, api, dialog } = renderForm({
      handlers: { 'POST /projects/3/suites/1/cases': makeCase() },
    });
    await user.type(within(dialog).getByLabelText('Title'), 'Login');
    await user.click(within(dialog).getByRole('radio', { name: 'Steps' }));
    expect(within(dialog).getByLabelText('Step 1 action')).toHaveValue('');
    await user.click(within(dialog).getByRole('button', { name: 'Insert shared steps…' }));
    const picker = await screen.findByRole('dialog', { name: 'Insert shared steps' });
    expect(within(picker).getByRole('option', { name: /Log in to the app/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(within(picker).getByText('Sign in')).toBeInTheDocument();
    await user.click(within(picker).getByRole('button', { name: 'Insert shared steps' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Insert shared steps' })).not.toBeInTheDocument(),
    );
    expect(within(dialog).getByText('Shared · 2 steps')).toBeInTheDocument();
    expect(within(dialog).queryByLabelText('Step 1 action')).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Add step' }));
    await user.type(within(dialog).getByLabelText('Step 3 action'), 'Open settings');
    await user.click(within(dialog).getByRole('button', { name: 'Create case' }));
    await waitFor(() => expect(api.find('POST', '/projects/3/suites/1/cases')).toHaveLength(1));
    expect(api.find('POST', '/projects/3/suites/1/cases')[0]!.body).toMatchObject({
      template: 'steps',
      steps: [
        { kind: 'shared', sharedStepId: 5 },
        { kind: 'step', action: 'Open settings', expected: '' },
      ],
    });
  });

  it('keeps Ready for leads under review rules and warns before a ready case goes back', async () => {
    const tester = makeProject({ myRole: 'tester', requireCaseReview: true });
    const { user, dialog } = renderForm({ project: tester });
    expect(within(dialog).getByRole('combobox', { name: 'Status' })).toHaveTextContent('Draft');
    expect(within(dialog).getByText('Ready after a lead’s review')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('combobox', { name: 'Status' }));
    expect(await screen.findByRole('option', { name: 'Ready' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('warns that saving content changes moves a ready case back to draft', async () => {
    const tester = makeProject({ myRole: 'tester', requireCaseReview: true });
    const { user, dialog } = renderForm({ project: tester, testCase: makeCase() });
    expect(
      within(dialog).queryByText('Saving moves this case back to Draft for review'),
    ).not.toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Title'), '!');
    expect(
      within(dialog).getByText('Saving moves this case back to Draft for review'),
    ).toBeInTheDocument();
  });

  it('shows a case in review with its status locked', () => {
    const { dialog } = renderForm({ testCase: makeCase({ status: 'in_review' }) });
    const status = within(dialog).getByRole('combobox', { name: 'Status' });
    expect(status).toHaveTextContent('In review');
    expect(status).toBeDisabled();
    expect(within(dialog).getByText('Decided in review')).toBeInTheDocument();
  });
});

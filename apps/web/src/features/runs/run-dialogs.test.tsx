import { beforeEach, describe, expect, it } from '@jest/globals';
import { act, screen, waitFor, within } from '@testing-library/react';
import { mockRouter } from '@/test/mocks/next-navigation';
import { apiError, makeSection, makeTree, paged } from '../cases/test-utils';
import { renderRun, run, wideScreen } from './run-test-setup';
import { installFakeXhr, makeDefect, makeDefectItem, makeRun } from './test-fixtures';

async function openMore(user: ReturnType<typeof renderRun>['user'], item: string) {
  await screen.findByRole('heading', { name: 'Fan speed' });
  await user.click(screen.getByRole('button', { name: 'More' }));
  await user.click(await screen.findByRole('menuitem', { name: item }));
  return screen.findByRole('dialog');
}

const junitResult = (dryRun: boolean) => ({
  dryRun,
  importId: dryRun ? null : 4,
  fileName: 'report.xml',
  totals: { tests: 3, matched: 2, unmatched: 1, updatedRunCases: 2, createdCases: 0 },
  counts: { untested: 0, ok: 1, ng: 1, ok_cond: 0, blocked: 0, nt: 0, na: 0 },
  items: [
    {
      runCaseId: 102,
      displayId: 'UOT-002',
      title: 'Fan speed',
      previous: 'untested',
      status: 'ok',
      tests: 1,
      created: false,
    },
  ],
  unmatched: [{ name: 'test_extra', classname: 'suite.a', status: 'ng', reason: 'no_match' }],
});

describe('run dialogs', () => {
  beforeEach(() => wideScreen());

  it('edits the run and shows a taken Test ID next to the field', async () => {
    let attempts = 0;
    const { user, api } = renderRun('/projects/3/runs/7?case=102', {
      handlers: {
        'PATCH /projects/3/runs/7': () =>
          ++attempts === 1
            ? apiError(409, 'RUN_CODE_TAKEN')
            : makeRun({ code: 'KR_02', judgement: 'pass' }),
      },
    });
    await screen.findByRole('heading', { name: 'Fan speed' });
    await user.click(screen.getByRole('button', { name: 'Edit run' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit run KR_01' });
    const code = within(dialog).getByLabelText('Test ID');
    await user.clear(code);
    await user.type(code, 'KR_02');
    await user.click(within(dialog).getByRole('button', { name: 'Add value' }));
    await user.type(within(dialog).getByLabelText('Environment label 3'), 'Phone');
    await user.type(within(dialog).getByLabelText('Environment value 3'), 'Pixel 9');
    await user.click(within(dialog).getByRole('button', { name: 'Add value' }));
    await user.click(within(dialog).getByRole('button', { name: 'Remove environment value 1' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(
      await within(dialog).findByText('Another run of this plan uses this Test ID'),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.find('PATCH', '/projects/3/runs/7')).toHaveLength(2));
    expect(api.find('PATCH', '/projects/3/runs/7')[1]!.body).toEqual({
      code: 'KR_02',
      scenario: 'Korea model',
      testerId: 1,
      testedDate: '2026-11-01',
      dueDate: '',
      judgement: null,
      judgementNote: '',
      remark: '',
      environment: [
        { label: 'Router', value: 'ASUS AX' },
        { label: 'Phone', value: 'Pixel 9' },
      ],
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('validates the run form', async () => {
    const { user, api } = renderRun();
    await screen.findByRole('heading', { name: 'Fan speed' });
    await user.click(screen.getByRole('button', { name: 'Edit run' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit run KR_01' });
    await user.clear(within(dialog).getByLabelText('Test ID'));
    await user.clear(within(dialog).getByLabelText('Environment label 1'));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findAllByText('Required')).toHaveLength(2);
    expect(api.find('PATCH', '/projects/3/runs/7')).toHaveLength(0);
  });

  it('adds library cases with filters', async () => {
    const tree = makeTree([
      makeSection({ id: 11, name: 'Power', totalCount: 3 }),
      makeSection({
        id: 12,
        name: 'Network',
        code: 'N',
        children: [makeSection({ id: 13, parentId: 12, name: 'Wi-Fi' })],
      }),
    ]);
    const { user, api } = renderRun('/projects/3/runs/7?case=102', {
      handlers: {
        'GET /projects/3/suites/1/sections': tree,
        'GET /projects/3/tags': [{ tag: 'smoke', count: 4 }],
        'POST /projects/3/runs/7/cases': { added: 3 },
      },
    });
    const dialog = await openMore(user, 'Add cases…');
    expect(dialog).toHaveTextContent('Cases come from suite Unit operation test');
    await user.click(await within(dialog).findByRole('combobox', { name: 'Sections' }));
    await user.click(await screen.findByRole('option', { name: /Wi-Fi/ }));
    await user.keyboard('{Escape}');
    await user.click(within(dialog).getByRole('button', { name: 'High' }));
    await user.click(within(dialog).getByRole('combobox', { name: 'Tags' }));
    await user.click(await screen.findByRole('option', { name: 'smoke (4)' }));
    await user.keyboard('{Escape}');
    await user.click(within(dialog).getByRole('checkbox', { name: 'In review' }));
    await user.click(within(dialog).getByRole('button', { name: 'Add cases' }));
    await waitFor(() => expect(api.find('POST', '/projects/3/runs/7/cases')).toHaveLength(1));
    expect(api.find('POST', '/projects/3/runs/7/cases')[0]!.body).toEqual({
      sectionIds: [13],
      priorities: ['high'],
      tags: ['smoke'],
      caseStatuses: ['ready', 'in_review'],
    });
  });

  it('creates a re-run of the failed cases and opens it', async () => {
    const { user, api } = renderRun('/projects/3/runs/7?case=102', {
      handlers: {
        'POST /projects/3/runs/7/rerun': makeRun({
          id: 8,
          code: 'KR_01_R2',
          sourceRun: { id: 7, code: 'KR_01' },
        }),
      },
    });
    const dialog = await openMore(user, 'Re-run…');
    expect(within(dialog).getByLabelText('Test ID of the re-run')).toHaveValue('KR_01_R2');
    expect(within(dialog).getByRole('checkbox', { name: 'NG (1)' })).toBeChecked();
    expect(within(dialog).getByText('1 case will be in the re-run')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('checkbox', { name: 'Untested (2)' }));
    expect(within(dialog).getByText('3 cases will be in the re-run')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('switch', { name: 'Keep case assignees' }));
    await user.click(within(dialog).getByRole('button', { name: 'Create re-run' }));
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith('/projects/3/runs/8'));
    expect(api.find('POST', '/projects/3/runs/7/rerun')[0]!.body).toEqual({
      code: 'KR_01_R2',
      scenario: 'Korea model',
      statuses: ['ng', 'untested'],
      copyEnvironment: true,
      testerId: 1,
      keepAssignees: false,
      refreshFromLibrary: false,
    });
  });

  it('explains a re-run without matching cases', async () => {
    const { user } = renderRun('/projects/3/runs/7?case=102', {
      handlers: {
        'POST /projects/3/runs/7/rerun': apiError(422, 'NO_CASES', 'No case has these results.'),
      },
    });
    const dialog = await openMore(user, 'Re-run…');
    await user.click(within(dialog).getByRole('button', { name: 'Create re-run' }));
    expect(await within(dialog).findByText('No case has these results.')).toBeInTheDocument();
  });

  it('previews and applies a JUnit report', async () => {
    const requests = installFakeXhr();
    const { user } = renderRun();
    const dialog = await openMore(user, 'Upload JUnit results…');
    const input = dialog.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(['<testsuite/>'], 'report.xml', { type: 'text/xml' }));
    expect(await within(dialog).findByText('report.xml')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('switch', { name: 'Create missing cases' }));
    await user.click(within(dialog).getByRole('button', { name: 'Preview' }));
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]!.url).toBe(
      '/api/v1/projects/3/runs/7/junit?matchBy=auto&skippedAs=nt&createMissing=true&dryRun=true',
    );
    expect((requests[0]!.body.get('file') as File).name).toBe('report.xml');
    act(() => requests[0]!.progress(0.4));
    expect(within(dialog).getByRole('progressbar', { name: 'Upload' })).toBeInTheDocument();
    await act(async () => requests[0]!.respond(200, junitResult(true)));
    expect(await within(dialog).findByText(/nothing has been saved yet/)).toBeInTheDocument();
    expect(within(dialog).getByText('Run cases that will change (1)')).toBeInTheDocument();
    expect(within(dialog).getByText('test_extra')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Apply results' }));
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1]!.url).toContain('dryRun=false');
    await act(async () => requests[1]!.respond(200, junitResult(false)));
    expect(await within(dialog).findByText('Imported')).toBeInTheDocument();
    await user.click(within(dialog).getAllByRole('button', { name: 'Close' })[0]!);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('shows a rejected JUnit file', async () => {
    const requests = installFakeXhr();
    const { user } = renderRun();
    const dialog = await openMore(user, 'Upload JUnit results…');
    const input = dialog.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(['x'], 'report.xml', { type: 'text/xml' }));
    await user.click(await within(dialog).findByRole('button', { name: 'Preview' }));
    await waitFor(() => expect(requests).toHaveLength(1));
    await act(async () =>
      requests[0]!.respond(422, { error: { code: 'BAD_XML', message: 'No <testcase> found' } }),
    );
    expect(await within(dialog).findByText('No <testcase> found')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Remove the selected file' }));
    expect(within(dialog).getByRole('button', { name: 'Preview' })).toBeDisabled();
  });

  it('creates a defect prefilled from an NG result and links it', async () => {
    const { user, api } = renderRun('/projects/3/runs/7?case=103', {
      handlers: {
        'GET /projects/3/plans/2': { id: 2, release: { id: 4, name: 'FW 2.4.0' } },
        'GET /projects/3/releases': [],
        'POST /projects/3/defects': makeDefect({ id: 20, key: 'BUG-20' }),
      },
    });
    await screen.findByRole('heading', { name: 'Wi-Fi pairing' });
    await user.click(screen.getByRole('button', { name: 'Create defect from this result' }));
    const dialog = await screen.findByRole('dialog', { name: 'New defect from UOT-003' });
    expect(await within(dialog).findByLabelText('Title')).toHaveValue('[UOT-003] Wi-Fi pairing');
    expect(dialog).toHaveTextContent('The defect will be linked to UOT-003 in run KR_01.');
    expect(within(dialog).getByLabelText('Actual result')).toHaveValue('Pairing fails');
    expect(within(dialog).getByLabelText('External key')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Create defect' }));
    await waitFor(() => expect(api.find('POST', '/projects/3/defects')).toHaveLength(1));
    expect(api.find('POST', '/projects/3/defects')[0]!.body).toMatchObject({
      title: '[UOT-003] Wi-Fi pairing',
      steps: 'Precondition:\nUnit is installed\n\nPress ON',
      expected: 'Unit starts',
      actual: 'Pairing fails',
      environment: 'FW version: 2.4.0\nRouter: ASUS AX',
      foundIn: 'FW version 2.4.0',
      severity: 'major',
      priority: 'medium',
      releaseId: 4,
      runCaseId: 103,
      externalKey: null,
    });
  });

  it('links an existing defect to a run case', async () => {
    const { user, api } = renderRun('/projects/3/runs/7?case=102', {
      handlers: {
        'GET /projects/3/defects': paged([
          makeDefectItem(),
          makeDefectItem({ id: 13, key: 'BUG-13', title: 'Noise' }),
        ]),
        'POST /projects/3/defects/12/links': makeDefect(),
      },
    });
    await screen.findByRole('heading', { name: 'Fan speed' });
    expect(await screen.findByText('No linked defects.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create defect' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Link existing defect' }));
    const dialog = await screen.findByRole('dialog', { name: 'Link a defect to UOT-002' });
    await user.type(within(dialog).getByLabelText('Search defects'), 'fan');
    await waitFor(() =>
      expect(
        api.calls.some((c) => c.path === '/projects/3/defects' && c.query.get('q') === 'fan'),
      ).toBe(true),
    );
    await user.click(
      await within(dialog).findByRole('button', { name: 'Link BUG-12 Fan does not start' }),
    );
    await waitFor(() => expect(api.find('POST', '/projects/3/defects/12/links')).toHaveLength(1));
    expect(api.find('POST', '/projects/3/defects/12/links')[0]!.body).toEqual({ runCaseId: 102 });
    expect(run.code).toBe('KR_01');
  });
});

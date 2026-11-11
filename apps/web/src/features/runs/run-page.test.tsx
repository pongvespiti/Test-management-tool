import { beforeEach, describe, expect, it } from '@jest/globals';
import { screen, waitFor, within } from '@testing-library/react';
import { urlParams } from '../cases/test-utils';
import { draftsKey } from './drafts';
import { cases, rc2, rc3, rc4, renderRun, savedRow, wideScreen } from './run-test-setup';
import { alice, bob, makeDetail, makeRun } from './test-fixtures';

const caseRow = (id: string) => screen.getByRole('row', { name: new RegExp(id) });

describe('RunPage', () => {
  beforeEach(() => wideScreen());

  it('shows the run, its summary and the cases by section; opens the first untested case', async () => {
    const { sync } = renderRun('/projects/3/runs/7');
    expect(await screen.findByRole('heading', { name: 'Korea model' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '26TR-TEAM-11-001' })).toHaveAttribute(
      'href',
      '/projects/3/plans/2',
    );
    expect(screen.getByRole('link', { name: 'Run report' })).toHaveAttribute(
      'href',
      '/projects/3/runs/7/report',
    );
    expect(screen.getByText('2 / 4')).toBeInTheDocument();
    expect(screen.getByText('Suggested: NOT PASS')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Power 2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Network › Wi-Fi 2' })).toBeInTheDocument();
    expect(caseRow('UOT-003')).toHaveTextContent('Wi-Fi pairing');
    await waitFor(() => expect(urlParams().case).toBe('102'));
    sync();
    expect(await screen.findByRole('heading', { name: 'Fan speed' })).toBeInTheDocument();
    expect(caseRow('UOT-002')).toHaveAttribute('aria-selected', 'true');
  });

  it('filters the cases from the URL and keeps a hidden open case', async () => {
    const { user, sync } = renderRun('/projects/3/runs/7?case=102&status=ng');
    expect(await screen.findByRole('row', { name: /UOT-003/ })).toBeInTheDocument();
    expect(screen.queryByRole('row', { name: /UOT-001/ })).not.toBeInTheDocument();
    expect(screen.getByText('1 of 4')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'UOT-002 stays open but the filters hide it in the list.',
    );
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(urlParams()).toEqual({ case: '102' });
    sync();
    expect(await screen.findByRole('row', { name: /UOT-001/ })).toBeInTheDocument();
  });

  it('updates the URL from the legend, the search box and the filter menus', async () => {
    const { user, sync } = renderRun('/projects/3/runs/7?case=102');
    await screen.findByRole('heading', { name: 'Fan speed' });
    await user.click(screen.getByRole('button', { name: '1 NG' }));
    expect(urlParams().status).toBe('ng');
    sync();
    expect(screen.getByRole('button', { name: '1 NG' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: '1 NG' }));
    expect(urlParams().status).toBeUndefined();
    sync();

    await user.type(screen.getByLabelText('Filter cases by id, code or title'), 'wi-fi{Enter}');
    expect(urlParams().q).toBe('wi-fi');
    sync();
    expect(screen.queryByRole('row', { name: /UOT-001/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(urlParams().q).toBeUndefined();
    sync();

    await user.click(screen.getByRole('button', { name: 'Result: All' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Untested' }));
    expect(urlParams().status).toBe('untested');
    await user.keyboard('{Escape}');
    sync();

    await user.click(screen.getByRole('combobox', { name: 'Filter by assignee' }));
    await user.click(await screen.findByRole('option', { name: 'Assigned to me' }));
    expect(urlParams().assignee).toBe('me');
    sync();
    await user.click(screen.getByRole('combobox', { name: 'Filter by section' }));
    await user.click(await screen.findByRole('option', { name: /Wi-Fi/ }));
    expect(urlParams().section).toBe('Network › Wi-Fi');
    sync();
    expect(screen.getByText('1 of 4')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(urlParams()).toEqual({ case: '102' });
  });

  it('records a result with the keyboard and moves on to the next case', async () => {
    const { user, api } = renderRun('/projects/3/runs/7?case=102', {
      handlers: { 'PUT /projects/3/run-cases/102/result': savedRow(rc2) },
    });
    await screen.findByRole('heading', { name: 'Fan speed' });
    await user.keyboard('n');
    expect(screen.getByRole('button', { name: 'NG', pressed: true })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Actual result'), 'Fan stays off');
    expect(screen.getByText('Unsaved changes', { selector: '[role=status]' })).toBeInTheDocument();
    await user.keyboard('{Control>}{Enter}{/Control}');
    await waitFor(() =>
      expect(api.find('PUT', '/projects/3/run-cases/102/result')).toHaveLength(1),
    );
    expect(api.find('PUT', '/projects/3/run-cases/102/result')[0]!.body).toEqual({
      status: 'ng',
      actualResult: 'Fan stays off',
      remark: '',
    });
    expect(urlParams().case).toBe('103');
  });

  it('records step results, applies the suggested result and saves', async () => {
    const { user, api } = renderRun('/projects/3/runs/7?case=104', {
      handlers: { 'PUT /projects/3/run-cases/104/result': savedRow(rc4) },
    });
    await screen.findByRole('heading', { name: 'Timer schedule' });
    expect(screen.getByText('Timer basics')).toBeInTheDocument();
    await user.click(
      within(screen.getByRole('listitem', { name: 'Step 1' })).getByRole('button', { name: 'OK' }),
    );
    const step2 = screen.getByRole('listitem', { name: 'Step 2' });
    await user.click(within(step2).getByRole('button', { name: 'NG' }));
    await user.type(within(step2).getByLabelText('Actual result of step 2'), 'Not saved');
    expect(screen.getByText('2 of 2 executed')).toBeInTheDocument();
    expect(screen.getByText('All steps executed — suggested result')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(screen.getAllByRole('button', { name: 'NG', pressed: true })).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(api.find('PUT', '/projects/3/run-cases/104/result')).toHaveLength(1),
    );
    expect(api.find('PUT', '/projects/3/run-cases/104/result')[0]!.body).toEqual({
      status: 'ng',
      actualResult: '',
      remark: '',
      stepResults: [
        { status: 'ok', actual: '' },
        { status: 'ng', actual: 'Not saved' },
      ],
    });
    expect(urlParams().case).toBe('104');
  });

  it('keeps unsaved results per case while moving with J/K and after a reload', async () => {
    const first = renderRun('/projects/3/runs/7?case=102');
    const { user, sync } = first;
    await screen.findByRole('heading', { name: 'Fan speed' });
    await user.type(screen.getByLabelText('Actual result'), 'Half done');
    await user.click(screen.getByRole('heading', { name: 'Fan speed' }));
    await user.keyboard('j');
    expect(urlParams().case).toBe('103');
    sync();
    expect(await screen.findByRole('heading', { name: 'Wi-Fi pairing' })).toBeInTheDocument();
    expect(within(caseRow('UOT-002')).getByText('Unsaved changes')).toBeInTheDocument();
    await user.keyboard('k');
    expect(urlParams().case).toBe('102');
    sync();
    expect(await screen.findByLabelText('Actual result')).toHaveValue('Half done');
    expect(JSON.parse(window.localStorage.getItem(draftsKey(7))!)[102].actualResult).toBe(
      'Half done',
    );

    first.unmount();
    renderRun('/projects/3/runs/7?case=102');
    expect(await screen.findByLabelText('Actual result')).toHaveValue('Half done');
    expect(screen.getByText('Unsaved changes', { selector: '[role=status]' })).toBeInTheDocument();
  });

  it('restores stored drafts, drops stale ones and can discard a draft', async () => {
    const stored = {
      status: 'ok',
      actualResult: 'Restored',
      remark: '',
      elapsedSec: 0,
      stepResults: [],
    };
    window.localStorage.setItem(
      draftsKey(7),
      JSON.stringify({ 102: stored, 999: stored, 101: { ...stored, actualResult: 'Starts' } }),
    );
    const { user } = renderRun('/projects/3/runs/7?case=102');
    expect(await screen.findByLabelText('Actual result')).toHaveValue('Restored');
    expect(screen.getByRole('button', { name: 'OK', pressed: true })).toBeInTheDocument();
    await waitFor(() =>
      expect(Object.keys(JSON.parse(window.localStorage.getItem(draftsKey(7))!))).toEqual(['102']),
    );
    await user.click(screen.getByRole('button', { name: 'More result actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Discard changes' }));
    expect(screen.getByLabelText('Actual result')).toHaveValue('');
    expect(window.localStorage.getItem(draftsKey(7))).toBeNull();
  });

  it('sets results in bulk, selects ranges and assigns cases', async () => {
    const { user, api } = renderRun('/projects/3/runs/7?case=102', {
      handlers: {
        'POST /projects/3/runs/7/results/bulk': { affected: 2 },
        'POST /projects/3/runs/7/assign': { affected: 3 },
      },
    });
    await screen.findByRole('heading', { name: 'Fan speed' });
    await user.click(screen.getByRole('checkbox', { name: 'Select UOT-001' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select UOT-002' }));
    expect(screen.getByText('2 cases selected')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Set result' }));
    await user.click(await screen.findByRole('menuitem', { name: 'OK O' }));
    await waitFor(() =>
      expect(api.find('POST', '/projects/3/runs/7/results/bulk')).toHaveLength(1),
    );
    expect(api.find('POST', '/projects/3/runs/7/results/bulk')[0]!.body).toEqual({
      runCaseIds: [101, 102],
      status: 'ok',
    });
    await waitFor(() => expect(screen.queryByText('2 cases selected')).not.toBeInTheDocument());

    await user.click(screen.getByRole('checkbox', { name: 'Select UOT-001' }));
    await user.keyboard('{Shift>}');
    await user.click(screen.getByRole('checkbox', { name: 'Select UOT-003' }));
    await user.keyboard('{/Shift}');
    expect(screen.getByText('3 cases selected')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Assign' }));
    await user.click(await screen.findByRole('combobox', { name: 'Assign to' }));
    await user.click(await screen.findByRole('option', { name: 'Bob Lead' }));
    await user.click(screen.getByRole('button', { name: 'Assign 3 cases' }));
    await waitFor(() => expect(api.find('POST', '/projects/3/runs/7/assign')).toHaveLength(1));
    expect(api.find('POST', '/projects/3/runs/7/assign')[0]!.body).toEqual({
      runCaseIds: [101, 102, 103],
      assigneeId: 2,
    });
  });

  it('removes selected cases after a confirmation', async () => {
    const { user, api } = renderRun('/projects/3/runs/7?case=102', {
      role: 'lead',
      handlers: { 'POST /projects/3/runs/7/cases/remove': { removed: 1 } },
    });
    await screen.findByRole('heading', { name: 'Fan speed' });
    await user.click(screen.getByRole('checkbox', { name: 'Select all cases in Power' }));
    expect(screen.getByText('2 cases selected')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    const confirm = await screen.findByRole('alertdialog');
    expect(confirm).toHaveTextContent(
      '1 case already has a result, which will be deleted with it.',
    );
    await user.click(within(confirm).getByRole('button', { name: 'Remove' }));
    await waitFor(() =>
      expect(api.find('POST', '/projects/3/runs/7/cases/remove')[0]?.body).toEqual({
        runCaseIds: [101, 102],
      }),
    );
  });

  it('shows results read-only to viewers and hides the run actions', async () => {
    renderRun('/projects/3/runs/7?case=103', { role: 'viewer' });
    expect(await screen.findByRole('heading', { name: 'Wi-Fi pairing' })).toBeInTheDocument();
    expect(screen.getByText('Pairing fails')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save & next' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit run' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'More' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /^Select/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create defect from this result' })).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Add a comment' })).toBeNull();
  });

  it('locks a run of a completed plan', async () => {
    renderRun('/projects/3/runs/7?case=102', { runDto: makeRun({ planStatus: 'completed' }) });
    expect(await screen.findByText('Read-only')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Fan speed' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save & next' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit run' })).not.toBeInTheDocument();
  });

  it('opens the case in a drawer on small screens, where the shortcuts still work', async () => {
    wideScreen(false);
    const { user } = renderRun('/projects/3/runs/7?case=102');
    const drawer = await screen.findByRole('dialog', { name: 'Selected case' });
    expect(await within(drawer).findByRole('heading', { name: 'Fan speed' })).toBeInTheDocument();
    await user.keyboard('o');
    expect(within(drawer).getByRole('button', { name: 'OK', pressed: true })).toBeInTheDocument();
    await user.click(within(drawer).getByRole('button', { name: 'Close case' }));
    expect(urlParams()).toEqual({});
  });

  it('explains a case that is not in the run and an invalid run address', async () => {
    const missing = renderRun('/projects/3/runs/7?case=555');
    expect(await screen.findByText('Case not in this run')).toBeInTheDocument();
    await missing.user.click(screen.getByRole('button', { name: 'Close' }));
    expect(urlParams()).toEqual({});
    missing.unmount();

    renderRun('/projects/3/runs/x', { runId: 'x' });
    expect(await screen.findByText('This run address is not valid.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to test plans' })).toHaveAttribute(
      'href',
      '/projects/3/plans',
    );
  });

  it('shows the result history with step results and the case in other runs', async () => {
    const { user } = renderRun('/projects/3/runs/7?case=104', {
      handlers: {
        'GET /projects/3/run-cases/104': makeDetail(rc4, {
          history: [
            {
              id: 1,
              status: 'ng',
              actualResult: 'Timer lost',
              remark: 'After power cut',
              elapsedSec: 754,
              stepResults: [
                { status: 'ok', actual: '' },
                { status: 'ng', actual: 'Reset to 00:00' },
              ],
              source: 'junit',
              executedBy: bob,
              executedAt: '2026-11-01T04:00:00.000Z',
            },
          ],
          otherRuns: [
            {
              runCaseId: 204,
              runId: 8,
              runCode: 'KR_02',
              planId: 2,
              planDocNo: '26TR-TEAM-11-001',
              planTitle: 'FW 2.4 regression',
              releaseName: 'FW 2.4.0',
              status: 'ok',
              actualResult: null,
              executedBy: alice,
              executedAt: '2026-11-02T04:00:00.000Z',
            },
          ],
        }),
      },
    });
    expect(await screen.findByRole('tab', { name: 'History (1)' })).toBeInTheDocument();
    expect(screen.getByText('Timer lost')).toBeInTheDocument();
    expect(screen.getByText('Remark: After power cut')).toBeInTheDocument();
    expect(screen.getByText('JUnit import')).toBeInTheDocument();
    expect(screen.getByText('12:34')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show step results' }));
    expect(screen.getByText('Reset to 00:00')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Other runs (1)' }));
    expect(await screen.findByRole('link', { name: 'Run KR_02' })).toHaveAttribute(
      'href',
      '/projects/3/runs/8?case=204',
    );
  });

  it('times the execution and resets a result to untested', async () => {
    const { user, api } = renderRun('/projects/3/runs/7?case=103', {
      handlers: { 'PUT /projects/3/run-cases/103/result': savedRow(rc3) },
    });
    await screen.findByRole('heading', { name: 'Wi-Fi pairing' });
    expect(screen.getByLabelText('Elapsed 0:00')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start timer' }));
    expect(screen.getByRole('button', { name: 'Pause timer' })).toBeInTheDocument();
    expect(screen.getByText('Unsaved changes', { selector: '[role=status]' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reset timer' }));
    expect(screen.getByRole('button', { name: 'Start timer' })).toBeInTheDocument();
    expect(screen.queryByText('Unsaved changes', { selector: '[role=status]' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Start timer' }));
    await user.click(screen.getByRole('button', { name: 'Pause timer' }));
    expect(screen.getByRole('button', { name: 'Start timer' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'More result actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Reset to untested…' }));
    const confirm = await screen.findByRole('alertdialog');
    expect(confirm).toHaveTextContent('Reset UOT-003 to untested?');
    await user.click(within(confirm).getByRole('button', { name: 'Reset' }));
    await waitFor(() =>
      expect(api.find('PUT', '/projects/3/run-cases/103/result')).toHaveLength(1),
    );
    expect(api.find('PUT', '/projects/3/run-cases/103/result')[0]!.body).toEqual({
      status: 'untested',
      actualResult: null,
      remark: null,
      elapsedSec: null,
    });
  });

  it('shows the save state and a failed save', async () => {
    const { user, api } = renderRun('/projects/3/runs/7?case=102', {
      handlers: {
        'PUT /projects/3/run-cases/102/result': () =>
          new Response(JSON.stringify({ error: { code: 'PLAN_LOCKED', message: 'Locked' } }), {
            status: 409,
            headers: { 'content-type': 'application/json' },
          }),
      },
    });
    await screen.findByRole('heading', { name: 'Fan speed' });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'OK' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(api.find('PUT', '/projects/3/run-cases/102/result')).toHaveLength(1),
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled());
    expect(screen.getByText('Unsaved changes', { selector: '[role=status]' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'OK', pressed: true })).toBeInTheDocument();
  });

  it('shows an empty run with an add button', async () => {
    renderRun('/projects/3/runs/7', { handlers: { 'GET /projects/3/runs/7/cases': [] } });
    expect(await screen.findByText('No cases in this run')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Add cases' }).length).toBeGreaterThan(0);
    expect(cases).toHaveLength(4);
  });
});

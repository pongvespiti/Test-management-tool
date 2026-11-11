import { beforeEach, describe, expect, it } from '@jest/globals';
import { screen, waitFor, within } from '@testing-library/react';
import {
  apiError,
  followUrl,
  mockApi,
  openUrl,
  urlParams,
  type ApiCall,
} from '@/features/cases/test-utils';
import { mockRouter } from '@/test/mocks/next-navigation';
import { makeProject, renderWithProviders } from '@/test/render';
import { PlansPage } from './plans-page';
import { makePlan, makeRelease, makeRunSummary, makeTemplate } from './test-fixtures';

const fw24 = makeRelease();
const fw30 = makeRelease({ id: 6, name: 'FW 3.0', status: 'planned' });
const unitPlan = makePlan();
const adapterPlan = makePlan({
  id: 8,
  docNo: '26TR-TEAM-10-002',
  title: 'Adapter test',
  status: 'completed',
  completedAt: '2026-10-05T00:00:00.000Z',
  overallJudgement: 'pass',
  release: { id: 6, name: 'FW 3.0' },
  runs: [makeRunSummary({ id: 22, code: 'AD_01', suiteName: 'Adapter' })],
});

function stubApi(extra: Record<string, unknown> = {}) {
  return mockApi({
    'GET /projects/3/plans': (c: ApiCall) => {
      const release = c.query.get('releaseId');
      if (release === '5') return [unitPlan];
      if (release === '6') return [adapterPlan];
      return [unitPlan, adapterPlan];
    },
    'GET /projects/3/releases': [fw24, fw30],
    'GET /projects/3/templates': [makeTemplate()],
    'GET /projects/3/plans/doc-no-suggestion': { docNo: '26TR-TEAM-11-003' },
    ...extra,
  });
}

const tester = { project: makeProject({ myRole: 'tester' }) };

describe('PlansPage', () => {
  beforeEach(() => openUrl('/projects/3/plans'));

  it('lists the plans with release, progress, judgement and status', async () => {
    stubApi();
    renderWithProviders(<PlansPage />, tester);
    const link = await screen.findByRole('link', { name: 'Unit operation test — ACU18' });
    expect(link).toHaveAttribute('href', '/projects/3/plans/7');
    const row = link.closest('tr')!;
    expect(row).toHaveTextContent('26TR-TEAM-10-001');
    expect(row).toHaveTextContent('Suite: Unit operation test · 10 run cases');
    expect(row).toHaveTextContent('FW 2.4.0');
    expect(row).toHaveTextContent('8 OK · 1 NG · 1 untested');
    expect(row).toHaveTextContent('Suggested: NOT PASS');
    expect(row).toHaveTextContent('In progress');
    const done = screen.getByRole('link', { name: 'Adapter test' }).closest('tr')!;
    expect(done).toHaveTextContent('PASS');
    expect(done).toHaveTextContent('Oct 5, 2026');
    expect(screen.getByRole('radio', { name: 'All (2)' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Completed (1)' })).toBeInTheDocument();
  });

  it('keeps the release and status filters in the URL', async () => {
    openUrl('/projects/3/plans?release=5');
    const api = stubApi();
    const { user, rerender } = renderWithProviders(<PlansPage />, tester);
    expect(await screen.findByText('Unit operation test — ACU18')).toBeInTheDocument();
    expect(screen.queryByText('Adapter test')).not.toBeInTheDocument();
    expect(api.find('GET', '/projects/3/plans')[0]!.query.get('releaseId')).toBe('5');

    const release = screen.getByRole('combobox', { name: 'Filter by release' });
    await waitFor(() => expect(release).toBeEnabled());
    await user.click(release);
    await user.click(await screen.findByRole('option', { name: 'FW 3.0' }));
    expect(urlParams()).toEqual({ release: '6' });
    followUrl();
    rerender(<PlansPage />);
    expect(await screen.findByText('Adapter test')).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Completed (1)' }));
    expect(urlParams()).toEqual({ release: '6', status: 'completed' });
  });

  it('searches instantly and writes the text to the URL after a pause', async () => {
    stubApi();
    const { user } = renderWithProviders(<PlansPage />, tester);
    await screen.findByText('Adapter test');
    await user.type(screen.getByRole('textbox', { name: 'Search test plans' }), 'ad_01');
    expect(screen.queryByText('Unit operation test — ACU18')).not.toBeInTheDocument();
    expect(screen.getByText('Adapter test')).toBeInTheDocument();
    await waitFor(() => expect(urlParams().q).toBe('ad_01'));

    await user.type(screen.getByRole('textbox', { name: 'Search test plans' }), 'zzz');
    expect(await screen.findByText('No test plans match your filters')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByRole('textbox', { name: 'Search test plans' })).toHaveValue('');
    expect(urlParams()).toEqual({});
  });

  it('invites to create the first plan', async () => {
    stubApi({ 'GET /projects/3/plans': [] });
    renderWithProviders(<PlansPage />, tester);
    expect(await screen.findByText('No test plans yet')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'New test plan' })).toHaveLength(2);
  });

  it('creates a plan with the suggested doc no. and opens it', async () => {
    const api = stubApi({
      'POST /projects/3/plans': (c: ApiCall) =>
        (c.body as { docNo: string }).docNo === '26TR-TAKEN'
          ? apiError(409, 'DOC_NO_TAKEN')
          : makePlan({ id: 9, docNo: '26TR-TEAM-11-003' }),
    });
    const { user } = renderWithProviders(<PlansPage />, tester);
    await screen.findByText('Adapter test');
    await user.click(screen.getByRole('button', { name: 'New test plan' }));
    const dialog = await screen.findByRole('dialog', { name: 'New test plan' });
    const docNo = within(dialog).getByRole('textbox', { name: 'Doc No.' });
    await waitFor(() => expect(docNo).toHaveValue('26TR-TEAM-11-003'));
    // The active release is preselected.
    await waitFor(() =>
      expect(within(dialog).getByRole('combobox', { name: 'Release' })).toHaveTextContent(
        'FW 2.4.0 (active)',
      ),
    );

    await user.click(within(dialog).getByRole('button', { name: 'Create test plan' }));
    expect(await within(dialog).findByText('Required')).toBeInTheDocument();
    expect(api.find('POST', '/projects/3/plans')).toHaveLength(0);

    await user.type(within(dialog).getByRole('textbox', { name: 'Title' }), 'Timer test');
    await user.clear(docNo);
    await user.type(docNo, '26TR-TAKEN');
    await user.click(within(dialog).getByRole('button', { name: 'Create test plan' }));
    expect(
      await within(dialog).findByText('Another test plan in this project uses this Doc No.'),
    ).toBeInTheDocument();

    await user.clear(docNo);
    await user.type(docNo, '26TR-TEAM-11-003');
    await user.type(within(dialog).getByRole('textbox', { name: 'Purpose' }), 'To confirm');
    await user.click(within(dialog).getByRole('button', { name: 'Create test plan' }));
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith('/projects/3/plans/9'));
    expect(api.find('POST', '/projects/3/plans')[1]!.body).toEqual({
      docNo: '26TR-TEAM-11-003',
      title: 'Timer test',
      releaseId: 5,
      templateId: null,
      purpose: 'To confirm',
      testMethod: '',
      judgementCriteria: '',
      rawDataPath: '',
    });
  });

  it('hides "New test plan" from viewers', async () => {
    stubApi();
    renderWithProviders(<PlansPage />, { project: makeProject({ myRole: 'viewer' }) });
    await screen.findByText('Adapter test');
    expect(screen.queryByRole('button', { name: 'New test plan' })).not.toBeInTheDocument();
  });
});

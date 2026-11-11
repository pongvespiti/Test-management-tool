import { describe, expect, it } from '@jest/globals';
import { screen, within } from '@testing-library/react';
import type { ReadinessDTO } from '@tmt/shared';
import { makeDashboard } from '@/features/reports/test-fixtures';
import { renderWithProviders } from '@/test/render';
import { ReadinessCard } from './readiness-card';
import { readinessMessage } from './readiness-format';

const base: ReadinessDTO = {
  state: 'on_track',
  total: 40,
  remaining: 12,
  remainingMinutes: 150,
  executedLast7Days: 28,
  perDay: 4,
  endDate: '2026-11-30',
  daysLeft: 19,
  projectedDate: '2026-11-14',
};

describe('readinessMessage', () => {
  it('says when the finish lands before, on or after the end date', () => {
    expect(readinessMessage(base)).toBe(
      'At the pace of the last 7 days the testing finishes on Nov 14, 2026, 16 days before the end date (Nov 30, 2026).',
    );
    expect(readinessMessage({ ...base, projectedDate: '2026-11-30' })).toContain('on the end date');
    expect(readinessMessage({ ...base, state: 'at_risk', projectedDate: '2026-12-01' })).toContain(
      '1 day after the end date',
    );
  });

  it('explains a missing pace, a missing end date and an overdue release', () => {
    expect(readinessMessage({ ...base, state: 'at_risk', projectedDate: null })).toContain(
      'Nothing was tested in the last 7 days',
    );
    expect(
      readinessMessage({ ...base, state: 'no_deadline', endDate: null, daysLeft: null }),
    ).toContain('Set an end date on the release');
    expect(
      readinessMessage({
        ...base,
        state: 'overdue',
        daysLeft: -3,
        projectedDate: null,
        remaining: 1,
      }),
    ).toBe('The end date (Nov 30, 2026) passed 3 days ago and 1 case still has no result.');
    expect(readinessMessage({ ...base, state: 'done', remaining: 0 })).toContain('has a result');
    expect(readinessMessage({ ...base, state: 'no_cases', total: 0 })).toContain('no test cases');
  });
});

describe('ReadinessCard', () => {
  const dashboard = (readiness: ReadinessDTO) => ({ ...makeDashboard(), readiness });

  it('shows the state, the figures and what else is in the way', () => {
    const data = makeDashboard();
    renderWithProviders(<ReadinessCard projectId={3} releaseId={5} data={dashboard(base)} />);
    const card = screen.getByRole('region', { name: 'Release readiness' });
    expect(within(card).getByText('On track')).toBeInTheDocument();
    expect(card).toHaveTextContent('Untested12of 40 cases');
    expect(card).toHaveTextContent('Estimated time left2h 30m');
    expect(card).toHaveTextContent('Pace4 / day28 cases in the last 7 days');
    expect(card).toHaveTextContent('Days to the end date19');
    const blockers =
      data.kpis.openDefectsBySeverity.critical + data.kpis.openDefectsBySeverity.major;
    const link = within(card).getByRole('link', {
      name: `${blockers} critical or major open defects`,
    });
    const href = new URL(link.getAttribute('href')!, 'http://x');
    expect(href.pathname).toBe('/projects/3/defects');
    expect(Object.fromEntries(href.searchParams)).toEqual({
      release: '5',
      status: 'new,open,in_progress,reopened',
      severity: 'critical,major',
    });
    expect(card).toHaveTextContent('fixes waiting for a retest');
  });

  it('leaves out the figures when there are no cases and marks missing data', () => {
    const { unmount } = renderWithProviders(
      <ReadinessCard
        projectId={3}
        releaseId={null}
        data={dashboard({ ...base, state: 'no_cases', total: 0, remaining: 0 })}
      />,
    );
    expect(screen.getByText('No cases')).toBeInTheDocument();
    expect(screen.queryByText('Estimated time left')).not.toBeInTheDocument();
    unmount();
    renderWithProviders(
      <ReadinessCard
        projectId={3}
        releaseId={null}
        data={dashboard({
          ...base,
          state: 'no_deadline',
          endDate: null,
          daysLeft: null,
          remainingMinutes: 0,
        })}
      />,
    );
    expect(screen.getByText('No end date', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('No case estimates')).toBeInTheDocument();
  });
});

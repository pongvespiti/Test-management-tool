'use client';

import { OPEN_DEFECT_STATUSES, type DashboardDTO } from '@tmt/shared';
import Link from 'next/link';
import { StatusPill } from '@/components/common/status-pill';
import { formatDuration } from '@/features/runs/time';
import { SectionCard } from '@/features/reports/report-ui';
import { formatNumber } from '@/lib/format';
import { routes, toQueryString } from '@/lib/routes';
import { READINESS_LABELS, READINESS_TONES, readinessMessage } from './readiness-format';

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold">{value}</dd>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Can the untested cases be finished by the release end date at the recent pace? */
export function ReadinessCard({
  projectId,
  releaseId,
  data,
}: {
  projectId: number;
  releaseId: number | null;
  data: Pick<DashboardDTO, 'readiness' | 'kpis' | 'retest'>;
}) {
  const { readiness: r, kpis, retest } = data;
  const blockers = kpis.openDefectsBySeverity.critical + kpis.openDefectsBySeverity.major;
  const link = 'font-semibold text-primary hover:underline';
  return (
    <SectionCard
      title="Release readiness"
      subtitle="Untested cases of the open test plans against the release end date."
      actions={
        <StatusPill tone={READINESS_TONES[r.state]} size="md">
          {READINESS_LABELS[r.state]}
        </StatusPill>
      }
    >
      <p className="text-sm">{readinessMessage(r)}</p>
      {r.total > 0 && (
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-4">
          <Figure
            label="Untested"
            value={formatNumber(r.remaining)}
            hint={`of ${formatNumber(r.total)} cases`}
          />
          <Figure
            label="Estimated time left"
            value={r.remainingMinutes > 0 ? formatDuration(r.remainingMinutes * 60) : '—'}
            hint={r.remainingMinutes > 0 ? undefined : 'No case estimates'}
          />
          <Figure
            label="Pace"
            value={`${r.perDay} / day`}
            hint={`${formatNumber(r.executedLast7Days)} cases in the last 7 days`}
          />
          <Figure
            label="Days to the end date"
            value={r.daysLeft === null ? '—' : String(r.daysLeft)}
            hint={
              r.daysLeft === null ? 'No end date' : r.daysLeft < 0 ? 'Past the end date' : undefined
            }
          />
        </dl>
      )}
      <p className="mt-4 border-t border-divider pt-3 text-sm text-muted-foreground">
        Also in the way:{' '}
        <Link
          href={`${routes.defects(projectId)}${toQueryString({
            release: releaseId,
            status: OPEN_DEFECT_STATUSES.join(','),
            severity: 'critical,major',
          })}`}
          className={link}
        >
          {blockers} critical or major open defects
        </Link>
        {' · '}
        <span>
          <span className="font-semibold text-foreground">{kpis.counts.ng}</span> NG results
        </span>
        {' · '}
        <span>
          <span className="font-semibold text-foreground">{retest.total}</span> fixes waiting for a
          retest
        </span>
      </p>
    </SectionCard>
  );
}

import {
  DEFECT_SEVERITIES,
  DEFECT_SEVERITY_LABELS,
  executedOf,
  formatPercent,
  passRateOf,
  progressOf,
  totalOf,
  type DashboardDTO,
} from '@tmt/shared';
import { StackedProgress } from '@/components/common/stacked-progress';
import { StatTile } from '@/features/reports/report-ui';
import { formatNumber } from '@/lib/format';
import { SEVERITY_DOTS } from '@/lib/status';
import { planStatusParts } from './dashboard-format';

/** Plans by status, execution progress, pass rate and open defects by severity. */
export function KpiTiles({ kpis }: { kpis: DashboardDTO['kpis'] }) {
  const total = totalOf(kpis.counts);
  const executed = executedOf(kpis.counts);
  const planParts = planStatusParts(kpis.plansByStatus);
  const severities = DEFECT_SEVERITIES.filter((s) => kpis.openDefectsBySeverity[s] > 0);

  return (
    <section
      aria-label="Key figures"
      className="grid grid-cols-1 gap-4 min-[576px]:grid-cols-2 lg:grid-cols-4"
    >
      <StatTile label="Test plans" value={formatNumber(kpis.planCount)}>
        <p className="text-sm text-muted-foreground">
          {planParts.length ? planParts.join(' · ') : 'No test plans yet'}
        </p>
      </StatTile>
      <StatTile
        label="Execution progress"
        value={total === 0 ? '—' : formatPercent(progressOf(kpis.counts))}
      >
        <StackedProgress counts={kpis.counts} height={6} />
        <p className="text-sm text-muted-foreground">
          {total === 0
            ? 'No run cases yet'
            : `${formatNumber(executed)} of ${formatNumber(total)} run cases executed`}
        </p>
      </StatTile>
      <StatTile label="Pass rate" value={formatPercent(passRateOf(kpis.counts), 1)}>
        <p className="text-sm text-muted-foreground">
          Passed ÷ (passed + NG + blocked) · N/A and N/T excluded
        </p>
      </StatTile>
      <StatTile label="Open defects" value={formatNumber(kpis.openDefects)}>
        {severities.length === 0 ? (
          <p className="text-sm text-muted-foreground">No open defects</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {severities.map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5 text-sm">
                <span
                  aria-hidden
                  className="size-[9px] rounded-full"
                  style={{ background: SEVERITY_DOTS[s] }}
                />
                {kpis.openDefectsBySeverity[s]} {DEFECT_SEVERITY_LABELS[s].toLowerCase()}
              </span>
            ))}
          </div>
        )}
      </StatTile>
    </section>
  );
}

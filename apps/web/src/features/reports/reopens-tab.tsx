'use client';

import { formatPercent, type ReopenGroupDTO, type ReopenReportDTO } from '@tmt/shared';
import { RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { DefectStatusBadge, SeverityLabel } from '@/components/common/badges';
import { EmptyState } from '@/components/common/empty-state';
import { MonoId } from '@/components/common/mono-id';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useReopenReport } from '@/lib/api/reports';
import { formatDate, formatNumber } from '@/lib/format';
import { routes } from '@/lib/routes';
import { cn } from '@/lib/utils';
import { PRIMARY, share } from './report-format';
import { BarList, HEAD_ROW, ReportState, SectionCard, StatTile, TH } from './report-ui';

const NOT_SET = '(not set)';

/** Defects that were reopened: how often, where they come from, and the ones that keep coming back. */
export function ReopensTab({
  projectId,
  releaseId,
}: {
  projectId: number;
  releaseId: number | null;
}) {
  const query = useReopenReport(projectId, { releaseId });
  const data = query.data;
  return (
    <ReportState query={query} className="min-h-80">
      {!data || data.totals.defects === 0 ? (
        <EmptyState
          icon={<RotateCcw className="size-6" strokeWidth={1.6} />}
          title="No defects in this scope"
          description="Reopen counts appear once defects are reported and moved to Reopened."
        />
      ) : (
        <ReopensContent data={data} projectId={projectId} />
      )}
    </ReportState>
  );
}

function ReopensContent({ data, projectId }: { data: ReopenReportDTO; projectId: number }) {
  const { totals } = data;
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 min-[576px]:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Reopened defects" value={formatNumber(totals.reopenedDefects)}>
          <p className="text-sm text-muted-foreground">
            {formatPercent(share(totals.reopenedDefects, totals.defects))} of{' '}
            {formatNumber(totals.defects)} defects
          </p>
        </StatTile>
        <StatTile label="Times reopened" value={formatNumber(totals.reopens)}>
          <p className="text-sm text-muted-foreground">Every change of status to Reopened</p>
        </StatTile>
        <StatTile label="Reopened 2+ times" value={formatNumber(totals.repeatedDefects)}>
          <p className="text-sm text-muted-foreground">Defects that keep coming back</p>
        </StatTile>
        <StatTile
          label="Reopens per reopened defect"
          value={
            totals.reopenedDefects === 0
              ? '—'
              : (totals.reopens / totals.reopenedDefects).toFixed(1)
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <GroupCard title="By release" groups={data.byRelease} />
        <GroupCard
          title="By build"
          subtitle="The build the defect was found in"
          groups={data.byBuild}
        />
        <GroupCard
          title="By platform"
          subtitle="Platform of the first run linked to the defect"
          groups={data.byPlatform}
        />
        <GroupCard
          title="By topic"
          subtitle="Topic of the first run linked to the defect"
          groups={data.byTopic}
        />
      </div>

      <RepeatedTable data={data} projectId={projectId} />
    </div>
  );
}

function GroupCard({
  title,
  subtitle,
  groups,
}: {
  title: string;
  subtitle?: string;
  groups: readonly ReopenGroupDTO[];
}) {
  return (
    <SectionCard title={title} subtitle={subtitle ?? 'Times reopened (reopened of all defects)'}>
      <BarList
        items={groups.map((g) => ({
          key: g.value || 'none',
          label: g.value || NOT_SET,
          value: g.reopens,
          color: PRIMARY,
          note: `(${g.reopenedDefects} of ${g.defects})`,
        }))}
        empty="No defects."
      />
    </SectionCard>
  );
}

function RepeatedTable({ data, projectId }: { data: ReopenReportDTO; projectId: number }) {
  const right = cn(TH, 'text-right');
  return (
    <SectionCard
      title="Reopened 2 or more times"
      subtitle="Most reopens first"
      flush
      className="min-w-0"
    >
      {data.repeated.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-muted-foreground">
          No defect has been reopened more than once.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className={HEAD_ROW}>
              <TableHead className={cn(TH, 'pl-5')}>Defect</TableHead>
              <TableHead className={TH}>Status</TableHead>
              <TableHead className={TH}>Severity</TableHead>
              <TableHead className={right}>Reopens</TableHead>
              <TableHead className={TH}>Last reopened</TableHead>
              <TableHead className={TH}>Release</TableHead>
              <TableHead className={TH}>Build</TableHead>
              <TableHead className={TH}>Platform</TableHead>
              <TableHead className={cn(TH, 'pr-5')}>Topic</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.repeated.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="pl-5">
                  <Link
                    href={routes.defect(projectId, d.id)}
                    className="text-primary hover:underline"
                  >
                    <MonoId>{d.key}</MonoId>
                  </Link>{' '}
                  {d.title}
                </TableCell>
                <TableCell>
                  <DefectStatusBadge status={d.status} />
                </TableCell>
                <TableCell>
                  <SeverityLabel severity={d.severity} />
                </TableCell>
                <TableCell className="text-right font-semibold">{d.reopens}</TableCell>
                <TableCell>{formatDate(d.lastReopenedAt)}</TableCell>
                <TableCell>{d.release ?? '—'}</TableCell>
                <TableCell>{d.build ?? '—'}</TableCell>
                <TableCell>{d.platform ?? '—'}</TableCell>
                <TableCell className="pr-5">{d.topic ?? '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </SectionCard>
  );
}

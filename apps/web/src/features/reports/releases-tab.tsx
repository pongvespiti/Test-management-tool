'use client';

import { formatPercent, JUDGEMENT_LABELS, JUDGEMENTS, totalOf } from '@tmt/shared';
import { Flag } from 'lucide-react';
import Link from 'next/link';
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from 'recharts';
import { ReleaseStatusBadge } from '@/components/common/badges';
import { EmptyState } from '@/components/common/empty-state';
import { StackedProgress } from '@/components/common/stacked-progress';
import { Button } from '@/components/ui/button';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useReleaseComparison } from '@/lib/api/reports';
import { pluralize } from '@/lib/format';
import { routes, toQueryString } from '@/lib/routes';
import { JUDGEMENT_TONES } from '@/lib/status';
import { cn } from '@/lib/utils';
import { useProject } from '@/providers/project-provider';
import { GRID_COLOR, PRIMARY, releasePassRateRows, releasePeriod } from './report-format';
import { DotLabel, HEAD_ROW, ReportState, SectionCard, TH } from './report-ui';

/** Releases side by side: pass rate bars and a comparison table (newest first). */
export function ReleasesTab() {
  const { projectId, can } = useProject();
  const comparison = useReleaseComparison(projectId);
  const rows = comparison.data ?? [];

  return (
    <ReportState query={comparison} className="min-h-80">
      {rows.length === 0 ? (
        <EmptyState
          icon={<Flag className="size-6" strokeWidth={1.6} />}
          title="No releases yet"
          description="Group test plans and defects by firmware or product release to compare them here."
          action={
            can('manageReleases') ? (
              <Button asChild variant="outline">
                <Link href={routes.releases(projectId)}>Manage releases</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="flex flex-col gap-6">
          <SectionCard
            title="Pass rate by release"
            subtitle="Passed ÷ (passed + NG + blocked) over all results of the release; no bar = no results yet"
          >
            <ChartContainer
              config={{ passRate: { label: 'Pass rate', color: PRIMARY } }}
              height={Math.max(140, 56 + rows.length * 40)}
            >
              <BarChart
                data={releasePassRateRows(rows)}
                layout="vertical"
                margin={{ top: 4, right: 48, bottom: 0, left: 0 }}
              >
                <CartesianGrid horizontal={false} stroke={GRID_COLOR} />
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  tickFormatter={(v: number) => `${v}%`}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="release"
                  width={140}
                  tickLine={false}
                  axisLine={false}
                />
                <ChartTooltip
                  isAnimationActive={false}
                  content={<ChartTooltipContent valueFormatter={(v) => `${v}%`} />}
                />
                <Bar
                  dataKey="passRate"
                  name="passRate"
                  fill={PRIMARY}
                  maxBarSize={20}
                  isAnimationActive={false}
                >
                  <LabelList
                    dataKey="passRate"
                    position="right"
                    className="fill-foreground text-xs"
                    formatter={(v: unknown) => (typeof v === 'number' ? `${v}%` : '')}
                  />
                </Bar>
              </BarChart>
            </ChartContainer>
          </SectionCard>

          <SectionCard title="Release comparison" flush>
            <Table className="min-w-[1000px]">
              <TableHeader>
                <TableRow className={HEAD_ROW}>
                  <TableHead className={cn(TH, 'pl-5')}>Release</TableHead>
                  <TableHead className={TH}>Plans · runs</TableHead>
                  <TableHead className={cn(TH, 'min-w-[230px]')}>Progress</TableHead>
                  <TableHead className={cn(TH, 'text-right')}>Pass rate</TableHead>
                  <TableHead className={cn(TH, 'text-right')}>Defects</TableHead>
                  <TableHead className={cn(TH, 'pr-5')}>Plan judgements</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.release.id}>
                    <TableCell className="py-3 pl-5 align-top">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`${routes.dashboard(projectId)}${toQueryString({ release: r.release.id })}`}
                          className="text-sm font-semibold text-foreground hover:underline"
                        >
                          {r.release.name}
                        </Link>
                        <ReleaseStatusBadge status={r.release.status} />
                      </div>
                      <p className="text-xs text-muted-foreground">{releasePeriod(r.release)}</p>
                    </TableCell>
                    <TableCell className="py-3 align-top">
                      <p className="text-sm">{pluralize(r.planCount, 'plan')}</p>
                      <p className="text-xs text-muted-foreground">
                        {pluralize(r.runCount, 'run')}
                      </p>
                    </TableCell>
                    <TableCell className="min-w-[230px] py-3 align-top">
                      {totalOf(r.counts) === 0 ? (
                        <span className="text-sm text-muted-foreground">No run cases</span>
                      ) : (
                        <StackedProgress counts={r.counts} showPercent showSummary />
                      )}
                    </TableCell>
                    <TableCell className="py-3 text-right align-top text-sm font-semibold">
                      {formatPercent(r.passRate, 1)}
                    </TableCell>
                    <TableCell className="py-3 text-right align-top whitespace-nowrap">
                      <p className={cn('text-sm', r.defectsOpen > 0 && 'font-semibold')}>
                        {r.defectsOpen} open
                      </p>
                      <p className="text-xs text-muted-foreground">of {r.defectsTotal}</p>
                    </TableCell>
                    <TableCell className="py-3 pr-5 align-top">
                      <div className="flex flex-col gap-0.5 text-sm">
                        {JUDGEMENTS.filter((j) => r.judgements[j] > 0).map((j) => (
                          <DotLabel key={j} color={JUDGEMENT_TONES[j].solid}>
                            {r.judgements[j]} {JUDGEMENT_LABELS[j].toLowerCase()}
                          </DotLabel>
                        ))}
                        {r.judgements.none > 0 && (
                          <span className="text-muted-foreground">{r.judgements.none} pending</span>
                        )}
                        {r.planCount === 0 && <span className="text-muted-foreground">—</span>}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </SectionCard>
        </div>
      )}
    </ReportState>
  );
}

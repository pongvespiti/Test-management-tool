'use client';

import { totalOf, type BuildSummaryDTO } from '@tmt/shared';
import { Package } from 'lucide-react';
import Link from 'next/link';
import { EmptyState } from '@/components/common/empty-state';
import { StackedProgress } from '@/components/common/stacked-progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SectionCard } from '@/features/reports/report-ui';
import { routes, toQueryString } from '@/lib/routes';
import { pluralize } from '@/lib/format';

/** Results of every build of the release: one row per build, newest first. */
export function BuildsCard({
  projectId,
  releaseName,
  builds,
}: {
  projectId: number;
  releaseName: string;
  builds: BuildSummaryDTO[];
}) {
  return (
    <SectionCard
      title="Results by build"
      subtitle={`Runs tested on each application build of ${releaseName}`}
      flush
    >
      {builds.length === 0 ? (
        <EmptyState
          compact
          icon={<Package className="size-6" strokeWidth={1.6} />}
          title="No builds yet"
          description="Add builds on the Releases page, then choose one on each test run."
        />
      ) : (
        <Table className="min-w-[560px]">
          <TableHeader>
            <TableRow>
              <TableHead>Build</TableHead>
              <TableHead className="w-[90px]">Runs</TableHead>
              <TableHead className="min-w-[230px]">Results</TableHead>
              <TableHead className="w-[130px]">Open defects</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {builds.map((b) => (
              <TableRow key={b.build.id}>
                <TableCell className="font-mono text-sm font-semibold">{b.build.name}</TableCell>
                <TableCell>{b.runCount}</TableCell>
                <TableCell>
                  {totalOf(b.counts) === 0 ? (
                    <span className="text-sm text-muted-foreground">Not tested yet</span>
                  ) : (
                    <StackedProgress counts={b.counts} showPercent showSummary />
                  )}
                </TableCell>
                <TableCell>
                  {b.openDefects === 0 ? (
                    <span className="text-muted-foreground">0</span>
                  ) : (
                    <Link
                      href={`${routes.defects(projectId)}${toQueryString({ build: b.build.id })}`}
                      className="font-semibold text-primary hover:underline"
                      aria-label={`${pluralize(b.openDefects, 'defect')} found in ${b.build.name}`}
                    >
                      {b.openDefects}
                    </Link>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </SectionCard>
  );
}

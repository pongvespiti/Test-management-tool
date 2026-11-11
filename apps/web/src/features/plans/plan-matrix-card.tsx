'use client';

import { MATRIX_GROUP_BY, type MatrixGroupBy, type PlanDTO } from '@tmt/shared';
import { Grid2x2X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { MatrixCellBadge } from '@/components/common/badges';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorAlert, Spinner } from '@/components/common/error-alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { HEAD_ROW, Refreshing, SectionCard, TH } from '@/features/reports/report-ui';
import { useMatrix } from '@/lib/api/plans';
import { routes } from '@/lib/routes';
import { storageGet, storageSet } from '@/lib/storage';
import { cn } from '@/lib/utils';
import { useProject } from '@/providers/project-provider';
import { envSummary, oneOf } from './plan-utils';

export const GROUP_LABELS: Record<MatrixGroupBy, string> = {
  summary: 'Summary group (function)',
  section: 'Section',
  type: 'Type (Normal / Abnormal)',
};
/** Per-browser choice of the grouping (all plans). */
export const MATRIX_GROUP_KEY = 'tmt:planMatrixGroupBy';

function initialGroupBy(): MatrixGroupBy {
  return oneOf(MATRIX_GROUP_BY, storageGet(MATRIX_GROUP_KEY)) ?? 'summary';
}

/** "Summary by unit type": one row per run, one column per group, the worst result per cell. */
export function PlanMatrixCard({ plan }: { plan: PlanDTO }) {
  const { projectId } = useProject();
  const [groupBy, setGroupBy] = useState<MatrixGroupBy>(initialGroupBy);
  const matrix = useMatrix(projectId, plan.id, groupBy);
  const data = matrix.data;

  return (
    <SectionCard
      title="Summary matrix"
      subtitle="Generated from the results — the worst result of each group per run"
      actions={
        <div className="flex items-center gap-2">
          <span aria-hidden className="text-sm font-medium text-muted-foreground">
            Group by
          </span>
          <Select
            value={groupBy}
            onValueChange={(v) => {
              const next = v as MatrixGroupBy;
              setGroupBy(next);
              storageSet(MATRIX_GROUP_KEY, next);
            }}
          >
            <SelectTrigger aria-label="Group results by" className="w-[240px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MATRIX_GROUP_BY.map((g) => (
                <SelectItem key={g} value={g}>
                  {GROUP_LABELS[g]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      }
      flush
    >
      {matrix.isPending ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : matrix.isError ? (
        <div className="px-5 pb-5">
          <ErrorAlert error={matrix.error} onRetry={() => void matrix.refetch()} />
        </div>
      ) : !data || data.rows.length === 0 || data.groups.length === 0 ? (
        <EmptyState
          compact
          icon={<Grid2x2X className="size-6" strokeWidth={1.6} />}
          title="Nothing to summarise yet"
          description="The matrix fills in once the plan has runs with cases."
        />
      ) : (
        <Refreshing active={matrix.isPlaceholderData}>
          <Table className="min-w-max">
            <TableHeader>
              <TableRow className={HEAD_ROW}>
                <TableHead className={cn(TH, 'sticky left-0 z-[1] min-w-[160px] pl-5')}>
                  Run
                </TableHead>
                {data.groups.map((g) => (
                  <TableHead
                    key={g}
                    className={cn(
                      TH,
                      'h-auto min-w-[84px] py-2 text-center align-bottom leading-4 whitespace-normal',
                    )}
                  >
                    {g}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((row) => (
                <TableRow key={row.run.id} className="hover:bg-transparent">
                  <TableHead
                    scope="row"
                    className="sticky left-0 z-[1] h-auto bg-card py-2 pl-5 font-normal whitespace-nowrap"
                  >
                    <Link
                      href={routes.run(projectId, row.run.id)}
                      className="font-mono text-sm font-semibold text-primary hover:underline"
                    >
                      {row.run.code}
                    </Link>
                    <p className="max-w-[220px] truncate text-xs text-muted-foreground">
                      {row.run.scenario || envSummary(row.run.environment, 2) || '—'}
                    </p>
                  </TableHead>
                  {row.cells.map((cell, i) => (
                    <TableCell key={data.groups[i] ?? i} className="py-2 text-center">
                      <MatrixCellBadge cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Refreshing>
      )}
      <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-divider px-5 py-3 text-xs text-muted-foreground">
        <p>
          <span className="font-bold text-[#343a40]">N/A</span> = function not available on this
          product
        </p>
        <p>
          <span className="font-bold text-[#343a40]">N/T</span> = not tested (out of scope)
        </p>
        <p>
          A cell shows the worst result of its group: NG › Blocked › In progress › Pass w/ cond. ›
          Pass
        </p>
      </div>
    </SectionCard>
  );
}

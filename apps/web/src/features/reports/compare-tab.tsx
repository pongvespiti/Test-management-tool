'use client';

import { type CompareChange, type CompareDTO } from '@tmt/shared';
import { ArrowRight, Download, GitCompareArrows } from 'lucide-react';
import { useState } from 'react';
import { ResultBadge } from '@/components/common/badges';
import { ComboboxSelect } from '@/components/common/combobox-select';
import { EmptyState } from '@/components/common/empty-state';
import { FieldCaption, SegmentedControl } from '@/components/common/list-controls';
import { MonoId } from '@/components/common/mono-id';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useUrlSearchParams } from '@/hooks/use-url-search-params';
import { useCompareReport, useCompareSides } from '@/lib/api/reports';
import { formatNumber } from '@/lib/format';
import { saveTextFile } from '@/lib/save-file';
import { cn } from '@/lib/utils';
import {
  CHANGE_HINTS,
  CHANGE_LABELS,
  compareCsv,
  FILTER_OPTIONS,
  filterRows,
  parseFilter,
  type CompareFilter,
} from './compare-format';
import { HEAD_ROW, ReportState, SectionCard, StatTile, TH } from './report-ui';

const KPIS: CompareChange[] = ['regression', 'fixed', 'still_failing', 'not_run'];
const CHANGE_TEXT: Partial<Record<CompareChange, string>> = {
  regression: 'font-semibold text-destructive',
  fixed: 'font-semibold text-emerald-700 dark:text-emerald-400',
};

/** Two runs or two builds side by side: which cases regressed, got fixed or were not run again. */
export function CompareTab({ projectId }: { projectId: number }) {
  const [params, setParams] = useUrlSearchParams();
  const base = params.get('from');
  const target = params.get('to');
  const sides = useCompareSides(projectId);
  const options = (sides.data ?? []).map((s) => ({
    value: s.value,
    label: `${s.kind === 'run' ? 'Run' : 'Build'} · ${s.label}`,
    hint: s.detail,
  }));
  const set = (key: 'from' | 'to', value: string | null) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    });
  const query = useCompareReport(projectId, base, target);

  return (
    <div className="flex flex-col gap-6">
      <SectionCard
        title="Choose what to compare"
        subtitle="A run, or a build (the latest result of each case over its runs). Cases are matched by test case."
      >
        <div className="grid grid-cols-1 items-end gap-3 min-[768px]:grid-cols-[1fr_auto_1fr]">
          <div>
            <FieldCaption>From</FieldCaption>
            <ComboboxSelect
              aria-label="Compare from"
              options={options}
              value={base}
              onChange={(v) => set('from', v)}
              placeholder="Earlier run or build"
              emptyText="No runs or builds"
            />
          </div>
          <ArrowRight className="mb-2 hidden size-5 text-muted-foreground min-[768px]:block" />
          <div>
            <FieldCaption>To</FieldCaption>
            <ComboboxSelect
              aria-label="Compare to"
              options={options}
              value={target}
              onChange={(v) => set('to', v)}
              placeholder="Later run or build"
              emptyText="No runs or builds"
            />
          </div>
        </div>
      </SectionCard>

      {base === null || target === null ? (
        <EmptyState
          icon={<GitCompareArrows className="size-6" strokeWidth={1.6} />}
          title="Pick two runs or two builds"
          description="You will see the cases that got worse, the ones that were fixed and the ones that were not run again."
        />
      ) : (
        <ReportState query={query} className="min-h-60">
          {query.data && <CompareResult data={query.data} />}
        </ReportState>
      )}
    </div>
  );
}

function CompareResult({ data }: { data: CompareDTO }) {
  const [filter, setFilter] = useState<CompareFilter>('all');
  const rows = filterRows(data.rows, filter);
  const right = cn(TH, 'text-right');
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 min-[576px]:grid-cols-2 lg:grid-cols-4">
        {KPIS.map((c) => (
          <StatTile key={c} label={CHANGE_LABELS[c]} value={formatNumber(data.summary[c])}>
            <p className="text-sm text-muted-foreground">{CHANGE_HINTS[c]}</p>
          </StatTile>
        ))}
      </div>
      <SectionCard
        title={`${data.base.label} → ${data.target.label}`}
        subtitle={`${formatNumber(data.rows.length)} cases · ${formatNumber(data.summary.unchanged)} unchanged`}
        flush
        actions={
          <>
            <SegmentedControl
              aria-label="Show"
              value={filter}
              onChange={(v) => setFilter(parseFilter(v))}
              options={FILTER_OPTIONS}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => saveTextFile('compare.csv', compareCsv(data.rows))}
            >
              <Download className="size-4" /> Export CSV
            </Button>
          </>
        }
      >
        {rows.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-muted-foreground">No case matches this filter.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className={HEAD_ROW}>
                <TableHead className={cn(TH, 'pl-5')}>Case</TableHead>
                <TableHead className={TH}>Suite</TableHead>
                <TableHead className={TH}>From</TableHead>
                <TableHead className={TH}>To</TableHead>
                <TableHead className={cn(right, 'pr-5')}>Change</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.testCaseId}>
                  <TableCell className="pl-5">
                    <MonoId>{r.displayId}</MonoId> {r.title}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{r.suite}</TableCell>
                  <TableCell>{r.base ? <ResultBadge status={r.base} /> : <span>—</span>}</TableCell>
                  <TableCell>
                    {r.target ? <ResultBadge status={r.target} /> : <span>—</span>}
                  </TableCell>
                  <TableCell className={cn('pr-5 text-right text-sm', CHANGE_TEXT[r.change])}>
                    {CHANGE_LABELS[r.change]}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>
    </div>
  );
}

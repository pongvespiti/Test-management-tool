'use client';

import {
  formatPercent,
  passRateOf,
  totalOf,
  type SummaryCellDTO,
  type SummaryDTO,
} from '@tmt/shared';
import { Download, Grid3x3 } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';
import { ComboboxSelect } from '@/components/common/combobox-select';
import { EmptyState } from '@/components/common/empty-state';
import { FieldCaption } from '@/components/common/list-controls';
import { MultiSelect } from '@/components/common/multi-select';
import { StackedProgress, countsSummary } from '@/components/common/stacked-progress';
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
import { useSummaryReport, type SummaryView } from '@/lib/api/reports';
import { formatNumber } from '@/lib/format';
import { routes } from '@/lib/routes';
import { saveTextFile } from '@/lib/save-file';
import { cn } from '@/lib/utils';
import { SavedViewsBar } from './saved-views-bar';
import {
  cleanFilters,
  dimensionLabel,
  filterCount,
  rateText,
  readView,
  summaryCsv,
  valueLabel,
  writeView,
} from './summary-format';
import { HEAD_ROW, ReportState, SectionCard, StatTile, TH } from './report-ui';

/** Most run links shown in one cell before "+n more". */
const RUNS_SHOWN = 3;

/**
 * Result counts of the runs, grouped by any environment dimension (platform, OS version, unit
 * model, firmware …), topic, release or build, and narrowed by filters on the same dimensions.
 * The choice lives in the URL; saved views keep it under a name.
 */
export function SummaryTab({
  projectId,
  releaseId,
  planId,
}: {
  projectId: number;
  releaseId: number | null;
  planId: number | null;
}) {
  const [params, setParams] = useUrlSearchParams();
  const view = useMemo(() => readView(params), [params]);
  const query = useSummaryReport(projectId, { releaseId, planId }, view);
  const data = query.data;
  const setView = (next: SummaryView) => setParams((prev) => writeView(prev, next));
  const filters = filterCount(view);

  return (
    <div className="flex flex-col gap-6">
      <SectionCard
        title="Choose what to see"
        subtitle="Group the runs by any dimension and keep only the values you care about."
        actions={<SavedViewsBar projectId={projectId} view={view} onApply={setView} />}
      >
        <ViewControls data={data} view={view} onChange={setView} />
      </SectionCard>

      <ReportState query={query} className="min-h-60">
        {!data || data.scopeRuns === 0 ? (
          <EmptyState
            icon={<Grid3x3 className="size-6" strokeWidth={1.6} />}
            title="No runs in this scope"
            description="Runs appear here once a plan has runs with their environment filled in."
          />
        ) : (
          <SummaryResult
            data={data}
            projectId={projectId}
            filters={filters}
            onClear={() => setView({ ...view, filters: {} })}
          />
        )}
      </ReportState>
    </div>
  );
}

function ViewControls({
  data,
  view,
  onChange,
}: {
  data: SummaryDTO | undefined;
  view: SummaryView;
  onChange: (view: SummaryView) => void;
}) {
  const dims = data?.dimensions ?? [];
  const dimOptions = dims.map((d) => ({ value: d.key, label: d.label }));
  // A dimension chosen earlier (URL, saved view) that the scope no longer carries stays selectable.
  for (const key of [view.rows, view.cols]) {
    if (key && !dimOptions.some((o) => o.value === key)) {
      dimOptions.push({ value: key, label: dimensionLabel(data, key) });
    }
  }
  const filterable = dims.filter(
    (d) => d.options.length > 1 || (view.filters[d.key]?.length ?? 0) > 0,
  );
  const setFilter = (key: string, values: string[]) =>
    onChange({ ...view, filters: cleanFilters({ ...view.filters, [key]: values }) });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 min-[576px]:grid-cols-2 lg:grid-cols-4">
        <div>
          <FieldCaption>Rows</FieldCaption>
          <ComboboxSelect
            aria-label="Group rows by"
            options={dimOptions}
            value={view.rows}
            onChange={(v) => onChange({ ...view, rows: v })}
            placeholder="Nothing (one row)"
            clearLabel="Nothing (one row)"
            searchable={false}
          />
        </div>
        <div>
          <FieldCaption>Columns</FieldCaption>
          <ComboboxSelect
            aria-label="Group columns by"
            options={dimOptions.filter((o) => o.value !== view.rows)}
            value={view.cols}
            onChange={(v) => onChange({ ...view, cols: v })}
            placeholder="Result counts"
            clearLabel="Result counts"
            searchable={false}
          />
        </div>
      </div>
      {filterable.length > 0 && (
        <div>
          <FieldCaption>Only runs where</FieldCaption>
          <div className="grid grid-cols-1 gap-3 min-[576px]:grid-cols-2 lg:grid-cols-4">
            {filterable.map((d) => (
              <div key={d.key} className="flex flex-col gap-1">
                <span className="text-sm font-medium">{d.label}</span>
                <MultiSelect
                  aria-label={`Filter ${d.label}`}
                  options={d.options.map((o) => ({
                    value: o.value,
                    label: valueLabel(o.value),
                    hint: formatNumber(o.runs),
                  }))}
                  value={view.filters[d.key] ?? []}
                  onChange={(values) => setFilter(d.key, values)}
                  placeholder="Any"
                  searchable={d.options.length > 8}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryResult({
  data,
  projectId,
  filters,
  onClear,
}: {
  data: SummaryDTO;
  projectId: number;
  filters: number;
  onClear: () => void;
}) {
  const { totals } = data;
  const rate = passRateOf(totals.counts);
  if (totals.runs === 0) {
    return (
      <EmptyState
        icon={<Grid3x3 className="size-6" strokeWidth={1.6} />}
        title="No run matches these filters"
        description={`${formatNumber(data.scopeRuns)} runs are in the scope; none has all the values you chose.`}
        action={
          filters > 0 ? (
            <Button variant="outline" onClick={onClear}>
              Clear filters
            </Button>
          ) : undefined
        }
      />
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 min-[576px]:grid-cols-3">
        <StatTile label="Runs" value={formatNumber(totals.runs)}>
          <p className="text-sm text-muted-foreground">
            {totals.runs === data.scopeRuns
              ? 'All runs in the scope'
              : `of ${formatNumber(data.scopeRuns)} in the scope`}
          </p>
        </StatTile>
        <StatTile label="Pass rate" value={rate === null ? '—' : formatPercent(rate)}>
          <p className="text-sm text-muted-foreground">
            OK and OK w/ cond. over OK, NG and Blocked
          </p>
        </StatTile>
        <StatTile label="Run cases" value={formatNumber(totalOf(totals.counts))}>
          <p className="text-sm text-muted-foreground">{countsSummary(totals.counts)}</p>
        </StatTile>
      </div>
      <SectionCard
        title={tableTitle(data)}
        flush
        actions={
          <>
            {filters > 0 && (
              <Button variant="ghost" size="sm" onClick={onClear}>
                Clear filters
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => saveTextFile('summary.csv', summaryCsv(data))}
            >
              <Download className="size-4" /> Export CSV
            </Button>
          </>
        }
      >
        {data.cols ? (
          <Matrix data={data} projectId={projectId} />
        ) : (
          <GroupTable data={data} projectId={projectId} />
        )}
      </SectionCard>
    </div>
  );
}

function tableTitle(data: SummaryDTO): string {
  const rows = data.rows ? dimensionLabel(data, data.rows) : null;
  const cols = data.cols ? dimensionLabel(data, data.cols) : null;
  if (rows && cols) return `${rows} × ${cols}`;
  if (rows) return `Results by ${rows}`;
  if (cols) return `Results by ${cols}`;
  return 'Results of all runs';
}

function RunLinks({ cell, projectId }: { cell: SummaryCellDTO; projectId: number }) {
  const shown = cell.runs.slice(0, RUNS_SHOWN);
  const more = cell.runs.length - shown.length;
  return (
    <span className="text-xs text-muted-foreground">
      {shown.map((r, i) => (
        <span key={r.id}>
          {i > 0 && ', '}
          <Link href={routes.run(projectId, r.id)} className="text-primary hover:underline">
            {r.code}
          </Link>
        </span>
      ))}
      {more > 0 && ` +${more} more`}
    </span>
  );
}

/** One row per value of the row dimension with its pass rate and result bar. */
function GroupTable({ data, projectId }: { data: SummaryDTO; projectId: number }) {
  const rowName = data.rows ? dimensionLabel(data, data.rows) : 'Runs';
  const right = cn(TH, 'text-right');
  return (
    <Table>
      <TableHeader>
        <TableRow className={HEAD_ROW}>
          <TableHead className={cn(TH, 'pl-5')}>{rowName}</TableHead>
          <TableHead className={right}>Runs</TableHead>
          <TableHead className={right}>Pass rate</TableHead>
          <TableHead className={cn(TH, 'w-[40%] pr-5')}>Results</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.rowValues.map((row) => {
          const cell = data.cells.find((c) => c.row === row);
          if (!cell) return null;
          return (
            <TableRow key={row}>
              <TableCell className="pl-5 align-top">
                <div className="font-medium">{data.rows ? valueLabel(row) : 'All runs'}</div>
                <RunLinks cell={cell} projectId={projectId} />
              </TableCell>
              <TableCell className="text-right align-top">{cell.runs.length}</TableCell>
              <TableCell className="text-right align-top font-semibold">
                {rateText(passRateOf(cell.counts))}
              </TableCell>
              <TableCell className="pr-5 align-top">
                <StackedProgress counts={cell.counts} showSummary />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/** Row value × column value; each cell shows the pass rate, the counts and the runs behind it. */
function Matrix({ data, projectId }: { data: SummaryDTO; projectId: number }) {
  const rowName = data.rows ? dimensionLabel(data, data.rows) : 'All runs';
  const colName = dimensionLabel(data, data.cols ?? '');
  const lookup = new Map(data.cells.map((c) => [`${c.row}\u0000${c.col}`, c]));
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className={HEAD_ROW}>
            <TableHead className={cn(TH, 'pl-5')}>
              {rowName} <span className="font-normal">\ {colName}</span>
            </TableHead>
            {data.colValues.map((col) => (
              <TableHead key={col} className={TH}>
                {valueLabel(col)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.rowValues.map((row) => (
            <TableRow key={row}>
              <TableCell className="pl-5 align-top font-medium">
                {data.rows ? valueLabel(row) : 'All runs'}
              </TableCell>
              {data.colValues.map((col) => {
                const cell = lookup.get(`${row}\u0000${col}`);
                return (
                  <TableCell key={col} className="min-w-[150px] align-top">
                    {cell ? (
                      <div className="flex flex-col gap-1">
                        <span className="text-base font-semibold">
                          {rateText(passRateOf(cell.counts))}
                        </span>
                        <StackedProgress counts={cell.counts} height={6} />
                        <span className="text-xs text-muted-foreground">
                          {countsSummary(cell.counts)}
                        </span>
                        <RunLinks cell={cell} projectId={projectId} />
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

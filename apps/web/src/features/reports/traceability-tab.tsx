'use client';

import { emptyCounts, type TraceabilityRowDTO } from '@tmt/shared';
import { ChevronDown, ChevronRight, Download, Link2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { DefectStatusBadge, ResultBadge } from '@/components/common/badges';
import { EmptyState } from '@/components/common/empty-state';
import { MonoId } from '@/components/common/mono-id';
import { SegmentedControl } from '@/components/common/list-controls';
import { StackedProgress } from '@/components/common/stacked-progress';
import { Button } from '@/components/ui/button';
import { RequirementSourceBadge } from '@/features/requirements/requirement-badges';
import { VIA_LABELS } from '@/features/requirements/requirement-dialog';
import { useTraceabilityReport } from '@/lib/api/reports';
import { formatNumber } from '@/lib/format';
import { routes } from '@/lib/routes';
import { saveTextFile } from '@/lib/save-file';
import { ReportState, SectionCard, StatTile } from './report-ui';
import { needsAttention, traceabilityCsv, type TraceFilter } from './traceability-format';

const FILTERS = [
  { value: 'all', label: 'All references' },
  { value: 'attention', label: 'Needs attention' },
] as const;

/** Requirement / Jira key / spec references with their cases, latest results and defects. */
export function TraceabilityTab({
  projectId,
  releaseId,
}: {
  projectId: number;
  releaseId: number | null;
}) {
  const query = useTraceabilityReport(projectId, { releaseId });
  const [filter, setFilter] = useState<TraceFilter>('all');
  const data = query.data;
  const rows = (data?.rows ?? []).filter((r) => filter === 'all' || needsAttention(r));

  return (
    <ReportState query={query} className="min-h-80">
      {!data || data.rows.length === 0 ? (
        <EmptyState
          icon={<Link2 className="size-6" strokeWidth={1.6} />}
          title="No references yet"
          description="Add requirements (Excel, Jira or by hand) and link cases to them, or write requirement ids, Jira keys or spec numbers in the References field of a test case."
        />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-4 min-[576px]:grid-cols-3">
            <StatTile label="References" value={formatNumber(data.rows.length)}>
              <p className="text-sm text-muted-foreground">Written in the cases of the project</p>
            </StatTile>
            <StatTile
              label="Need attention"
              value={formatNumber(data.rows.filter(needsAttention).length)}
            >
              <p className="text-sm text-muted-foreground">
                No case, failed, open defect, or never run
              </p>
            </StatTile>
            <StatTile
              label="Cases without reference"
              value={formatNumber(data.casesWithoutReference)}
            >
              <p className="text-sm text-muted-foreground">
                Out of {formatNumber(data.totalCases)} cases
              </p>
            </StatTile>
          </div>
          <SectionCard
            title="Reference → cases → latest result → defects"
            subtitle="Spellings such as “req 1” and “REQ-1” count as one reference."
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <SegmentedControl
                  aria-label="Show"
                  value={filter}
                  onChange={(v) => setFilter(v as TraceFilter)}
                  options={[...FILTERS]}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => saveTextFile('traceability.csv', traceabilityCsv(data))}
                >
                  <Download className="size-4" /> Export CSV
                </Button>
              </div>
            }
          >
            <ul className="divide-y" aria-label="References">
              {rows.map((row) => (
                <ReferenceRow key={row.reference} row={row} projectId={projectId} />
              ))}
            </ul>
            {rows.length === 0 && (
              <p className="px-5 py-4 text-sm text-muted-foreground">
                Nothing needs attention in this scope.
              </p>
            )}
          </SectionCard>
        </div>
      )}
    </ReportState>
  );
}

function ReferenceRow({ row, projectId }: { row: TraceabilityRowDTO; projectId: number }) {
  const [open, setOpen] = useState(false);
  const { counts } = row;
  const Icon = open ? ChevronDown : ChevronRight;
  return (
    <li className="px-5 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          aria-expanded={open}
          aria-label={`${open ? 'Hide' : 'Show'} cases of ${row.reference}`}
          onClick={() => setOpen((v) => !v)}
          className="flex size-6 flex-none items-center justify-center rounded text-muted-foreground hover:bg-muted"
        >
          <Icon className="size-4" />
        </button>
        <span className="min-w-[140px] font-medium">{row.reference}</span>
        {row.requirement && (
          <>
            <span className="min-w-0 max-w-72 truncate text-sm">{row.requirement.title}</span>
            <RequirementSourceBadge source={row.requirement.source} />
            {row.requirement.externalStatus && (
              <span className="text-sm text-muted-foreground">
                {row.requirement.externalStatus}
              </span>
            )}
          </>
        )}
        {counts.total === 0 ? (
          <span className="text-sm font-semibold text-destructive">No case tests it</span>
        ) : (
          <span className="text-sm text-muted-foreground">
            {counts.total} {counts.total === 1 ? 'case' : 'cases'}
          </span>
        )}
        {counts.total > 0 && (
          <div className="w-40">
            <StackedProgress
              counts={{
                ...emptyCounts(),
                ok: counts.passed,
                ng: counts.failed,
                untested: counts.notExecuted + counts.neverRun,
              }}
            />
          </div>
        )}
        {counts.total > 0 && (
          <span className="text-sm text-muted-foreground">
            {counts.passed} passed · {counts.failed} failed · {counts.notExecuted + counts.neverRun}{' '}
            not run
          </span>
        )}
        {row.defects.length > 0 && (
          <span className="ml-auto text-sm">
            {row.defects.length} {row.defects.length === 1 ? 'defect' : 'defects'}
            {row.openDefects > 0 && ` (${row.openDefects} open)`}
          </span>
        )}
      </div>
      {open && (
        <div className="mt-3 ml-9 flex flex-col gap-3">
          {row.cases.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No case is linked to {row.reference} or cites it in its References.
            </p>
          )}
          <ul aria-label={`Cases of ${row.reference}`} className="flex flex-col gap-1.5">
            {row.cases.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 text-sm">
                <Link
                  href={routes.cases(projectId, { case: c.id })}
                  className="text-primary hover:underline"
                >
                  <MonoId>{c.displayId}</MonoId>
                </Link>
                <span className="min-w-0 flex-1">{c.title}</span>
                <span className="text-muted-foreground">{c.suite.name}</span>
                {row.requirement && (
                  <span className="text-xs text-muted-foreground">{VIA_LABELS[c.via]}</span>
                )}
                {c.status ? (
                  <ResultBadge status={c.status} />
                ) : (
                  <span className="text-muted-foreground">Never run</span>
                )}
              </li>
            ))}
          </ul>
          {row.defects.length > 0 && (
            <ul aria-label={`Defects of ${row.reference}`} className="flex flex-col gap-1.5">
              {row.defects.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-3 text-sm">
                  <Link
                    href={routes.defect(projectId, d.id)}
                    className="text-primary hover:underline"
                  >
                    <MonoId>{d.key}</MonoId>
                  </Link>
                  <span className="min-w-0 flex-1">{d.title}</span>
                  <DefectStatusBadge status={d.status} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

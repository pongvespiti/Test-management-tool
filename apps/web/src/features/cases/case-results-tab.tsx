'use client';

import { History } from 'lucide-react';
import Link from 'next/link';
import { ResultBadge } from '@/components/common/badges';
import { EmptyState } from '@/components/common/empty-state';
import { QueryState } from '@/components/common/error-alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useCaseRuns } from '@/lib/api/library';
import { formatDateTime, formatRelative } from '@/lib/format';
import { routes } from '@/lib/routes';
import { useProject } from '@/providers/project-provider';

/** Results of this library case in every run (newest first). */
export function CaseResultsTab({ caseId }: { caseId: number }) {
  const { projectId } = useProject();
  const runs = useCaseRuns(projectId, caseId);
  const list = runs.data ?? [];

  return (
    <QueryState query={runs}>
      {list.length === 0 ? (
        <EmptyState
          compact
          icon={<History className="size-6" strokeWidth={1.6} />}
          title="Not run yet"
          description="Results appear here once this case is part of a test run."
        />
      ) : (
        <Table className="min-w-[520px]">
          <TableHeader>
            <TableRow>
              <TableHead className="px-2">Plan / run</TableHead>
              <TableHead className="w-[110px] px-2">Result</TableHead>
              <TableHead className="px-2">Actual result</TableHead>
              <TableHead className="w-[140px] px-2">Executed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((r) => (
              <TableRow key={r.runCaseId} className="align-top">
                <TableCell className="px-2 align-top whitespace-normal">
                  <Link
                    href={routes.plan(projectId, r.planId)}
                    className="font-mono text-sm font-semibold text-primary hover:underline"
                  >
                    {r.planDocNo}
                  </Link>
                  <p className="line-clamp-1 text-xs text-muted-foreground" title={r.planTitle}>
                    {r.planTitle}
                  </p>
                  <Link
                    href={routes.run(projectId, r.runId)}
                    className="text-xs text-primary hover:underline"
                  >
                    Run {r.runCode}
                  </Link>
                  {r.releaseName && (
                    <span className="text-xs text-muted-foreground"> · {r.releaseName}</span>
                  )}
                </TableCell>
                <TableCell className="px-2 align-top">
                  <ResultBadge status={r.status} />
                </TableCell>
                <TableCell className="px-2 align-top whitespace-normal">
                  <p className="line-clamp-3 text-sm whitespace-multiline">
                    {r.actualResult || '—'}
                  </p>
                </TableCell>
                <TableCell className="px-2 align-top">
                  <p className="text-sm" title={formatDateTime(r.executedAt)}>
                    {r.executedAt ? formatRelative(r.executedAt) : '—'}
                  </p>
                  {r.executedBy && (
                    <p className="text-xs text-muted-foreground">{r.executedBy.displayName}</p>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </QueryState>
  );
}

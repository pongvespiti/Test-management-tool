'use client';

import { History } from 'lucide-react';
import Link from 'next/link';
import { EmptyState } from '@/components/common/empty-state';
import { QueryState } from '@/components/common/error-alert';
import { StatusPill } from '@/components/common/status-pill';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useImports } from '@/lib/api/imports';
import { formatDateTime, formatRelative } from '@/lib/format';
import { routes } from '@/lib/routes';
import { GRAY } from '@/lib/status';
import { useProject } from '@/providers/project-provider';
import { LAYOUT_LABELS, recordSummary } from './import-model';

const LINK = 'text-primary underline-offset-4 hover:underline';

/** Latest imports of the project (Excel/CSV cases and JUnit results). */
export function RecentImports({ limit = 10 }: { limit?: number }) {
  const { projectId } = useProject();
  const imports = useImports(projectId);
  const list = (imports.data ?? []).slice(0, limit);

  return (
    <Card className="gap-0 py-0">
      <div className="flex items-center justify-between gap-2 px-5 pt-4 pb-3">
        <h2 className="font-semibold">Recent imports</h2>
        {imports.data && imports.data.length > limit && (
          <span className="text-xs text-muted-foreground">
            Latest {limit} of {imports.data.length}
          </span>
        )}
      </div>
      <QueryState query={imports}>
        {list.length === 0 ? (
          <EmptyState
            compact
            icon={<History className="size-6" strokeWidth={1.6} />}
            title="No imports yet"
            description="Imported workbooks are listed here with what they created."
          />
        ) : (
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow>
                <TableHead>File</TableHead>
                <TableHead className="w-[200px]">Into</TableHead>
                <TableHead>Result</TableHead>
                <TableHead className="w-[150px]">When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="max-w-[320px] whitespace-normal">
                    <p className="truncate font-medium" title={r.fileName}>
                      {r.fileName}
                    </p>
                    {r.kind === 'junit' ? (
                      <StatusPill tone={GRAY}>JUnit results</StatusPill>
                    ) : (
                      <p className="truncate text-xs text-muted-foreground">
                        Sheet {r.sheet}
                        {r.layout ? ` · ${LAYOUT_LABELS[r.layout] ?? r.layout}` : ''}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    {r.suite ? (
                      <Link href={routes.cases(projectId, { suite: r.suite.id })} className={LINK}>
                        {r.suite.name}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                    {r.run && (
                      <p className="text-xs text-muted-foreground">
                        Run{' '}
                        <Link href={routes.run(projectId, r.run.id)} className={LINK}>
                          {r.run.code}
                        </Link>
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-normal">{recordSummary(r) || '—'}</TableCell>
                  <TableCell>
                    <p title={formatDateTime(r.createdAt)}>{formatRelative(r.createdAt)}</p>
                    {r.createdBy && (
                      <p className="text-xs text-muted-foreground">{r.createdBy.displayName}</p>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </QueryState>
    </Card>
  );
}

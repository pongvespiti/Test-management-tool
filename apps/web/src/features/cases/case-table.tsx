'use client';

import type { FieldDef, TestCaseDTO } from '@tmt/shared';
import { CaseStatusBadge, CaseTypeBadge } from '@/components/common/badges';
import { CasePriorityLabel } from '@/components/common/case-priority-label';
import { MonoId } from '@/components/common/mono-id';
import { TagList } from '@/components/common/tag-list';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDateTime, formatRelative } from '@/lib/format';

export interface TableSelection {
  ids: ReadonlySet<number>;
  toggle: (id: number) => void;
  setAll: (ids: number[], on: boolean) => void;
}

interface CaseTableProps {
  cases: TestCaseDTO[];
  columns: FieldDef[];
  showSection: boolean;
  activeId: number | null;
  onOpen: (testCase: TestCaseDTO) => void;
  /** Present when the user may run bulk actions. */
  selection?: TableSelection;
}

/** Case list of the library (one page). Rows open the detail panel (click, Enter or Space). */
export function CaseTable({
  cases,
  columns,
  showSection,
  activeId,
  onOpen,
  selection,
}: CaseTableProps) {
  const pageIds = cases.map((c) => c.id);
  const selectedOnPage = selection ? pageIds.filter((id) => selection.ids.has(id)).length : 0;

  return (
    <Table className="min-w-[800px]">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {selection && (
            <TableHead className="w-10">
              <Checkbox
                aria-label="Select all cases on this page"
                checked={
                  selectedOnPage === 0
                    ? false
                    : selectedOnPage === pageIds.length
                      ? true
                      : 'indeterminate'
                }
                onCheckedChange={(on) => selection.setAll(pageIds, on === true)}
              />
            </TableHead>
          )}
          <TableHead className="w-[124px]">ID</TableHead>
          <TableHead className="w-11 px-0 text-center" title="Priority">
            <span aria-hidden="true">Pri.</span>
            <span className="sr-only">Priority</span>
          </TableHead>
          <TableHead className="min-w-[220px]">Title</TableHead>
          <TableHead className="w-[104px]">Type</TableHead>
          <TableHead className="w-[112px]">Status</TableHead>
          {columns.map((f) => (
            <TableHead key={f.key} className="max-w-[220px] min-w-[120px] truncate">
              {f.label}
            </TableHead>
          ))}
          <TableHead className="w-[130px]">Updated</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {cases.map((c) => {
          const active = c.id === activeId;
          return (
            <TableRow
              key={c.id}
              data-state={active ? 'selected' : undefined}
              aria-selected={active}
              aria-label={`${c.displayId} ${c.title}`}
              tabIndex={0}
              className="cursor-pointer focus-visible:bg-muted focus-visible:outline-none"
              onClick={() => onOpen(c)}
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget) return;
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onOpen(c);
                }
              }}
            >
              {selection && (
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    aria-label={`Select ${c.displayId}`}
                    checked={selection.ids.has(c.id)}
                    onCheckedChange={() => selection.toggle(c.id)}
                  />
                </TableCell>
              )}
              <TableCell>
                <MonoId>{c.displayId}</MonoId>
                {c.code && (
                  <p
                    className="max-w-[108px] truncate font-mono text-xs text-muted-foreground"
                    title={c.code}
                  >
                    {c.code}
                  </p>
                )}
              </TableCell>
              <TableCell className="px-0 text-center">
                <CasePriorityLabel priority={c.priority} compact />
              </TableCell>
              <TableCell className="whitespace-normal">
                <p className="line-clamp-2 text-sm font-medium">{c.title}</p>
                {((showSection && c.sectionPath.length > 0) || c.tags.length > 0) && (
                  <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                    {showSection && c.sectionPath.length > 0 && (
                      <span className="min-w-0 truncate text-xs text-muted-foreground">
                        {c.sectionPath.join(' › ')}
                      </span>
                    )}
                    <TagList tags={c.tags} max={3} />
                  </div>
                )}
              </TableCell>
              <TableCell>
                <CaseTypeBadge type={c.caseType} />
              </TableCell>
              <TableCell>
                <CaseStatusBadge status={c.status} />
              </TableCell>
              {columns.map((f) => (
                <TableCell key={f.key} className="max-w-[220px] min-w-[96px] whitespace-normal">
                  <p className="line-clamp-2 text-sm whitespace-pre-line">
                    {c.custom[f.key] || '—'}
                  </p>
                </TableCell>
              ))}
              <TableCell>
                <span className="text-sm text-muted-foreground" title={formatDateTime(c.updatedAt)}>
                  {formatRelative(c.updatedAt)}
                </span>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

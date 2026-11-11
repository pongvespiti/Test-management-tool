'use client';

import type { Paged, SectionTreeDTO, SuiteDTO, TestCaseDTO } from '@tmt/shared';
import { TextSearch } from 'lucide-react';
import { useMemo } from 'react';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorAlert } from '@/components/common/error-alert';
import { Card } from '@/components/ui/card';
import { formatNumber, pluralize } from '@/lib/format';
import { BulkActionsBar } from './bulk-actions-bar';
import { CaseTable, type TableSelection } from './case-table';
import { CaseToolbar } from './case-toolbar';
import { LoadingOverlay, PagePagination } from '@/components/common/list-controls';
import type { CasesUrlPatch, CasesUrlState } from './use-cases-url-state';

export const PAGE_SIZE = 50;

interface CaseListPanelProps {
  suite: SuiteDTO;
  tree: SectionTreeDTO | undefined;
  url: CasesUrlState;
  onFilter: (patch: CasesUrlPatch) => void;
  cases: {
    data?: Paged<TestCaseDTO>;
    isPending: boolean;
    isFetching: boolean;
    error: unknown;
    refetch: () => unknown;
  };
  showSection: boolean;
  onOpen: (tc: TestCaseDTO) => void;
  /** Present when bulk actions are allowed. */
  selection?: { ids: ReadonlySet<number>; set: (ids: ReadonlySet<number>) => void };
}

/** Toolbar, bulk actions, case table and paging of the library. */
export function CaseListPanel({
  suite,
  tree,
  url,
  onFilter,
  cases,
  showSection,
  onOpen,
  selection,
}: CaseListPanelProps) {
  const page = cases.data;
  const items = page?.items ?? [];
  const total = page?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const columns = useMemo(() => suite.fieldDefs.filter((f) => f.showInTable), [suite.fieldDefs]);
  const filtered = Boolean(
    url.q || url.caseType || url.status || url.priority.length > 0 || url.tag,
  );
  const from = total === 0 ? 0 : (url.page - 1) * PAGE_SIZE + 1;
  const to = Math.min(total, url.page * PAGE_SIZE);

  const tableSelection: TableSelection | undefined = selection && {
    ids: selection.ids,
    toggle: (id) => {
      const next = new Set(selection.ids);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      selection.set(next);
    },
    setAll: (ids, on) => {
      const next = new Set(selection.ids);
      ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
      selection.set(next);
    },
  };

  return (
    <Card className="min-w-0 gap-0 py-0">
      <div className="flex flex-col gap-3 px-4 pt-4 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CaseToolbar
            q={url.q}
            caseType={url.caseType}
            status={url.status}
            priority={url.priority}
            tag={url.tag}
            onChange={onFilter}
          />
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {page
              ? total > PAGE_SIZE
                ? `${from}–${to} of ${formatNumber(total)}`
                : pluralize(total, 'case')
              : ''}
          </p>
        </div>
        {selection && selection.ids.size > 0 && (
          <BulkActionsBar
            suiteId={suite.id}
            tree={tree}
            ids={[...selection.ids]}
            onDone={() => selection.set(new Set())}
          />
        )}
      </div>
      <div className="relative border-t">
        <LoadingOverlay visible={cases.isFetching && !cases.isPending} />
        {cases.isPending ? (
          <p className="p-4 text-sm text-muted-foreground">Loading test cases…</p>
        ) : cases.error ? (
          <div className="p-4">
            <ErrorAlert error={cases.error} onRetry={() => void cases.refetch()} />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            compact
            icon={<TextSearch className="size-6" strokeWidth={1.6} />}
            title={filtered ? 'No test cases match' : 'No test cases here yet'}
            description={
              filtered
                ? 'Change the search or filters.'
                : 'Create a case, pick another section, or import the suite from Excel.'
            }
          />
        ) : (
          <CaseTable
            cases={items}
            columns={columns}
            showSection={showSection}
            activeId={url.caseId}
            onOpen={onOpen}
            selection={tableSelection}
          />
        )}
      </div>
      {pages > 1 && (
        <div className="border-t p-3">
          <PagePagination
            page={Math.min(url.page, pages)}
            pages={pages}
            onChange={(p) => onFilter({ page: p })}
          />
        </div>
      )}
    </Card>
  );
}

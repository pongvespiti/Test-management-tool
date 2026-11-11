'use client';

import {
  DEFECT_SEVERITIES,
  DEFECT_SEVERITY_LABELS,
  DEFECT_STATUSES,
  DEFECT_STATUS_LABELS,
  OPEN_DEFECT_STATUSES,
  type DefectSeverity,
  type DefectStatus,
} from '@tmt/shared';
import { Bug, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Suspense, useId, useMemo, useState } from 'react';
import { DefectStatusBadge, PriorityLabel, SeverityLabel } from '@/components/common/badges';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorAlert, Spinner } from '@/components/common/error-alert';
import { PageHeader } from '@/components/common/page-header';
import { ReleaseSelect } from '@/components/common/release-select';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Toggle } from '@/components/ui/toggle';
import { useDebouncedCallback } from '@/hooks/use-debounce';
import { useModalTarget } from '@/hooks/use-modal-target';
import { useDefects } from '@/lib/api/defects';
import { useIntegrationsStatus } from '@/lib/api/integrations';
import { useMembers } from '@/lib/api/projects';
import { formatDateTime, formatNumber, formatRelative, pluralize } from '@/lib/format';
import { routes } from '@/lib/routes';
import { useAuth } from '@/providers/auth-provider';
import { useProject } from '@/providers/project-provider';
import { ComboboxSelect } from '@/components/common/combobox-select';
import { LoadingOverlay, PagePagination, SearchInput } from '@/components/common/list-controls';
import { MultiSelect } from '@/components/common/multi-select';
import { WIDE_DIALOG } from '../runs/run-case-defects';
import { DefectForm } from './defect-form';
import { jiraIssueUrl } from './defect-model';
import { JiraKey } from './jira';
import { useDefectsUrlState } from './use-defects-url-state';

const PAGE_SIZE = 50;
const STATUS_OPTIONS = DEFECT_STATUSES.map((s) => ({ value: s, label: DEFECT_STATUS_LABELS[s] }));
const SEVERITY_OPTIONS = DEFECT_SEVERITIES.map((s) => ({
  value: s,
  label: DEFECT_SEVERITY_LABELS[s],
}));
const OPEN_SET = [...OPEN_DEFECT_STATUSES] as DefectStatus[];

/** Same members, any order. */
export function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}

/** Route `/projects/[projectId]/defects`. */
export function DefectsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      }
    >
      <DefectsList />
    </Suspense>
  );
}

/** Defect list: URL-synced filters, paged table with Jira keys, "New defect". */
function DefectsList() {
  const { project, projectId, can } = useProject();
  const { user } = useAuth();
  const router = useRouter();
  const id = useId();
  const url = useDefectsUrlState();
  const integrations = useIntegrationsStatus(projectId);
  const jira = integrations.data?.jira?.enabled ? integrations.data.jira : null;
  const members = useMembers(projectId);
  const creator = useModalTarget<'new'>();

  const assigneeId = url.assignee === 'me' ? user?.id : (url.assignee ?? undefined);
  const defects = useDefects(projectId, {
    q: url.q || undefined,
    status: url.status.length ? url.status : undefined,
    severity: url.severity.length ? url.severity : undefined,
    releaseId: url.releaseId ?? undefined,
    assigneeId,
    page: url.page,
    pageSize: PAGE_SIZE,
  });
  const openCount = useDefects(projectId, { status: OPEN_SET, pageSize: 1 });

  const [text, setText] = useState(url.q);
  const [syncedQ, setSyncedQ] = useState(url.q);
  const commitSearch = useDebouncedCallback((value: string) => url.update({ q: value }), 300);
  // Follow external changes (clear filters, back button) without eating a trailing space.
  if (syncedQ !== url.q) {
    setSyncedQ(url.q);
    if (text.trim() !== url.q) setText(url.q);
  }

  const assigneeOptions = useMemo(
    () => [
      { value: 'me', label: 'Assigned to me' },
      ...(members.data ?? [])
        .map((m) => ({ value: String(m.user.id), label: m.user.displayName }))
        .toSorted((a, b) => a.label.localeCompare(b.label)),
    ],
    [members.data],
  );

  const page = defects.data;
  const items = page?.items ?? [];
  const total = page?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = Boolean(
    url.q || url.status.length || url.severity.length || url.releaseId || url.assignee,
  );
  const openOnly = sameSet(url.status, OPEN_SET);

  const newButton = can('writeDefects') && (
    <Button onClick={() => creator.open('new')}>
      <Plus />
      New defect
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Defects"
        subtitle={
          <>
            {project.name}
            {openCount.data && ` · ${formatNumber(openCount.data.total)} open`}
          </>
        }
        actions={newButton}
      />

      <Card className="gap-0 py-0">
        <div className="flex flex-col gap-3 p-4 pb-3">
          <div className="flex flex-wrap items-end gap-3">
            <SearchInput
              placeholder="Search key, title or Jira key"
              aria-label="Search defects"
              className="max-w-[360px] flex-[1_1_240px]"
              value={text}
              onValueChange={(value) => {
                setText(value);
                commitSearch.run(value);
              }}
              onClear={() => {
                commitSearch.cancel();
                setText('');
                url.update({ q: '' });
              }}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                commitSearch.cancel();
                url.update({ q: text });
              }}
            />
            <MultiSelect
              aria-label="Filter by status"
              placeholder="All statuses"
              searchable={false}
              options={STATUS_OPTIONS}
              value={url.status}
              onChange={(v) => url.update({ status: v as DefectStatus[] })}
              className="w-[230px]"
            />
            <MultiSelect
              aria-label="Filter by severity"
              placeholder="All severities"
              searchable={false}
              options={SEVERITY_OPTIONS}
              value={url.severity}
              onChange={(v) => url.update({ severity: v as DefectSeverity[] })}
              className="w-[200px]"
            />
            <div className="w-[190px]">
              <label htmlFor={`${id}-release`} className="sr-only">
                Filter by release
              </label>
              <ReleaseSelect
                id={`${id}-release`}
                projectId={projectId}
                placeholder="All releases"
                value={url.releaseId}
                onChange={(releaseId) => url.update({ releaseId })}
              />
            </div>
            <ComboboxSelect
              aria-label="Filter by assignee"
              placeholder="Anyone"
              clearLabel="Anyone"
              options={assigneeOptions}
              value={url.assignee === null ? null : String(url.assignee)}
              onChange={(v) => url.update({ assignee: v === 'me' ? 'me' : v ? Number(v) : null })}
              className="w-[190px]"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Toggle
                size="sm"
                variant="outline"
                pressed={openOnly}
                onPressedChange={() => url.update({ status: openOnly ? [] : OPEN_SET })}
                className="h-7 rounded-full px-3 text-xs"
              >
                Open defects only
              </Toggle>
              {filtered && (
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={url.clear}>
                  Clear filters
                </Button>
              )}
            </div>
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {page ? pluralize(total, 'defect') : ''}
            </p>
          </div>
        </div>

        <div className="relative border-t">
          <LoadingOverlay visible={defects.isFetching && !defects.isPending} />
          {defects.isPending ? (
            <p className="p-4 text-sm text-muted-foreground">Loading defects…</p>
          ) : defects.isError ? (
            <div className="p-4">
              <ErrorAlert error={defects.error} onRetry={() => void defects.refetch()} />
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={<Bug className="size-6" strokeWidth={1.6} />}
              title={filtered ? 'No defects match' : 'No defects yet'}
              description={
                filtered
                  ? 'Change the search or the filters.'
                  : 'Defects are usually created from an NG result on the run page, or here with “New defect”.'
              }
              action={!filtered ? newButton : undefined}
            />
          ) : (
            <Table className="min-w-[1040px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[88px]">Key</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead className="w-[100px]">Severity</TableHead>
                  <TableHead className="w-[80px]">Priority</TableHead>
                  <TableHead className="w-[112px]">Status</TableHead>
                  <TableHead className="w-[136px]">Assignee</TableHead>
                  <TableHead className="w-[116px]">Release</TableHead>
                  <TableHead className="w-[128px]">Jira</TableHead>
                  <TableHead className="w-[104px]">Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((d) => {
                  const to = routes.defect(projectId, d.id);
                  return (
                    <TableRow key={d.id} className="cursor-pointer" onClick={() => router.push(to)}>
                      <TableCell>
                        <Link
                          href={to}
                          onClick={(e) => e.stopPropagation()}
                          className="font-mono text-sm font-semibold whitespace-nowrap text-primary hover:underline"
                        >
                          {d.key}
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-0 whitespace-normal">
                        <p className="line-clamp-2 text-sm font-medium">{d.title}</p>
                        {d.linkSummary && (
                          <p
                            className="truncate text-xs text-muted-foreground"
                            title={d.linkSummary}
                          >
                            {d.linkSummary}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <SeverityLabel severity={d.severity} />
                      </TableCell>
                      <TableCell>
                        <PriorityLabel priority={d.priority} />
                      </TableCell>
                      <TableCell>
                        <DefectStatusBadge status={d.status} />
                      </TableCell>
                      <TableCell className="max-w-0">
                        <span
                          className={`block truncate ${d.assignee ? '' : 'text-muted-foreground'}`}
                        >
                          {d.assignee?.displayName ?? 'Unassigned'}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-0">
                        <span
                          className={`block truncate ${d.release ? '' : 'text-muted-foreground'}`}
                        >
                          {d.release?.name ?? '—'}
                        </span>
                      </TableCell>
                      <TableCell>
                        {d.externalKey ? (
                          <JiraKey
                            issueKey={d.externalKey}
                            url={jiraIssueUrl(jira?.baseUrl, d.externalKey)}
                            status={d.externalStatus}
                            stacked
                          />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <span
                          className="text-sm text-muted-foreground"
                          title={formatDateTime(d.updatedAt)}
                        >
                          {formatRelative(d.updatedAt)}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
        {pages > 1 && (
          <div className="border-t p-4">
            <PagePagination
              page={Math.min(url.page, pages)}
              pages={pages}
              onChange={(p) => url.update({ page: p })}
            />
          </div>
        )}
      </Card>

      <Dialog open={creator.opened} onOpenChange={(o) => !o && creator.close()}>
        <DialogContent className={WIDE_DIALOG} onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>New defect</DialogTitle>
          </DialogHeader>
          {creator.target && (
            <DefectForm
              key={creator.key}
              projectId={projectId}
              defect={null}
              showExternalKey={!jira}
              onDone={(saved) => {
                creator.close();
                if (saved) router.push(routes.defect(projectId, saved.id));
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

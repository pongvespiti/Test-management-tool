'use client';

import type { SharedStepDTO } from '@tmt/shared';
import { Layers, Plus, Search } from 'lucide-react';
import { Suspense, useCallback, useMemo, useState } from 'react';
import { confirmAction } from '@/components/common/confirm-host';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorAlert, Spinner } from '@/components/common/error-alert';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useModalTarget } from '@/hooks/use-modal-target';
import { ApiError } from '@/lib/api/client';
import { useDeleteSharedStep, useSharedSteps } from '@/lib/api/shared-steps';
import { formatDateTime, formatRelative, pluralize } from '@/lib/format';
import { toId } from '@/lib/forms';
import { notifyError, notifySuccess } from '@/lib/notify';
import { cn } from '@/lib/utils';
import { useProject } from '@/providers/project-provider';
import { LoadingOverlay, SearchInput } from '@/components/common/list-controls';
import { matchesSharedStep } from '@/features/cases/shared-step-picker';
import { useUrlSearchParams } from '@/hooks/use-url-search-params';
import { SharedStepDetail } from './shared-step-detail';
import { SharedStepForm } from './shared-step-form';

/** Shared steps: reusable step sets that step-by-step cases include by reference. */
export function SharedStepsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      }
    >
      <SharedStepLibrary />
    </Suspense>
  );
}

function SharedStepLibrary() {
  const { projectId, can } = useProject();
  const list = useSharedSteps(projectId);
  const remove = useDeleteSharedStep(projectId);
  const [params, setParams] = useUrlSearchParams();
  const selectedId = toId(params.get('step'));
  const [q, setQ] = useState('');
  const editor = useModalTarget<{ sharedStep: SharedStepDTO | null }>();
  const wide = useMediaQuery('(min-width: 75em)');
  const all = useMemo(() => list.data ?? [], [list.data]);
  const items = useMemo(() => all.filter((s) => matchesSharedStep(s, q)), [all, q]);

  // Opening a set adds a history entry (back closes it); closing replaces it.
  const select = useCallback(
    (id: number | null) =>
      setParams(
        (prev) => {
          if (id === null) prev.delete('step');
          else prev.set('step', String(id));
          return prev;
        },
        { push: id !== null },
      ),
    [setParams],
  );

  /** In use: deleting first copies the steps into every using case as plain steps (`?inline=true`). */
  const offerInline = (s: SharedStepDTO, usage: number) =>
    confirmAction({
      title: `“${s.name}” is used by ${pluralize(usage, 'test case')}`,
      message: (
        <span className="flex flex-col gap-2">
          <span className="text-foreground">
            To delete it, its {pluralize(s.steps.length, 'step')} are first copied into{' '}
            {usage === 1 ? 'that case' : `those ${usage} cases`} as ordinary steps. The cases keep
            the same steps; they simply stop following this shared set.
          </span>
          <span>Runs that were already created are not affected.</span>
        </span>
      ),
      confirmLabel: `Delete and copy steps into the ${usage === 1 ? 'case' : `${usage} cases`}`,
      danger: true,
      onConfirm: () => doDelete(s, true),
    });

  const doDelete = async (s: SharedStepDTO, inline: boolean) => {
    try {
      await remove.mutateAsync({ id: s.id, inline });
      notifySuccess(
        inline
          ? `“${s.name}” deleted; its steps were copied into the cases that used it.`
          : `“${s.name}” deleted.`,
      );
      if (selectedId === s.id) select(null);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'SHARED_STEP_IN_USE') {
        const n = Number((err.details as { usageCount?: number } | undefined)?.usageCount ?? 0);
        offerInline(s, n || s.usageCount);
      } else notifyError(err, 'Could not delete the shared steps');
    }
  };

  const onDelete = (s: SharedStepDTO) => {
    if (s.usageCount > 0) offerInline(s, s.usageCount);
    else
      confirmAction({
        title: `Delete shared steps “${s.name}”?`,
        message: 'No test case uses them. This cannot be undone.',
        confirmLabel: 'Delete',
        danger: true,
        onConfirm: () => doDelete(s, false),
      });
  };

  const newButton = (label: string) =>
    can('writeSharedSteps') && (
      <Button onClick={() => editor.open({ sharedStep: null })}>
        <Plus />
        {label}
      </Button>
    );

  let body;
  if (list.isPending) {
    body = <p className="p-4 text-sm text-muted-foreground">Loading shared steps…</p>;
  } else if (list.isError) {
    body = (
      <div className="p-4">
        <ErrorAlert
          error={list.error}
          title="Shared steps could not be loaded"
          onRetry={() => void list.refetch()}
        />
      </div>
    );
  } else if (all.length === 0) {
    body = (
      <EmptyState
        icon={<Layers className="size-6" strokeWidth={1.6} />}
        title="No shared steps yet"
        description="Write steps that many cases repeat once — e.g. “Log in to the ACS app” or “Pair the Wi-Fi adapter” — and insert them into step-by-step cases."
        action={newButton('New shared steps')}
      />
    );
  } else if (items.length === 0) {
    body = (
      <EmptyState
        compact
        icon={<Search className="size-6" strokeWidth={1.6} />}
        title="No shared steps match"
        description="Change the search text."
      />
    );
  } else {
    body = (
      <Table className="min-w-[620px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Name</TableHead>
            <TableHead className="w-20 text-right">Steps</TableHead>
            <TableHead className="w-[100px] text-right">Used by</TableHead>
            <TableHead className="w-[170px]">Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((s) => {
            const active = s.id === selectedId;
            return (
              <TableRow
                key={s.id}
                data-state={active ? 'selected' : undefined}
                aria-selected={active}
                aria-label={s.name}
                tabIndex={0}
                className="cursor-pointer focus-visible:bg-muted focus-visible:outline-none"
                onClick={() => select(s.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    select(s.id);
                  }
                }}
              >
                <TableCell className="max-w-0 whitespace-normal">
                  <p className="truncate text-sm font-medium">{s.name}</p>
                  {s.description && (
                    <p className="truncate text-xs text-muted-foreground">{s.description}</p>
                  )}
                </TableCell>
                <TableCell className="text-right">{s.steps.length}</TableCell>
                <TableCell className="text-right">
                  {s.usageCount > 0 ? (
                    pluralize(s.usageCount, 'case')
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <p className="text-sm text-muted-foreground" title={formatDateTime(s.updatedAt)}>
                    {formatRelative(s.updatedAt)}
                  </p>
                  {s.updatedBy && (
                    <p className="text-xs text-muted-foreground">{s.updatedBy.displayName}</p>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    );
  }

  const inlineDetail = wide && selectedId !== null;
  const detail = selectedId !== null && (
    <SharedStepDetail
      id={selectedId}
      onClose={() => select(null)}
      onEdit={(s) => editor.open({ sharedStep: s })}
      onDelete={onDelete}
      showClose={inlineDetail}
    />
  );

  return (
    <>
      <PageHeader
        title="Shared steps"
        subtitle="Reusable step sets (log in, pair the adapter …) that step-by-step test cases include. Editing a set updates every case that uses it."
        actions={newButton('New shared steps')}
      />
      <div
        className={cn(
          'grid items-start gap-4',
          inlineDetail && 'grid-cols-[minmax(0,1fr)_minmax(400px,560px)]',
        )}
      >
        <Card className="min-w-0 gap-0 py-0">
          {all.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 pb-3">
              <SearchInput
                placeholder="Search names and step text"
                aria-label="Search shared steps"
                className="max-w-[380px] flex-[1_1_240px]"
                value={q}
                onValueChange={setQ}
              />
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {q.trim() ? `${items.length} of ${all.length}` : pluralize(all.length, 'set')}
              </p>
            </div>
          )}
          <div className={cn('relative', all.length > 0 && 'border-t')}>
            <LoadingOverlay visible={list.isFetching && !list.isPending} />
            {body}
          </div>
        </Card>
        {inlineDetail && (
          <Card className="sticky top-[77px] max-h-[calc(100vh-93px)] overflow-y-auto px-5">
            {detail}
          </Card>
        )}
      </div>

      <Sheet open={selectedId !== null && !wide} onOpenChange={(o) => !o && select(null)}>
        <SheetContent aria-describedby={undefined} className="w-full gap-0 sm:max-w-[600px]">
          <SheetHeader className="border-b px-6 py-4">
            <SheetTitle>Shared steps</SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{!wide && detail}</div>
        </SheetContent>
      </Sheet>

      <Sheet open={editor.opened} onOpenChange={(o) => !o && editor.close()}>
        <SheetContent
          aria-describedby={undefined}
          className="w-full gap-0 sm:max-w-[760px]"
          onInteractOutside={(e) => e.preventDefault()}
        >
          <SheetHeader className="border-b px-6 py-4">
            <SheetTitle>
              {editor.target?.sharedStep
                ? `Edit “${editor.target.sharedStep.name}”`
                : 'New shared steps'}
            </SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            {editor.target && (
              <SharedStepForm
                key={editor.key}
                sharedStep={editor.target.sharedStep}
                onDone={(saved) => {
                  editor.close();
                  if (saved) select(saved.id);
                }}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

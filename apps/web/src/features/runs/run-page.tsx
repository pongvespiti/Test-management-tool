'use client';

import type { RunCaseDTO, RunDTO } from '@tmt/shared';
import { ListPlus, MousePointerClick, SearchX } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Suspense,
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorAlert, Spinner } from '@/components/common/error-alert';
import { MonoId } from '@/components/common/mono-id';
import { PageHeader } from '@/components/common/page-header';
import { resultFromKey } from '@/components/common/result-buttons';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useMembers } from '@/lib/api/projects';
import { useRun, useRunCases } from '@/lib/api/runs';
import { toId } from '@/lib/forms';
import { notifyInfo } from '@/lib/notify';
import { routes } from '@/lib/routes';
import { cn } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';
import { useProject } from '@/providers/project-provider';
import { isInDropdown, isInteractive, isModalOpen, isTextEntry } from '../collab/dom';
import { AddCasesDialog } from './dialogs/add-cases-dialog';
import { EditRunDialog } from './dialogs/edit-run-dialog';
import { JunitImportDialog } from './dialogs/junit-import-dialog';
import { RerunDialog } from './dialogs/rerun-dialog';
import { DraftStore, draftsKey, useDraftIds } from './drafts';
import type { ResultFormHandle } from './result-form';
import { RunBulkBar } from './run-bulk-bar';
import { MissingRunCase, RunCaseDetail } from './run-case-detail';
import { RunCaseList, type ListSelection, type ScrollRequest } from './run-case-list';
import { RunCaseToolbar } from './run-case-toolbar';
import {
  assignableMembers,
  groupBySection,
  makeMatcher,
  NO_FILTERS,
  pathKey,
  sectionOptions,
  tagOptions,
} from './run-cases';
import { RunHeader, RunSummary } from './run-header';
import { useRunUrlState } from './use-run-url-state';

const EMPTY: RunCaseDTO[] = [];
const NO_IDS: ReadonlySet<number> = new Set();
/** Smallest height of the list/detail work area (the page scrolls when the window is smaller). */
const MIN_WORK_H = 520;
/** Wide screens show the selected case next to the list; smaller ones in a drawer. */
const INLINE_QUERY = '(min-width: 1200px)';
/** Height of the list and detail cards (set from the window size, see below). */
const WORK_H = 'h-[var(--run-work-h,560px)]';

type DialogKind = 'edit' | 'add' | 'rerun' | 'junit';

function Loading() {
  return (
    <div className="flex justify-center py-10">
      <Spinner />
    </div>
  );
}

/** Route `/projects/[projectId]/runs/[runId]` (deep link `?case=<runCaseId>`). */
export function RunPage() {
  return (
    <Suspense fallback={<Loading />}>
      <RunPageContent />
    </Suspense>
  );
}

function RunPageContent() {
  const { projectId } = useProject();
  const params = useParams<{ runId?: string | string[] }>();
  const raw = params?.runId;
  const runId = toId(Array.isArray(raw) ? raw[0] : raw);
  const run = useRun(projectId, runId);

  if (runId === null || run.isError) {
    return (
      <>
        <PageHeader
          title="Test run"
          breadcrumbs={[{ label: 'Test plans', href: routes.plans(projectId) }, { label: 'Run' }]}
        />
        <div className="flex max-w-[560px] flex-col gap-4">
          <ErrorAlert
            error={run.error ?? new Error('This run address is not valid.')}
            onRetry={runId === null ? undefined : () => void run.refetch()}
          />
          <Button asChild variant="outline" className="w-fit">
            <Link href={routes.plans(projectId)}>Back to test plans</Link>
          </Button>
        </div>
      </>
    );
  }
  if (!run.data) return <Loading />;
  return <RunExecution key={run.data.id} run={run.data} />;
}

function RunExecution({ run }: { run: RunDTO }) {
  const { projectId, can } = useProject();
  const { user } = useAuth();
  const url = useRunUrlState();
  const { update, filters } = url;
  const casesQ = useRunCases(projectId, run.id);
  const members = useMembers(projectId);
  const [store] = useState(() => new DraftStore(draftsKey(run.id)));
  const draftIds = useDraftIds(store);
  const inline = useMediaQuery(INLINE_QUERY);
  const formRef = useRef<ResultFormHandle>(null);
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const [selection, setSelection] = useState<{ key: string; ids: ReadonlySet<number> }>({
    key: '',
    ids: NO_IDS,
  });
  const [scrollRequest, setScrollRequest] = useState<ScrollRequest>({ id: null, mode: 'center' });

  const locked = run.planStatus === 'completed';
  const canExecute = can('execute') && !locked;
  const canWrite = can('writePlans') && !locked;
  const canImport = can('importAutomation') && !locked;
  const canBulk = canExecute || canWrite;

  // ------------------------------------------------------------------ filtering & grouping
  const cases = casesQ.data ?? EMPTY;
  const casesById = useMemo(() => new Map(cases.map((c) => [c.id, c])), [cases]);
  const tester = run.tester;
  const meId = user?.id ?? null;
  const filtered = useMemo(
    () => cases.filter(makeMatcher(filters, { tester }, meId)),
    [cases, filters, tester, meId],
  );
  const groups = useMemo(() => groupBySection(filtered), [filtered]);
  const navOrder = useMemo(() => groups.flatMap((g) => g.cases.map((c) => c.id)), [groups]);
  const visibleIds = useMemo(() => new Set(navOrder), [navOrder]);
  const fullPos = useMemo(() => {
    const order = groupBySection(cases).flatMap((g) => g.cases.map((c) => c.id));
    return new Map(order.map((id, i) => [id, i]));
  }, [cases]);
  const sections = useMemo(() => sectionOptions(cases), [cases]);
  const tags = useMemo(() => tagOptions(cases), [cases]);
  const assigneeOptions = useMemo(
    () => [
      { value: 'me', label: 'Assigned to me' },
      { value: 'none', label: 'Unassigned' },
      ...assignableMembers(members.data ?? []),
    ],
    [members.data],
  );
  const active = url.caseId !== null ? (casesById.get(url.caseId) ?? null) : null;

  // ------------------------------------------------------------------ selection (bulk)
  // The selection belongs to the filters it was made with; removed cases drop out of it.
  const filtersKey = useMemo(() => JSON.stringify(filters), [filters]);
  const selected = useMemo(() => {
    if (selection.key !== filtersKey) return NO_IDS;
    const kept = [...selection.ids].filter((id) => casesById.has(id));
    return kept.length === selection.ids.size ? selection.ids : new Set(kept);
  }, [selection, filtersKey, casesById]);
  const lastClicked = useRef<number | null>(null);

  const toggleSelect = useCallback(
    (id: number, range: boolean) => {
      const next = new Set(selected);
      const from = lastClicked.current === null ? -1 : navOrder.indexOf(lastClicked.current);
      const to = navOrder.indexOf(id);
      if (range && from >= 0 && to >= 0) {
        const on = !selected.has(id);
        for (let i = Math.min(from, to); i <= Math.max(from, to); i++) {
          const x = navOrder[i];
          if (x === undefined) continue;
          if (on) next.add(x);
          else next.delete(x);
        }
      } else if (next.has(id)) next.delete(id);
      else next.add(id);
      lastClicked.current = id;
      setSelection({ key: filtersKey, ids: next });
    },
    [selected, navOrder, filtersKey],
  );
  const setMany = useCallback(
    (ids: number[], on: boolean) => {
      const next = new Set(selected);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      setSelection({ key: filtersKey, ids: next });
    },
    [selected, filtersKey],
  );
  const clearSelection = useCallback(
    () => setSelection({ key: filtersKey, ids: NO_IDS }),
    [filtersKey],
  );
  const listSelection: ListSelection | undefined = canBulk
    ? { ids: selected, toggle: toggleSelect, setMany, allIds: navOrder }
    : undefined;

  // ------------------------------------------------------------------ navigation
  // The URL (`?case=`) updates a render later; quick key repeats continue from the intended case.
  const currentRef = useRef(url.caseId);
  useEffect(() => {
    currentRef.current = url.caseId;
  }, [url.caseId]);

  const select = useCallback(
    (id: number, mode: ScrollRequest['mode']) => {
      const rc = casesById.get(id);
      if (rc) {
        const key = pathKey(rc.sectionPath);
        setCollapsed((prev) => {
          if (!prev.has(key)) return prev;
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
      currentRef.current = id;
      setScrollRequest({ id, mode });
      update({ caseId: id });
    },
    [casesById, update],
  );

  const move = (delta: 1 | -1): boolean => {
    if (navOrder.length === 0) return false;
    const cur = currentRef.current;
    let target: number | undefined;
    const idx = cur === null ? -1 : navOrder.indexOf(cur);
    if (cur === null) target = delta > 0 ? navOrder[0] : navOrder[navOrder.length - 1];
    else if (idx >= 0) target = navOrder[idx + delta];
    else {
      // The current case is filtered out: continue from its place in the whole run.
      const pos = fullPos.get(cur) ?? -1;
      const after = navOrder.filter((id) => (fullPos.get(id) ?? 0) > pos);
      const before = navOrder.filter((id) => (fullPos.get(id) ?? 0) < pos);
      target = delta > 0 ? after[0] : before[before.length - 1];
    }
    if (target === undefined) return false;
    select(target, 'nearest');
    return true;
  };

  const onNext = () => {
    if (!move(1)) notifyInfo('That was the last case in the list.');
  };

  // First visit on a wide screen: open the first untested case.
  const autoSelected = useRef(false);
  useEffect(() => {
    if (autoSelected.current || !inline || url.caseId !== null || !casesQ.data) return;
    autoSelected.current = true;
    const first = navOrder.find((id) => casesById.get(id)?.status === 'untested') ?? navOrder[0];
    if (first !== undefined) {
      currentRef.current = first;
      update({ caseId: first });
    }
  }, [inline, url.caseId, casesQ.data, navOrder, casesById, update]);

  // Drafts restored from an earlier visit: drop those of removed cases or already saved values.
  const pruned = useRef(false);
  useEffect(() => {
    if (pruned.current || !casesQ.data) return;
    pruned.current = true;
    store.prune(casesQ.data);
  }, [casesQ.data, store]);

  // Leaving or reloading the page keeps the drafts, including the time of a running timer.
  useEffect(() => {
    const onHide = () => store.persist();
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, [store]);

  // The list and the detail fill the window below the header (each scrolls on its own).
  const headRef = useRef<HTMLDivElement>(null);
  const workRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const head = headRef.current;
    const work = workRef.current;
    if (!head || !work) return;
    const calc = () => {
      const top = work.getBoundingClientRect().top + window.scrollY;
      // 48 px = bottom padding of the app's content area.
      const height = Math.max(MIN_WORK_H, Math.floor(window.innerHeight - top - 48));
      work.style.setProperty('--run-work-h', `${height}px`);
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(head);
    window.addEventListener('resize', calc);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', calc);
    };
  }, []);

  // ------------------------------------------------------------------ keyboard shortcuts
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.defaultPrevented || e.isComposing) return;
    if (isModalOpen() || isInDropdown(e.target)) return;
    const form = formRef.current;
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      if (form && canExecute) {
        e.preventDefault();
        form.save({ next: true });
      }
      return;
    }
    if (isTextEntry(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    switch (e.key) {
      case 'j':
      case 'J':
      case 'ArrowDown':
        e.preventDefault();
        move(1);
        return;
      case 'k':
      case 'K':
      case 'ArrowUp':
        e.preventDefault();
        move(-1);
        return;
      case 'Enter':
        if (isInteractive(e.target) || !form || !canExecute) return;
        e.preventDefault();
        form.save({ next: true });
        return;
      default: {
        const status = resultFromKey(e.key);
        if (status && form && canExecute && !e.shiftKey) {
          e.preventDefault();
          form.setStatus(status);
        }
      }
    }
  });
  useEffect(() => {
    const handler = (e: KeyboardEvent) => onKey(e);
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ------------------------------------------------------------------ render
  const getDraft = useCallback(() => formRef.current?.getDraft() ?? null, []);
  const openCase = useCallback((id: number) => select(id, 'nearest'), [select]);
  const closeCase = useCallback(() => update({ caseId: null }), [update]);
  const closeDialog = () => setDialog(null);

  const detail = active ? (
    <RunCaseDetail
      key={active.id}
      rc={active}
      run={run}
      store={store}
      editable={canExecute}
      canDefects={can('writeDefects')}
      canComment={can('comment')}
      onNext={onNext}
      onClose={inline ? undefined : closeCase}
      formRef={formRef}
      getDraft={getDraft}
    />
  ) : url.caseId !== null && casesQ.data ? (
    <MissingRunCase onClose={closeCase} />
  ) : casesQ.isPending ? (
    <Loading />
  ) : (
    <EmptyState
      icon={<MousePointerClick className="size-6" strokeWidth={1.6} />}
      title="Select a case"
      description="Pick a case in the list to record its result. Move with J / K (or ↓ / ↑)."
    />
  );

  let listBody;
  if (casesQ.isPending)
    listBody = <p className="p-4 text-sm text-muted-foreground">Loading cases…</p>;
  else if (casesQ.isError)
    listBody = (
      <div className="p-4">
        <ErrorAlert error={casesQ.error} onRetry={() => void casesQ.refetch()} />
      </div>
    );
  else if (cases.length === 0)
    listBody = (
      <EmptyState
        icon={<ListPlus className="size-6" strokeWidth={1.6} />}
        title="No cases in this run"
        description="Add cases from the suite's library to start testing."
        action={
          canWrite ? (
            <Button onClick={() => setDialog('add')}>
              <ListPlus />
              Add cases
            </Button>
          ) : undefined
        }
      />
    );
  else if (filtered.length === 0)
    listBody = (
      <EmptyState
        compact
        icon={<SearchX className="size-6" strokeWidth={1.6} />}
        title="No cases match"
        description="Change or clear the filters."
      />
    );
  else
    listBody = (
      <RunCaseList
        run={run}
        groups={groups}
        collapsed={collapsed}
        onToggleGroup={(key) =>
          setCollapsed((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
          })
        }
        onCollapseAll={(collapse) =>
          setCollapsed(collapse ? new Set(groups.map((g) => g.key)) : new Set())
        }
        activeId={url.caseId}
        onOpen={openCase}
        selection={listSelection}
        draftIds={draftIds}
        scrollRequest={scrollRequest}
      />
    );

  return (
    <>
      <div ref={headRef}>
        <RunHeader
          run={run}
          actions={{
            onEdit: canWrite ? () => setDialog('edit') : undefined,
            onAddCases: canWrite ? () => setDialog('add') : undefined,
            onRerun: canWrite ? () => setDialog('rerun') : undefined,
            onJunit: canImport ? () => setDialog('junit') : undefined,
          }}
        />
        <RunSummary
          run={run}
          statusFilter={filters.status}
          onStatusFilter={(status) => update({ status })}
        />
      </div>

      <div
        ref={workRef}
        className={cn(
          'grid grid-cols-[minmax(0,1fr)] items-start gap-4',
          inline && 'grid-cols-[minmax(0,1.25fr)_minmax(440px,1fr)]',
        )}
      >
        <section
          aria-label="Cases in this run"
          className={cn(
            'flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card shadow-xs',
            WORK_H,
          )}
        >
          <div className="flex flex-none flex-col gap-2 border-b border-[#e3e6ea] p-3">
            <RunCaseToolbar
              filters={filters}
              onChange={(patch) => update(patch)}
              counts={run.counts}
              assigneeOptions={assigneeOptions}
              tags={tags}
              sections={sections}
              shown={filtered.length}
              total={cases.length}
            />
            {active && !visibleIds.has(active.id) && (
              <div
                role="status"
                aria-live="polite"
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-[#f8f9fa] px-3 py-1.5"
              >
                <p className="text-sm">
                  <MonoId>{active.displayId}</MonoId> stays open but the filters hide it in the
                  list.
                </p>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs"
                  onClick={() => {
                    setScrollRequest({ id: active.id, mode: 'center' });
                    update(NO_FILTERS);
                  }}
                >
                  Clear filters
                </Button>
              </div>
            )}
            {canBulk && selected.size > 0 && (
              <RunBulkBar
                runId={run.id}
                ids={[...selected]}
                casesById={casesById}
                canExecute={canExecute}
                canWrite={canWrite}
                onDone={clearSelection}
              />
            )}
          </div>
          <div className="min-h-0 flex-1">{listBody}</div>
        </section>

        {inline && (
          // Keyed by the case: a new case starts scrolled to the top.
          <section
            key={url.caseId ?? 'none'}
            aria-label="Selected case"
            className={cn(
              'min-w-0 overflow-y-auto rounded-xl border bg-card px-5 pt-5 shadow-xs',
              WORK_H,
            )}
          >
            {detail}
            <div className="h-5" />
          </section>
        )}
      </div>

      {!inline && (
        <Sheet open={url.caseId !== null} onOpenChange={(o) => !o && closeCase()}>
          <SheetContent
            side="right"
            data-page-shortcuts
            className="w-full gap-0 overflow-y-auto px-5 pt-5 sm:max-w-[720px] [&>button:last-child]:hidden"
          >
            <SheetTitle className="sr-only">Selected case</SheetTitle>
            <SheetDescription className="sr-only">
              Record the result of the selected run case
            </SheetDescription>
            {detail}
          </SheetContent>
        </Sheet>
      )}

      <EditRunDialog open={dialog === 'edit'} run={run} onClose={closeDialog} />
      <AddCasesDialog open={dialog === 'add'} run={run} onClose={closeDialog} />
      <RerunDialog open={dialog === 'rerun'} run={run} onClose={closeDialog} />
      <JunitImportDialog open={dialog === 'junit'} run={run} onClose={closeDialog} />
    </>
  );
}

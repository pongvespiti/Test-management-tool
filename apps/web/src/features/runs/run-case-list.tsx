'use client';

import { useVirtualizer } from '@tanstack/react-virtual';
import type { RunCaseDTO, RunDTO } from '@tmt/shared';
import { Bug, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
import { memo, useEffect, useMemo, useRef } from 'react';
import { ResultBadge } from '@/components/common/badges';
import { CasePriorityLabel } from '@/components/common/case-priority-label';
import { IconButton } from '@/components/common/icon-button';
import { countsSummary } from '@/components/common/stacked-progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { UserAvatar } from '../collab/user-avatar';
import { effectiveAssignee, PATH_SEP, type CaseGroup } from './run-cases';

const HEADER_H = 34;
const GROUP_H = 36;
const ROW_H = 52;
/** Rows rendered above and below the visible area (≈ 600 px). */
const OVERSCAN = 12;

type Item =
  { kind: 'group'; group: CaseGroup; collapsed: boolean } | { kind: 'case'; rc: RunCaseDTO };

export interface ListSelection {
  ids: ReadonlySet<number>;
  /** `range` = shift-click: select everything between the last clicked case and this one. */
  toggle: (id: number, range: boolean) => void;
  setMany: (ids: number[], on: boolean) => void;
  /** Ids of all cases matching the filters (header checkbox). */
  allIds: number[];
}

/**
 * How to bring the active row into view: `nearest` for keyboard steps and clicks (no jumping),
 * `center` for jumps. A selection without a request for it (deep link, first case) is centred.
 */
export interface ScrollRequest {
  /** Run case the request is for (the URL that selects it may arrive a render later). */
  id: number | null;
  mode: 'nearest' | 'center';
}

interface Props {
  run: Pick<RunDTO, 'tester'>;
  groups: CaseGroup[];
  collapsed: ReadonlySet<string>;
  onToggleGroup: (key: string) => void;
  /** Collapse or expand every section. */
  onCollapseAll: (collapse: boolean) => void;
  activeId: number | null;
  onOpen: (id: number) => void;
  selection?: ListSelection;
  draftIds: ReadonlySet<number>;
  scrollRequest: ScrollRequest;
}

const TH =
  'sticky top-0 z-[2] h-[34px] border-b border-[#e3e6ea] bg-[#f8f9fa] px-2 text-left text-xs font-semibold whitespace-nowrap text-[#5c6670] first:pl-3.5';
const TD = 'overflow-hidden border-b border-[#edf0f2] px-2 align-middle first:pl-3.5';

/**
 * Cases of the run grouped by section. Rows have fixed heights and only the rows near the visible
 * area are rendered (virtualised), so runs with thousands of cases stay fast; the list scrolls on
 * its own.
 */
export function RunCaseList({
  run,
  groups,
  collapsed,
  onToggleGroup,
  onCollapseAll,
  activeId,
  onOpen,
  selection,
  draftIds,
  scrollRequest,
}: Props) {
  const items = useMemo(() => {
    const out: Item[] = [];
    for (const g of groups) {
      const isCollapsed = collapsed.has(g.key);
      out.push({ kind: 'group', group: g, collapsed: isCollapsed });
      if (!isCollapsed) for (const rc of g.cases) out.push({ kind: 'case', rc });
    }
    return out;
  }, [groups, collapsed]);

  /** Top of every item in the scroll content (below the sticky header); length n + 1. */
  const offsets = useMemo(() => {
    const a = [HEADER_H];
    let y = HEADER_H;
    for (const it of items) {
      y += it.kind === 'group' ? GROUP_H : ROW_H;
      a.push(y);
    }
    return a;
  }, [items]);

  const scrollRef = useRef<HTMLDivElement>(null);
  // The app does not use the React Compiler, and nothing from the virtualizer is passed to
  // memoised children (rows get plain values), so its non-memoisable API is safe here.
  // oxlint-disable-next-line react/incompatible-library
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => (items[i]?.kind === 'group' ? GROUP_H : ROW_H),
    getItemKey: (i) => {
      const it = items[i];
      if (!it) return i;
      return it.kind === 'group' ? `g:${it.group.key}` : it.rc.id;
    },
    overscan: OVERSCAN,
    paddingStart: HEADER_H,
    scrollPaddingStart: HEADER_H,
  });

  // Keep the active row visible after keyboard navigation, a deep link or the first selection.
  const scrolled = useRef<{ id: number | null; request: ScrollRequest | null }>({
    id: null,
    request: null,
  });
  useEffect(() => {
    const el = scrollRef.current;
    const done = scrolled.current;
    if (!el || activeId === null || (done.id === activeId && done.request === scrollRequest))
      return;
    const idx = items.findIndex((it) => it.kind === 'case' && it.rc.id === activeId);
    if (idx < 0) return;
    scrolled.current = { id: activeId, request: scrollRequest };
    const mode = scrollRequest.id === activeId ? scrollRequest.mode : 'center';
    const top = offsets[items[idx - 1]?.kind === 'group' ? idx - 1 : idx] ?? 0;
    const bottom = offsets[idx + 1] ?? 0;
    const viewTop = el.scrollTop + HEADER_H;
    const viewBottom = el.scrollTop + el.clientHeight;
    const hidden = top < viewTop || bottom > viewBottom;
    if (mode === 'center' && hidden)
      el.scrollTop = Math.max(
        0,
        top - HEADER_H - (el.clientHeight - HEADER_H - (bottom - top)) / 2,
      );
    else if (top < viewTop) el.scrollTop = top - HEADER_H;
    else if (bottom > viewBottom) el.scrollTop = bottom - el.clientHeight;
    // Keyboard users moving through rows keep the focus on the active row.
    if (el.contains(document.activeElement) && document.activeElement !== el) {
      requestAnimationFrame(() =>
        el.querySelector<HTMLElement>(`tr[data-id="${activeId}"]`)?.focus({ preventScroll: true }),
      );
    }
  }, [activeId, scrollRequest, items, offsets]);

  const virtualItems = virtualizer.getVirtualItems();
  const totalH = virtualizer.getTotalSize();
  const first = virtualItems[0];
  const last = virtualItems[virtualItems.length - 1];
  const topPad = first ? first.start - HEADER_H : 0;
  const bottomPad = last ? totalH - last.end : 0;

  const selectable = Boolean(selection);
  const cols = selectable ? 7 : 6;
  const allIds = selection?.allIds ?? [];
  const checkedCount = selection ? allIds.filter((id) => selection.ids.has(id)).length : 0;
  const firstCaseId = groups.find((g) => !collapsed.has(g.key))?.cases[0]?.id ?? null;
  const tabbableId =
    activeId !== null && items.some((it) => it.kind === 'case' && it.rc.id === activeId)
      ? activeId
      : firstCaseId;
  const allCollapsed = groups.length > 0 && groups.every((g) => collapsed.has(g.key));

  return (
    <div ref={scrollRef} className="relative h-full overflow-auto">
      <table
        className="w-full table-fixed border-separate border-spacing-0 text-sm"
        aria-label="Cases in this run"
        aria-rowcount={items.length}
      >
        <colgroup>
          {selectable && <col className="w-10" />}
          <col className="w-[116px]" />
          <col />
          <col className="w-7" />
          <col className="w-[38px]" />
          <col className="w-[42px]" />
          <col className="w-[98px]" />
        </colgroup>
        <thead>
          <tr>
            {selectable && (
              <th className={TH}>
                <Checkbox
                  aria-label="Select all cases that match the filters"
                  checked={
                    checkedCount > 0 && checkedCount === allIds.length
                      ? true
                      : checkedCount > 0
                        ? 'indeterminate'
                        : false
                  }
                  onCheckedChange={(c) => selection?.setMany(allIds, c === true)}
                />
              </th>
            )}
            <th className={TH}>ID</th>
            <th className={TH}>
              <div className="flex items-center justify-between gap-1">
                <span>Title</span>
                <IconButton
                  label={allCollapsed ? 'Expand all sections' : 'Collapse all sections'}
                  className="size-6"
                  onClick={() => onCollapseAll(!allCollapsed)}
                >
                  {allCollapsed ? <ChevronsUpDown /> : <ChevronsDownUp />}
                </IconButton>
              </div>
            </th>
            <th className={TH}>
              <span className="sr-only">Priority</span>
            </th>
            <th className={TH}>
              <span className="sr-only">Assignee</span>
            </th>
            <th className={TH}>
              <span className="sr-only">Defects</span>
            </th>
            <th className={TH}>Result</th>
          </tr>
        </thead>
        <tbody>
          {topPad > 0 && (
            <tr aria-hidden style={{ height: topPad }}>
              <td colSpan={cols} className="border-0 p-0" />
            </tr>
          )}
          {virtualItems.map((v) => {
            const it = items[v.index];
            if (!it) return null;
            return it.kind === 'group' ? (
              <GroupRow
                key={v.key}
                group={it.group}
                collapsed={it.collapsed}
                cols={cols}
                onToggle={onToggleGroup}
                selection={selection}
              />
            ) : (
              <CaseRow
                key={v.key}
                rc={it.rc}
                run={run}
                active={it.rc.id === activeId}
                tabbable={it.rc.id === tabbableId}
                checked={selection?.ids.has(it.rc.id) ?? false}
                dirty={draftIds.has(it.rc.id)}
                selectable={selectable}
                onOpen={onOpen}
                onToggle={selection?.toggle}
              />
            );
          })}
          {bottomPad > 0 && (
            <tr aria-hidden style={{ height: bottomPad }}>
              <td colSpan={cols} className="border-0 p-0" />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function GroupRow({
  group,
  collapsed,
  cols,
  onToggle,
  selection,
}: {
  group: CaseGroup;
  collapsed: boolean;
  cols: number;
  onToggle: (key: string) => void;
  selection?: ListSelection;
}) {
  const label = group.path.length ? group.path.join(PATH_SEP) : '(No section)';
  const ids = group.cases.map((c) => c.id);
  const checked = selection ? ids.filter((id) => selection.ids.has(id)).length : 0;
  return (
    <tr className="h-9">
      <th
        colSpan={cols}
        scope="colgroup"
        className="overflow-hidden border-b border-[#e3e6ea] bg-[#f1f3f5] py-0 pr-2 pl-3.5 text-left text-xs font-semibold whitespace-nowrap text-[#343a40]"
      >
        <div className="flex min-w-0 items-center gap-1.5">
          {selection && (
            <Checkbox
              aria-label={`Select all cases in ${label}`}
              checked={
                checked > 0 && checked === ids.length ? true : checked > 0 ? 'indeterminate' : false
              }
              onCheckedChange={(c) => selection.setMany(ids, c === true)}
            />
          )}
          <button
            type="button"
            aria-expanded={!collapsed}
            onClick={() => onToggle(group.key)}
            title={label}
            className="inline-flex h-7 max-w-full min-w-0 items-center gap-1.5 rounded-md px-1 hover:bg-[#e9ecef] focus-visible:outline-2 focus-visible:outline-[#1971c2]"
          >
            {collapsed ? (
              <ChevronRight className="size-3.5 shrink-0" aria-hidden />
            ) : (
              <ChevronDown className="size-3.5 shrink-0" aria-hidden />
            )}
            <span className="truncate">{label}</span>
            <span className="font-medium text-muted-foreground">{group.cases.length}</span>
          </button>
          <span className="ml-auto min-w-0 truncate font-normal text-muted-foreground">
            {countsSummary(group.counts)}
          </span>
        </div>
      </th>
    </tr>
  );
}

interface CaseRowProps {
  rc: RunCaseDTO;
  run: Pick<RunDTO, 'tester'>;
  active: boolean;
  tabbable: boolean;
  checked: boolean;
  dirty: boolean;
  selectable: boolean;
  onOpen: (id: number) => void;
  onToggle?: (id: number, range: boolean) => void;
}

const CaseRow = memo(function CaseRow({
  rc,
  run,
  active,
  tabbable,
  checked,
  dirty,
  selectable,
  onOpen,
  onToggle,
}: CaseRowProps) {
  const assignee = effectiveAssignee(rc, run);
  return (
    <tr
      data-id={rc.id}
      aria-selected={active}
      tabIndex={tabbable ? 0 : -1}
      onClick={() => onOpen(rc.id)}
      className={cn(
        'h-[52px] cursor-pointer bg-white hover:bg-[#f8f9fa] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#1971c2] aria-selected:bg-[#e7f5ff] aria-selected:[&>td:first-child]:shadow-[inset_3px_0_0_#1971c2]',
        checked && 'bg-[#f3f9ff]',
      )}
    >
      {selectable && (
        <td className={TD} onClick={(e) => e.stopPropagation()}>
          <Checkbox
            aria-label={`Select ${rc.displayId}`}
            checked={checked}
            onClick={(e) => onToggle?.(rc.id, e.shiftKey)}
          />
        </td>
      )}
      <td className={TD}>
        <div className="truncate font-mono text-xs font-semibold text-[#343a40]">
          {rc.displayId}
        </div>
        {rc.code && (
          <div className="truncate font-mono text-xs text-muted-foreground" title={rc.code}>
            {rc.code}
          </div>
        )}
      </td>
      <td className={TD}>
        <span
          className="line-clamp-2 text-[13px] leading-[18px] font-medium [overflow-wrap:anywhere]"
          title={rc.title}
        >
          {rc.title}
        </span>
      </td>
      <td className={TD}>
        <CasePriorityLabel priority={rc.priority} compact />
      </td>
      <td className={TD}>
        {assignee.user ? (
          <UserAvatar user={assignee.user} size={24} inherited={assignee.inherited} />
        ) : (
          <span className="text-xs text-muted-foreground" title="Unassigned">
            —
          </span>
        )}
      </td>
      <td className={TD}>
        {rc.defectCount > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-[#495057]">
                <Bug className="size-3.5" aria-hidden />
                {rc.defectCount}
                <span className="sr-only"> linked defects</span>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {`${rc.defectCount} linked defect${rc.defectCount === 1 ? '' : 's'}`}
            </TooltipContent>
          </Tooltip>
        )}
      </td>
      <td className={cn(TD, 'whitespace-nowrap')}>
        <ResultBadge status={rc.status} />
        {dirty && (
          <span
            className="ml-1.5 inline-block size-2 rounded-full bg-[#1971c2] align-middle"
            title="Unsaved changes"
          >
            <span className="sr-only">Unsaved changes</span>
          </span>
        )}
      </td>
    </tr>
  );
});

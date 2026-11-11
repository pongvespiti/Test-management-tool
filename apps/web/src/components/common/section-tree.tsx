'use client';

import type { SectionNode, SectionTreeDTO } from '@tmt/shared';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** `'all'` = every case of the suite, `'none'` = cases without a section, number = section id. */
export type SectionSelection = number | 'all' | 'none';

/** Ids of the ancestors of `id` (to expand the path to the selected node). */
function pathTo(nodes: SectionNode[], id: number, trail: number[] = []): number[] | null {
  for (const n of nodes) {
    if (n.id === id) return trail;
    const found = pathTo(n.children, id, [...trail, n.id]);
    if (found) return found;
  }
  return null;
}

export function SectionTree({
  tree,
  selected,
  onSelect,
  renderActions,
  allLabel = 'All cases',
  unsectionedSelectable = true,
}: {
  tree: SectionTreeDTO;
  selected: SectionSelection;
  onSelect: (selection: SectionSelection) => void;
  /** Extra controls rendered at the right of a node (e.g. a menu). */
  renderActions?: (node: SectionNode) => ReactNode;
  allLabel?: string;
  unsectionedSelectable?: boolean;
}) {
  const [toggled, setExpanded] = useState<Set<number>>(
    () => new Set(tree.sections.map((s) => s.id)),
  );

  // The path to the selected section is always open (derived, so it cannot be collapsed away).
  const expanded = useMemo(() => {
    const path = typeof selected === 'number' ? pathTo(tree.sections, selected) : null;
    return path && path.some((id) => !toggled.has(id)) ? new Set([...toggled, ...path]) : toggled;
  }, [selected, tree.sections, toggled]);

  const toggle = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <nav aria-label="Sections" className="flex flex-col gap-px">
      <TreeRow
        depth={0}
        label={allLabel}
        count={tree.total}
        active={selected === 'all'}
        onClick={() => onSelect('all')}
        strong
      />
      {tree.sections.map((node) => (
        <TreeNode
          key={node.id}
          node={node}
          depth={0}
          expanded={expanded}
          toggle={toggle}
          selected={selected}
          onSelect={onSelect}
          renderActions={renderActions}
        />
      ))}
      {tree.unsectionedCount > 0 && (
        <TreeRow
          depth={0}
          label="Unsectioned"
          count={tree.unsectionedCount}
          active={selected === 'none'}
          onClick={unsectionedSelectable ? () => onSelect('none') : undefined}
          muted
        />
      )}
    </nav>
  );
}

function TreeNode({
  node,
  depth,
  expanded,
  toggle,
  selected,
  onSelect,
  renderActions,
}: {
  node: SectionNode;
  depth: number;
  expanded: Set<number>;
  toggle: (id: number) => void;
  selected: SectionSelection;
  onSelect: (selection: SectionSelection) => void;
  renderActions?: (node: SectionNode) => ReactNode;
}) {
  const isOpen = expanded.has(node.id);
  const hasChildren = node.children.length > 0;
  return (
    <>
      <TreeRow
        depth={depth}
        label={node.name}
        code={node.code}
        count={node.totalCount}
        active={selected === node.id}
        onClick={() => onSelect(node.id)}
        hasChildren={hasChildren}
        open={isOpen}
        onToggle={() => toggle(node.id)}
        actions={renderActions?.(node)}
      />
      {hasChildren &&
        isOpen &&
        node.children.map((child) => (
          <TreeNode
            key={child.id}
            node={child}
            depth={depth + 1}
            expanded={expanded}
            toggle={toggle}
            selected={selected}
            onSelect={onSelect}
            renderActions={renderActions}
          />
        ))}
    </>
  );
}

function TreeRow({
  depth,
  label,
  code,
  count,
  active,
  onClick,
  hasChildren,
  open,
  onToggle,
  actions,
  strong,
  muted,
}: {
  depth: number;
  label: string;
  code?: string | null;
  count: number;
  active: boolean;
  onClick?: () => void;
  hasChildren?: boolean;
  open?: boolean;
  onToggle?: () => void;
  actions?: ReactNode;
  strong?: boolean;
  muted?: boolean;
}) {
  const Body = onClick ? 'button' : 'div';
  return (
    <div
      className={cn('group flex items-center gap-0.5 rounded-lg', active && 'bg-accent')}
      style={{ paddingLeft: depth * 16 }}
    >
      {hasChildren ? (
        <button
          type="button"
          onClick={onToggle}
          aria-label={open ? `Collapse ${label}` : `Expand ${label}`}
          aria-expanded={open}
          className="grid h-8 w-6 shrink-0 place-items-center text-muted-foreground"
        >
          {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        </button>
      ) : (
        <span className="w-6 shrink-0" />
      )}
      <Body
        {...(onClick ? { type: 'button' as const, onClick } : {})}
        aria-current={active ? 'true' : undefined}
        className={cn(
          'flex min-h-8 min-w-0 flex-1 items-center justify-between gap-2 rounded-md px-1.5 py-1 text-left',
          onClick && 'cursor-pointer',
        )}
      >
        <span
          className={cn(
            'truncate text-sm',
            (active || strong) && 'font-semibold',
            active ? 'text-accent-foreground' : muted ? 'text-muted-foreground' : 'text-foreground',
          )}
          title={code ? `${code} · ${label}` : label}
        >
          {code && <span className="mr-1.5 font-mono text-xs text-muted-foreground">{code}</span>}
          {label}
        </span>
        <span
          className={cn(
            'shrink-0 text-xs',
            active ? 'text-accent-foreground' : 'text-muted-foreground',
          )}
        >
          {count}
        </span>
      </Body>
      {actions}
    </div>
  );
}

/** Flattened `{ value, label }` options with indentation, for section selects. */
export function useSectionOptions(tree: SectionTreeDTO | undefined, withNone = true) {
  return useMemo(() => {
    const out: { value: string; label: string }[] = withNone
      ? [{ value: '', label: 'Unsectioned' }]
      : [];
    const walk = (nodes: SectionNode[], depth: number) => {
      for (const n of nodes) {
        const name = n.code ? `${n.code} · ${n.name}` : n.name;
        out.push({ value: String(n.id), label: `${' '.repeat(depth)}${name}` });
        walk(n.children, depth + 1);
      }
    };
    if (tree) walk(tree.sections, 0);
    return out;
  }, [tree, withNone]);
}

/** Finds a node by id. */
export function findSection(nodes: SectionNode[], id: number): SectionNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const found = findSection(n.children, id);
    if (found) return found;
  }
  return null;
}

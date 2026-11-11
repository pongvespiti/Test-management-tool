'use client';

import type { SharedStepDTO } from '@tmt/shared';
import { Layers } from 'lucide-react';
import { useMemo, useState } from 'react';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorAlert, Spinner } from '@/components/common/error-alert';
import { MultilineText } from '@/components/common/multiline-text';
import { StepsView } from '@/components/common/steps-view';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { useSharedSteps } from '@/lib/api/shared-steps';
import { pluralize } from '@/lib/format';
import { routes } from '@/lib/routes';
import { cn } from '@/lib/utils';
import { useProject } from '@/providers/project-provider';
import { SearchInput } from '@/components/common/list-controls';

/** Name, description or any step text contains `q` (case-insensitive). */
export function matchesSharedStep(s: SharedStepDTO, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return (
    s.name.toLowerCase().includes(needle) ||
    (s.description ?? '').toLowerCase().includes(needle) ||
    s.steps.some(
      (p) => p.action.toLowerCase().includes(needle) || p.expected.toLowerCase().includes(needle),
    )
  );
}

/** Body of the "Insert shared steps" dialog: search, pick, preview, insert. */
export function SharedStepPicker({
  usedIds,
  onPick,
  onCancel,
}: {
  /** Shared steps the case already includes (marked in the list). */
  usedIds: ReadonlySet<number>;
  onPick: (sharedStep: SharedStepDTO) => void;
  onCancel: () => void;
}) {
  const { projectId, can } = useProject();
  const list = useSharedSteps(projectId);
  const [q, setQ] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const items = useMemo(
    () => (list.data ?? []).filter((s) => matchesSharedStep(s, q)),
    [list.data, q],
  );
  const selected = items.find((s) => s.id === selectedId) ?? items[0] ?? null;

  let body;
  if (list.isPending) {
    body = (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  } else if (list.isError) {
    body = (
      <ErrorAlert
        error={list.error}
        title="Shared steps could not be loaded"
        onRetry={() => void list.refetch()}
      />
    );
  } else if (list.data.length === 0) {
    body = (
      <EmptyState
        compact
        icon={<Layers className="size-6" strokeWidth={1.6} />}
        title="No shared steps yet"
        description="Shared steps are reusable step sets such as “Log in to the app” or “Pair the adapter”. Create them once, then insert them into any case."
        action={
          can('writeSharedSteps') && (
            <Button asChild variant="outline" size="sm">
              <a href={routes.sharedSteps(projectId)} target="_blank" rel="noopener">
                Open the Shared steps page
              </a>
            </Button>
          )
        }
      />
    );
  } else {
    body = (
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="max-h-[380px] overflow-y-auto">
          {items.length === 0 ? (
            <p className="p-2 text-sm text-muted-foreground">No shared steps match “{q.trim()}”.</p>
          ) : (
            <div role="listbox" aria-label="Shared steps" className="flex flex-col gap-1">
              {items.map((s) => {
                const active = selected?.id === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => setSelectedId(s.id)}
                    onDoubleClick={() => onPick(s)}
                    className={cn(
                      'rounded-lg border bg-card p-2 text-left',
                      active && 'border-[#74c0fc] bg-accent',
                    )}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold">{s.name}</span>
                      {usedIds.has(s.id) && <Badge variant="secondary">In this case</Badge>}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {pluralize(s.steps.length, 'step')} · used by{' '}
                      {pluralize(s.usageCount, 'case')}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="min-w-0 rounded-lg border p-3">
          {selected ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold">{selected.name}</p>
              {selected.description && (
                <MultilineText
                  value={selected.description}
                  className="text-xs text-muted-foreground"
                />
              )}
              <div className="max-h-[300px] overflow-y-auto">
                <StepsView steps={selected.steps.map((p) => ({ ...p, sharedStepName: null }))} />
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Pick a shared step to see its steps.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        The case refers to the shared steps: later edits of the shared steps apply to this case too.
      </p>
      <SearchInput
        placeholder="Search by name or step text"
        aria-label="Search shared steps"
        value={q}
        onValueChange={setQ}
        autoFocus
      />
      {body}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" disabled={!selected} onClick={() => selected && onPick(selected)}>
          Insert shared steps
        </Button>
      </DialogFooter>
    </div>
  );
}

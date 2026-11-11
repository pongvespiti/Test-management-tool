'use client';

import type { BuildDTO } from '@tmt/shared';
import { Package, Pencil, Plus, Trash2 } from 'lucide-react';
import { IconButton } from '@/components/common/icon-button';
import { Button } from '@/components/ui/button';
import { formatDate, pluralize } from '@/lib/format';

/** Builds of one release, listed under its row on the releases page. */
export function ReleaseBuilds({
  releaseName,
  builds,
  canManage,
  onAdd,
  onEdit,
  onDelete,
}: {
  releaseName: string;
  builds: BuildDTO[];
  canManage: boolean;
  onAdd: () => void;
  onEdit: (build: BuildDTO) => void;
  onDelete: (build: BuildDTO) => void;
}) {
  return (
    <section aria-label={`Builds of ${releaseName}`} className="flex flex-col gap-2 py-1">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          <Package aria-hidden className="size-3.5" />
          Builds ({builds.length})
        </h3>
        {canManage && (
          <Button
            size="sm"
            variant="outline"
            onClick={onAdd}
            aria-label={`Add build to ${releaseName}`}
          >
            <Plus />
            Add build
          </Button>
        )}
      </div>
      {builds.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No builds yet. Add the application builds you test, e.g. 1.1.7(1.0.0).
        </p>
      ) : (
        <ul className="divide-y rounded-md border bg-background">
          {builds.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
              <span className="min-w-[140px] font-mono text-sm font-semibold">{b.name}</span>
              <span className="w-[110px] text-xs text-muted-foreground">
                {formatDate(b.builtDate)}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                {b.notes}
              </span>
              <span className="text-xs text-muted-foreground">
                {pluralize(b.runCount, 'run')} · {pluralize(b.defectCount, 'defect')}
              </span>
              {canManage && (
                <span className="flex gap-1">
                  <IconButton label={`Edit build ${b.name}`} onClick={() => onEdit(b)}>
                    <Pencil />
                  </IconButton>
                  <IconButton
                    label={`Delete build ${b.name}`}
                    tone="danger"
                    onClick={() => onDelete(b)}
                  >
                    <Trash2 />
                  </IconButton>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

'use client';

import type { SharedStepDTO } from '@tmt/shared';
import { Layers, Pencil, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { ErrorAlert, Spinner } from '@/components/common/error-alert';
import { IconButton } from '@/components/common/icon-button';
import { MonoId } from '@/components/common/mono-id';
import { MultilineText } from '@/components/common/multiline-text';
import { StepsView } from '@/components/common/steps-view';
import { Button } from '@/components/ui/button';
import { useSharedStep } from '@/lib/api/shared-steps';
import { formatDateTime, formatRelative, pluralize } from '@/lib/format';
import { useProject } from '@/providers/project-provider';
import { FieldCaption } from '@/components/common/list-controls';
import { caseLink } from '@/features/cases/use-cases-url-state';

/** One shared step set: its steps and the library cases that use it ("Used by"). */
export function SharedStepDetail({
  id,
  onClose,
  onEdit,
  onDelete,
  showClose = true,
}: {
  id: number;
  onClose: () => void;
  onEdit: (s: SharedStepDTO) => void;
  onDelete: (s: SharedStepDTO) => void;
  /** The drawer has its own close button. */
  showClose?: boolean;
}) {
  const { projectId, can } = useProject();
  const query = useSharedStep(projectId, id);
  const s = query.data;

  if (query.isPending)
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  if (query.isError || !s)
    return (
      <div className="flex flex-col gap-3">
        <ErrorAlert error={query.error} onRetry={() => void query.refetch()} />
        <Button variant="outline" className="w-fit" onClick={onClose}>
          Close
        </Button>
      </div>
    );

  const more = s.usageCount - s.usedBy.length;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-2">
            <Layers aria-hidden className="size-[18px] shrink-0 text-muted-foreground" />
            <h2 className="text-lg font-semibold [overflow-wrap:anywhere]">{s.name}</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Version {s.version} · updated{' '}
            <span title={formatDateTime(s.updatedAt)}>{formatRelative(s.updatedAt)}</span>
            {s.updatedBy ? ` by ${s.updatedBy.displayName}` : ''}
          </p>
        </div>
        {showClose && (
          <IconButton label="Close details" onClick={onClose}>
            <X />
          </IconButton>
        )}
      </div>
      {(can('writeSharedSteps') || can('deleteLibrary')) && (
        <div className="flex gap-1.5">
          {can('writeSharedSteps') && (
            <Button size="sm" onClick={() => onEdit(s)}>
              <Pencil />
              Edit
            </Button>
          )}
          {can('deleteLibrary') && (
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => onDelete(s)}
            >
              <Trash2 />
              Delete
            </Button>
          )}
        </div>
      )}
      {s.description && <MultilineText value={s.description} />}
      <div>
        <FieldCaption className="mb-1.5">{`Steps (${s.steps.length})`}</FieldCaption>
        <StepsView steps={s.steps.map((p) => ({ ...p, sharedStepName: null }))} />
      </div>
      <div>
        <FieldCaption className="mb-1.5">{`Used by (${s.usageCount})`}</FieldCaption>
        {s.usedBy.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No test case uses these steps yet. Insert them from the case editor (“Steps” template →
            “Insert shared steps…”).
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {s.usedBy.map((c) => (
              <li key={c.id} className="flex min-w-0 items-center gap-2">
                <Link
                  href={caseLink(projectId, c)}
                  className="shrink-0 text-accent-foreground hover:underline"
                >
                  <MonoId>{c.displayId}</MonoId>
                </Link>
                <span className="truncate text-sm" title={c.title}>
                  {c.title}
                </span>
              </li>
            ))}
            {more > 0 && (
              <li className="text-xs text-muted-foreground">and {pluralize(more, 'more case')}</li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

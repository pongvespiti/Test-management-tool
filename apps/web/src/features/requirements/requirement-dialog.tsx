'use client';

import type { RequirementVia } from '@tmt/shared';
import { ExternalLink, Link2, Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { confirmDelete } from '@/components/common/confirm-host';
import { QueryState } from '@/components/common/error-alert';
import { MonoId } from '@/components/common/mono-id';
import { MultilineText } from '@/components/common/multiline-text';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useModalTarget } from '@/hooks/use-modal-target';
import { useDeleteRequirement, useRequirement } from '@/lib/api/requirements';
import { formatRelative } from '@/lib/format';
import { notifyError, notifySuccess } from '@/lib/notify';
import { routes } from '@/lib/routes';
import { useProject } from '@/providers/project-provider';
import { FieldLabel } from '../runs/run-ui';
import { LinkCasesDialog } from './link-cases-dialog';
import { RequirementForm } from './requirement-form';
import { RequirementSourceBadge } from './requirement-badges';

export const VIA_LABELS: Record<RequirementVia, string> = {
  linked: 'Linked',
  refs: 'Cites the ID',
  both: 'Linked and cited',
};

/** One requirement: text, source, the cases that test it; edit, link cases, delete. */
export function RequirementDialog({
  requirementId,
  onClose,
}: {
  requirementId: number;
  onClose: () => void;
}) {
  const { projectId, can } = useProject();
  const query = useRequirement(projectId, requirementId);
  const remove = useDeleteRequirement(projectId);
  const editor = useModalTarget<'edit'>();
  const linker = useModalTarget<'link'>();
  const r = query.data;
  const canWrite = can('writeRequirements');

  const del = () =>
    r &&
    confirmDelete(
      `requirement ${r.key}`,
      async () => {
        try {
          await remove.mutateAsync(r.id);
          notifySuccess(`${r.key} deleted.`);
          onClose();
        } catch (err) {
          notifyError(err, 'Could not delete the requirement');
        }
      },
      'Its links to cases are removed; the cases stay. Cases that cite the ID in their References still do.',
    );

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{r ? `${r.key} · ${r.title}` : 'Requirement'}</DialogTitle>
            <DialogDescription className="sr-only">Requirement details</DialogDescription>
          </DialogHeader>
          <QueryState query={query}>
            {r && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <RequirementSourceBadge source={r.source} />
                  {r.externalStatus && (
                    <span className="text-muted-foreground">Jira status: {r.externalStatus}</span>
                  )}
                  {r.syncedAt && (
                    <span className="text-muted-foreground">
                      Read from Jira {formatRelative(r.syncedAt)}
                    </span>
                  )}
                  {r.externalUrl && (
                    <a
                      href={r.externalUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      Open in Jira <ExternalLink className="size-3.5" />
                    </a>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <FieldLabel>Description</FieldLabel>
                  <MultilineText value={r.description} empty="No description." />
                </div>
                <div className="flex flex-col gap-1">
                  <FieldLabel>Source document</FieldLabel>
                  <p className="text-sm">{r.sourceRef ?? '—'}</p>
                </div>
                <div className="flex flex-col gap-2">
                  <FieldLabel>Cases ({r.cases.length})</FieldLabel>
                  {r.cases.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No case tests this requirement yet. Link cases here, or write “{r.key}” in a
                      case’s References.
                    </p>
                  ) : (
                    <ul aria-label={`Cases of ${r.key}`} className="flex flex-col gap-1.5">
                      {r.cases.map((c) => (
                        <li key={c.id} className="flex flex-wrap items-center gap-3 text-sm">
                          <Link
                            href={routes.cases(projectId, { case: c.id })}
                            className="text-primary hover:underline"
                          >
                            <MonoId>{c.displayId}</MonoId>
                          </Link>
                          <span className="min-w-0 flex-1">{c.title}</span>
                          <span className="text-muted-foreground">{c.suite.name}</span>
                          <span className="text-xs text-muted-foreground">{VIA_LABELS[c.via]}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </QueryState>
          {r && canWrite && (
            <DialogFooter className="sm:justify-between">
              <Button variant="outline" onClick={del} aria-label="Delete requirement">
                <Trash2 /> Delete
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => editor.open('edit')}>
                  <Pencil /> Edit
                </Button>
                <Button onClick={() => linker.open('link')}>
                  <Link2 /> Link cases
                </Button>
              </div>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
      {r && editor.opened && (
        <RequirementForm key={editor.key} requirement={r} onClose={editor.close} />
      )}
      {r && linker.opened && (
        <LinkCasesDialog key={linker.key} requirement={r} onClose={linker.close} />
      )}
    </>
  );
}

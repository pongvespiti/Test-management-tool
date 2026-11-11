'use client';

import { roleAtLeast } from '@tmt/shared';
import { Bookmark, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ComboboxSelect } from '@/components/common/combobox-select';
import { confirmDelete } from '@/components/common/confirm-host';
import { IconButton } from '@/components/common/icon-button';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useDeleteView, useSavedViews, useSaveView, type SummaryView } from '@/lib/api/reports';
import { notifyError, notifySuccess } from '@/lib/notify';
import { useAuth } from '@/providers/auth-provider';
import { useProject } from '@/providers/project-provider';
import { activeSavedView, cleanFilters } from './summary-format';

/** Picks, saves and deletes named summary views (rows, columns and filters). */
export function SavedViewsBar({
  projectId,
  view,
  onApply,
}: {
  projectId: number;
  view: SummaryView;
  onApply: (view: SummaryView) => void;
}) {
  const { role } = useProject();
  const { user } = useAuth();
  const views = useSavedViews(projectId);
  const remove = useDeleteView(projectId);
  const [saving, setSaving] = useState(false);
  const list = views.data ?? [];
  const active = activeSavedView(list, view);
  const canDelete = active !== null && (active.owner?.id === user?.id || roleAtLeast(role, 'lead'));

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Saved views">
      <ComboboxSelect
        aria-label="Saved views"
        className="w-[240px] max-w-full"
        icon={<Bookmark className="size-4" />}
        options={list.map((v) => ({
          value: String(v.id),
          label: v.name,
          hint: v.shared ? 'Shared' : undefined,
        }))}
        value={active ? String(active.id) : null}
        onChange={(id) => {
          const picked = list.find((v) => String(v.id) === id);
          if (picked) onApply(picked.config);
        }}
        placeholder={list.length === 0 ? 'No saved views' : 'Saved views'}
        emptyText="No saved views"
        searchable={list.length > 6}
        disabled={list.length === 0}
      />
      <Button
        variant="outline"
        size="sm"
        onClick={() => setSaving(true)}
        disabled={active !== null}
      >
        Save view…
      </Button>
      {canDelete && active && (
        <IconButton
          label={`Delete view ${active.name}`}
          tone="danger"
          onClick={() =>
            confirmDelete(`the view “${active.name}”`, async () => {
              try {
                await remove.mutateAsync(active.id);
                notifySuccess('View deleted');
              } catch (error) {
                notifyError(error, 'Could not delete the view');
              }
            })
          }
        >
          <Trash2 />
        </IconButton>
      )}
      {saving && (
        <SaveViewDialog projectId={projectId} view={view} onClose={() => setSaving(false)} />
      )}
    </div>
  );
}

function SaveViewDialog({
  projectId,
  view,
  onClose,
}: {
  projectId: number;
  view: SummaryView;
  onClose: () => void;
}) {
  const save = useSaveView(projectId);
  const [name, setName] = useState('');
  const [shared, setShared] = useState(false);
  const trimmed = name.trim();

  const submit = async () => {
    if (!trimmed) return;
    try {
      await save.mutateAsync({
        name: trimmed,
        shared,
        config: { rows: view.rows, cols: view.cols, filters: cleanFilters(view.filters) },
      });
      notifySuccess('View saved', shared ? 'Everyone in the project can use it.' : undefined);
      onClose();
    } catch (error) {
      notifyError(error, 'Could not save the view');
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save this view</DialogTitle>
          <DialogDescription>
            Keeps the rows, columns and filters you chose now, so you can come back to them in one
            click.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="view-name">Name</Label>
            <Input
              id="view-name"
              value={name}
              maxLength={80}
              autoFocus
              placeholder="e.g. Android, unit A, by OS version"
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch id="view-shared" checked={shared} onCheckedChange={setShared} />
            <Label htmlFor="view-shared" className="font-normal">
              Share with everyone in the project
            </Label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!trimmed || save.isPending}>
              Save view
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

'use client';

import {
  CASE_PRIORITIES,
  CASE_PRIORITY_LABELS,
  CASE_STATUS_LABELS,
  CASE_TYPES,
  type SectionTreeDTO,
} from '@tmt/shared';
import { Check, CheckCheck, ChevronDown, Move, Send, Tag, Trash2, X } from 'lucide-react';
import { useId, useState } from 'react';
import { CasePriorityLabel } from '@/components/common/case-priority-label';
import { confirmAction } from '@/components/common/confirm-host';
import { useSectionOptions } from '@/components/common/section-tree';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useBulkCases, type BulkCasesBody } from '@/lib/api/library';
import { useTags } from '@/lib/api/shared-steps';
import { pluralize } from '@/lib/format';
import { toId } from '@/lib/forms';
import { notifyError, notifySuccess } from '@/lib/notify';
import { cn } from '@/lib/utils';
import { useProject } from '@/providers/project-provider';
import { EDITABLE_STATUSES } from './case-form-model';
import { matchLabel } from '@/components/common/combobox-select';
import { SelectionBar } from '@/components/common/list-controls';
import { ReviewerField } from './review-dialogs';
import { TagsInput } from './tags-input';

type BulkAction = BulkCasesBody extends infer B
  ? B extends { action: string }
    ? Omit<B, 'ids'>
    : never
  : never;

type BulkDialog = 'addTags' | 'removeTags' | 'submitReview' | null;

const MENU_BUTTON = 'h-8 bg-card';

/** Actions on the selected cases: move, status, priority, type, tags, review, delete. */
export function BulkActionsBar({
  suiteId,
  tree,
  ids,
  onDone,
}: {
  suiteId: number;
  tree: SectionTreeDTO | undefined;
  ids: number[];
  onDone: () => void;
}) {
  const { projectId, project, can } = useProject();
  const reviewGated = project.requireCaseReview && !can('reviewCases');
  const bulk = useBulkCases(projectId);
  const sectionOptions = useSectionOptions(tree, true);
  const [moveOpen, setMoveOpen] = useState(false);
  const [target, setTarget] = useState<string | null>(null);
  const [dialog, setDialog] = useState<BulkDialog>(null);
  const count = pluralize(ids.length, 'case');

  const run = async (action: BulkAction, message: string, skippedHint?: string) => {
    try {
      const res = await bulk.mutateAsync({ suiteId, ids, ...action } as BulkCasesBody & {
        suiteId: number;
      });
      const skipped = ids.length - res.affected;
      notifySuccess(
        `${message} (${pluralize(res.affected, 'case')}).` +
          (skipped > 0 && skippedHint ? ` ${pluralize(skipped, 'case')} ${skippedHint}.` : ''),
      );
      onDone();
      return true;
    } catch (err) {
      notifyError(err, 'Bulk action failed');
      return false;
    }
  };

  return (
    <SelectionBar label={`${count} selected`}>
      <Popover
        open={moveOpen}
        onOpenChange={(o) => {
          setMoveOpen(o);
          if (o) setTarget(null);
        }}
      >
        <PopoverTrigger asChild>
          <Button size="sm" variant="outline" className={MENU_BUTTON}>
            <Move />
            Move
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[320px] p-3">
          <p className="mb-2 text-sm font-medium">Target section</p>
          <Command filter={matchLabel} className="rounded-md border">
            <CommandInput placeholder="Search sections…" autoFocus />
            <CommandList className="max-h-[220px]">
              <CommandEmpty>No sections</CommandEmpty>
              {sectionOptions.map((o) => (
                <CommandItem
                  key={o.value}
                  value={`opt:${o.value}`}
                  keywords={[o.label.trim()]}
                  onSelect={() => setTarget(o.value)}
                >
                  <span className="min-w-0 flex-1 truncate whitespace-pre">{o.label}</span>
                  <Check className={cn(target === o.value ? 'opacity-100' : 'opacity-0')} />
                </CommandItem>
              ))}
            </CommandList>
          </Command>
          <div className="mt-3 flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setMoveOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={target === null}
              loading={bulk.isPending}
              onClick={() => {
                setMoveOpen(false);
                void run({ action: 'move', sectionId: toId(target) }, 'Moved');
              }}
            >
              Move {count}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" className={MENU_BUTTON}>
            Status
            <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {EDITABLE_STATUSES.map((s) => (
            <DropdownMenuItem
              key={s}
              disabled={s === 'ready' && reviewGated}
              onSelect={() =>
                void run(
                  { action: 'setStatus', status: s },
                  `Status set to ${CASE_STATUS_LABELS[s]}`,
                )
              }
            >
              {CASE_STATUS_LABELS[s]}
            </DropdownMenuItem>
          ))}
          {reviewGated && (
            <DropdownMenuLabel className="max-w-[220px] text-xs font-normal whitespace-normal text-muted-foreground">
              Ready needs a lead’s approval: use Review → Submit for review.
            </DropdownMenuLabel>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" className={MENU_BUTTON}>
            Priority
            <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {CASE_PRIORITIES.map((p) => (
            <DropdownMenuItem
              key={p}
              onSelect={() =>
                void run(
                  { action: 'setPriority', priority: p },
                  `Priority set to ${CASE_PRIORITY_LABELS[p]}`,
                  'already had it',
                )
              }
            >
              <CasePriorityLabel priority={p} />
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" className={MENU_BUTTON}>
            Type
            <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {CASE_TYPES.map((t) => (
            <DropdownMenuItem
              key={t}
              onSelect={() => void run({ action: 'setType', caseType: t }, `Type set to ${t}`)}
            >
              {t}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {/* Not modal: the items open dialogs. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" className={MENU_BUTTON}>
            <Tag />
            Tags
            <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setDialog('addTags')}>Add tags…</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDialog('removeTags')}>Remove tags…</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" className={MENU_BUTTON}>
            Review
            <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setDialog('submitReview')}>
            <Send />
            Submit for review…
          </DropdownMenuItem>
          {can('reviewCases') && (
            <DropdownMenuItem
              onSelect={() =>
                confirmAction({
                  title: `Approve ${count}?`,
                  message:
                    'Cases in review become Ready. Selected cases that are not in review are skipped.',
                  confirmLabel: 'Approve',
                  onConfirm: () => run({ action: 'approve' }, 'Approved', 'were not in review'),
                })
              }
            >
              <CheckCheck />
              Approve
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {can('deleteLibrary') && (
        <Button
          size="sm"
          variant="outline"
          className={cn(MENU_BUTTON, 'text-destructive hover:text-destructive')}
          onClick={() =>
            confirmAction({
              title: `Delete ${count}?`,
              message:
                'Deleted cases disappear from the library. Results already recorded in runs are kept.',
              confirmLabel: 'Delete',
              danger: true,
              onConfirm: () => run({ action: 'delete' }, 'Deleted'),
            })
          }
        >
          <Trash2 />
          Delete
        </Button>
      )}
      <Button size="sm" variant="ghost" className="h-8" onClick={onDone}>
        <X />
        Clear
      </Button>

      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>
              {dialog === 'addTags'
                ? `Add tags to ${count}`
                : dialog === 'removeTags'
                  ? `Remove tags from ${count}`
                  : `Submit ${count} for review`}
            </DialogTitle>
          </DialogHeader>
          {(dialog === 'addTags' || dialog === 'removeTags') && (
            <BulkTagsForm
              mode={dialog}
              loading={bulk.isPending}
              onCancel={() => setDialog(null)}
              onSubmit={async (tags) => {
                const ok =
                  dialog === 'addTags'
                    ? await run({ action: 'addTags', tags }, 'Tags added', 'already had them')
                    : await run(
                        { action: 'removeTags', tags },
                        'Tags removed',
                        'did not have them',
                      );
                if (ok) setDialog(null);
              }}
            />
          )}
          {dialog === 'submitReview' && (
            <BulkSubmitReviewForm
              loading={bulk.isPending}
              onCancel={() => setDialog(null)}
              onSubmit={async (reviewerId) => {
                const ok = await run(
                  { action: 'submitReview', reviewerId },
                  'Submitted for review',
                  'were skipped (already in review or deprecated)',
                );
                if (ok) setDialog(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </SelectionBar>
  );
}

function BulkTagsForm({
  mode,
  loading,
  onCancel,
  onSubmit,
}: {
  mode: 'addTags' | 'removeTags';
  loading: boolean;
  onCancel: () => void;
  onSubmit: (tags: string[]) => Promise<void>;
}) {
  const { projectId } = useProject();
  const suggestions = useTags(projectId);
  const [tags, setTags] = useState<string[]>([]);
  const id = useId();
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-2">
        <Label htmlFor={id}>Tags</Label>
        <TagsInput
          id={id}
          aria-describedby={`${id}-description`}
          value={tags}
          onChange={setTags}
          suggestions={(suggestions.data ?? []).map((t) => t.tag)}
          maxTags={30}
          autoFocus
        />
        <p id={`${id}-description`} className="text-xs text-muted-foreground">
          {mode === 'addTags'
            ? 'Added to every selected case (a case keeps at most 30 tags)'
            : 'Removed from every selected case that has them'}
        </p>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          variant={mode === 'removeTags' ? 'destructive' : 'default'}
          disabled={tags.length === 0}
          loading={loading}
          onClick={() => void onSubmit(tags)}
        >
          {mode === 'addTags' ? 'Add tags' : 'Remove tags'}
        </Button>
      </DialogFooter>
    </div>
  );
}

function BulkSubmitReviewForm({
  loading,
  onCancel,
  onSubmit,
}: {
  loading: boolean;
  onCancel: () => void;
  onSubmit: (reviewerId: number | null) => Promise<void>;
}) {
  const [reviewer, setReviewer] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Draft and Ready cases go to the review queue; cases already in review or deprecated are
        skipped.
      </p>
      <ReviewerField value={reviewer} onChange={setReviewer} />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" loading={loading} onClick={() => void onSubmit(toId(reviewer))}>
          <Send />
          Submit for review
        </Button>
      </DialogFooter>
    </div>
  );
}

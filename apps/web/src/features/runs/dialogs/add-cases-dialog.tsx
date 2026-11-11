'use client';

import {
  CASE_PRIORITIES,
  CASE_PRIORITY_LABELS,
  CASE_STATUS_LABELS,
  type CasePriority,
  type RunDTO,
  type SectionNode,
} from '@tmt/shared';
import { Info } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { ErrorAlert } from '@/components/common/error-alert';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useAddRunCases } from '@/lib/api/automation';
import { useSectionTree } from '@/lib/api/library';
import { useTags } from '@/lib/api/shared-steps';
import { pluralize } from '@/lib/format';
import { notifyError, notifySuccess } from '@/lib/notify';
import { useProject } from '@/providers/project-provider';
import { MultiSelect, type MultiOption } from '@/components/common/multi-select';

type ReviewStatus = 'draft' | 'in_review' | 'ready';
const REVIEW_STATUSES: ReviewStatus[] = ['ready', 'in_review', 'draft'];

/** Sections of the tree in display order, indented by depth, with their case counts. */
export function flattenSections(nodes: SectionNode[], depth = 0, out: MultiOption[] = []) {
  for (const n of nodes) {
    out.push({
      value: String(n.id),
      label: `${'   '.repeat(depth)}${n.code ? `${n.code} · ${n.name}` : n.name}`,
      hint: n.totalCount,
    });
    flattenSections(n.children, depth + 1, out);
  }
  return out;
}

function AddCasesForm({ run, onDone }: { run: RunDTO; onDone: () => void }) {
  const { projectId } = useProject();
  const id = useId();
  const tree = useSectionTree(projectId, run.suite.id);
  const tags = useTags(projectId);
  const add = useAddRunCases(projectId);
  const [sectionIds, setSectionIds] = useState<string[]>([]);
  const [priorities, setPriorities] = useState<CasePriority[]>([]);
  const [tagValues, setTagValues] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<ReviewStatus[]>(['ready']);

  const sectionOptions = useMemo(() => flattenSections(tree.data?.sections ?? []), [tree.data]);
  const tagOptions = useMemo(
    () => (tags.data ?? []).map((t) => ({ value: t.tag, label: `${t.tag} (${t.count})` })),
    [tags.data],
  );

  const submit = async () => {
    try {
      const res = await add.mutateAsync({
        runId: run.id,
        ...(sectionIds.length > 0 && { sectionIds: sectionIds.map(Number) }),
        ...(priorities.length > 0 && { priorities }),
        ...(tagValues.length > 0 && { tags: tagValues }),
        caseStatuses: statuses,
      });
      if (res.added === 0)
        notifySuccess('No new cases matched — every matching case is already in the run.');
      else notifySuccess(`${pluralize(res.added, 'case')} added to run ${run.code}.`);
      onDone();
    } catch (err) {
      notifyError(err, 'Could not add the cases');
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Alert variant="info">
        <Info />
        <AlertDescription>
          <p>
            Cases come from suite <strong>{run.suite.name}</strong> and are appended in library
            order. Cases already in this run are skipped. Empty filters include everything.
          </p>
        </AlertDescription>
      </Alert>
      {tree.isError && <ErrorAlert error={tree.error} onRetry={() => void tree.refetch()} />}
      <div className="grid gap-2">
        <Label htmlFor={`${id}-sections`}>Sections</Label>
        <MultiSelect
          id={`${id}-sections`}
          aria-describedby={`${id}-sections-hint`}
          placeholder="All sections"
          emptyText="No sections"
          options={sectionOptions}
          value={sectionIds}
          onChange={setSectionIds}
          disabled={tree.isPending}
        />
        <p id={`${id}-sections-hint`} className="text-xs text-muted-foreground">
          Includes their sub-sections
        </p>
      </div>
      <div className="grid gap-2">
        <p id={`${id}-priority`} className="text-sm font-medium">
          Priority
        </p>
        <ToggleGroup
          type="multiple"
          variant="outline"
          size="sm"
          aria-labelledby={`${id}-priority`}
          value={priorities}
          onValueChange={(v) => setPriorities(v as CasePriority[])}
          className="flex-wrap"
        >
          {CASE_PRIORITIES.map((p) => (
            <ToggleGroupItem key={p} value={p} className="px-3">
              {CASE_PRIORITY_LABELS[p]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-tags`}>Tags</Label>
        <MultiSelect
          id={`${id}-tags`}
          aria-describedby={`${id}-tags-hint`}
          placeholder="Any tag"
          emptyText="No tags in this project"
          options={tagOptions}
          value={tagValues}
          onChange={setTagValues}
          maxValues={30}
          disabled={tags.isPending}
        />
        <p id={`${id}-tags-hint`} className="text-xs text-muted-foreground">
          Cases with at least one of these tags
        </p>
      </div>
      <div className="grid gap-1.5">
        <p id={`${id}-status`} className="text-sm font-medium">
          Review status
        </p>
        <p className="text-xs text-muted-foreground">Only ready cases are normally executed</p>
        <div role="group" aria-labelledby={`${id}-status`} className="mt-1 flex flex-wrap gap-4">
          {REVIEW_STATUSES.map((s) => (
            <label key={s} className="flex items-center gap-2 text-sm">
              <Checkbox
                aria-label={CASE_STATUS_LABELS[s]}
                checked={statuses.includes(s)}
                onCheckedChange={(c) =>
                  setStatuses((cur) =>
                    c === true
                      ? REVIEW_STATUSES.filter((x) => x === s || cur.includes(x))
                      : cur.filter((x) => x !== s),
                  )
                }
              />
              {CASE_STATUS_LABELS[s]}
            </label>
          ))}
        </div>
      </div>
      <DialogFooter className="mt-1">
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button
          onClick={() => void submit()}
          loading={add.isPending}
          disabled={statuses.length === 0}
        >
          Add cases
        </Button>
      </DialogFooter>
    </div>
  );
}

/**
 * Adds library cases of the run's suite (snapshots) to the run. Filters are ANDed; cases already in
 * the run are skipped by the server.
 */
export function AddCasesDialog({
  open,
  run,
  onClose,
}: {
  open: boolean;
  run: RunDTO;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle>Add cases to {run.code}</DialogTitle>
        </DialogHeader>
        {open && <AddCasesForm run={run} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

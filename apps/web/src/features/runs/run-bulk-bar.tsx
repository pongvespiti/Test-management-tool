'use client';

import {
  EXECUTED_STATUSES,
  RESULT_LABELS,
  RESULT_SHORTCUTS,
  type ExecutedStatus,
  type RunCaseDTO,
} from '@tmt/shared';
import { ChevronDown, Trash2, UserPlus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { confirmAction } from '@/components/common/confirm-host';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAssignRunCases, useRemoveRunCases } from '@/lib/api/automation';
import { ApiError } from '@/lib/api/client';
import { useMembers } from '@/lib/api/projects';
import { useBulkResults } from '@/lib/api/runs';
import { pluralize } from '@/lib/format';
import { notifyError, notifySuccess } from '@/lib/notify';
import { RESULT_TONES } from '@/lib/status';
import { useProject } from '@/providers/project-provider';
import { ComboboxSelect } from '@/components/common/combobox-select';
import { SelectionBar } from '@/components/common/list-controls';
import { assignableMembers } from './run-cases';

/** Actions on the selected run cases: set a result, assign, remove from the run. */
export function RunBulkBar({
  runId,
  ids,
  casesById,
  canExecute,
  canWrite,
  onDone,
}: {
  runId: number;
  ids: number[];
  casesById: ReadonlyMap<number, RunCaseDTO>;
  canExecute: boolean;
  canWrite: boolean;
  onDone: () => void;
}) {
  const { projectId, role } = useProject();
  const bulk = useBulkResults(projectId);
  const assign = useAssignRunCases(projectId);
  const remove = useRemoveRunCases(projectId);
  const members = useMembers(projectId);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignee, setAssignee] = useState<string | null>(null);
  const count = pluralize(ids.length, 'case');
  const executed = ids.filter((id) => (casesById.get(id)?.status ?? 'untested') !== 'untested');

  // Only testers and leads can be assignees (viewers are refused with UNKNOWN_USER).
  const assigneeOptions = useMemo(
    () => [
      { value: 'none', label: 'Run tester (clear assignee)' },
      ...assignableMembers(members.data ?? []),
    ],
    [members.data],
  );

  const setResult = async (status: ExecutedStatus) => {
    try {
      const res = await bulk.mutateAsync({ runId, runCaseIds: ids, status });
      notifySuccess(`${pluralize(res.affected, 'case')} set to ${RESULT_LABELS[status]}.`);
      onDone();
    } catch (err) {
      notifyError(err, 'Could not set the results');
    }
  };

  const doAssign = async () => {
    if (assignee === null) return;
    try {
      const assigneeId = assignee === 'none' ? null : Number(assignee);
      const res = await assign.mutateAsync({ runId, runCaseIds: ids, assigneeId });
      const who = assigneeOptions.find((o) => o.value === assignee)?.label ?? '';
      notifySuccess(
        assigneeId === null
          ? `${pluralize(res.affected, 'case')} now follow the run tester.`
          : `${pluralize(res.affected, 'case')} assigned to ${who}.`,
      );
      setAssignOpen(false);
      setAssignee(null);
      onDone();
    } catch (err) {
      notifyError(err, 'Could not assign the cases');
    }
  };

  const doRemove = async () => {
    try {
      const res = await remove.mutateAsync({ runId, runCaseIds: ids });
      notifySuccess(`${pluralize(res.removed, 'case')} removed from the run.`);
      onDone();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'EXECUTED_RUN_CASES')
        notifyError(err, 'Only a lead can remove executed cases');
      else notifyError(err, 'Could not remove the cases');
    }
  };

  const removeMessage =
    executed.length > 0
      ? `${pluralize(executed.length, 'case')} already ${executed.length === 1 ? 'has a result' : 'have results'}, which will be deleted with ${executed.length === 1 ? 'it' : 'them'}${role === 'lead' ? '' : ' — only a lead can remove executed cases'}. The library cases are not changed.`
      : 'The cases are removed from this run only; the library cases are not changed.';

  return (
    <SelectionBar label={`${count} selected`}>
      {canExecute && (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" loading={bulk.isPending}>
              Set result
              <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {EXECUTED_STATUSES.map((s) => (
              <DropdownMenuItem key={s} onSelect={() => void setResult(s)}>
                <span
                  aria-hidden
                  className="inline-block size-2.5 rounded-[3px]"
                  style={{ background: RESULT_TONES[s].bar }}
                />
                {RESULT_LABELS[s]}
                <DropdownMenuShortcut className="font-mono">
                  {RESULT_SHORTCUTS[s]}
                </DropdownMenuShortcut>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {canWrite && (
        <Popover open={assignOpen} onOpenChange={setAssignOpen}>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline">
              <UserPlus />
              Assign
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[300px]">
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">Assign to</p>
              <ComboboxSelect
                aria-label="Assign to"
                placeholder="Choose a tester"
                options={assigneeOptions}
                value={assignee}
                onChange={setAssignee}
              />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => setAssignOpen(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={assignee === null}
                  loading={assign.isPending}
                  onClick={() => void doAssign()}
                >
                  Assign {count}
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      )}
      {canWrite && (
        <Button
          size="sm"
          variant="outline"
          className="text-destructive hover:text-destructive"
          loading={remove.isPending}
          onClick={() =>
            confirmAction({
              title: `Remove ${count} from this run?`,
              message: removeMessage,
              confirmLabel: 'Remove',
              danger: true,
              onConfirm: doRemove,
            })
          }
        >
          {!remove.isPending && <Trash2 />}
          Remove
        </Button>
      )}
      <Button size="sm" variant="ghost" onClick={onDone}>
        <X />
        Clear
      </Button>
    </SelectionBar>
  );
}

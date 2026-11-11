'use client';

import type { TopicSuiteDTO } from '@tmt/shared';
import { useState } from 'react';
import { DateInput } from '@/components/common/date-input';
import { UserSelect } from '@/components/common/user-select';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAssignSuites } from '@/lib/api/topics';
import { pluralize } from '@/lib/format';
import { notifyError, notifySuccess } from '@/lib/notify';

/** Gives every run of a suite in the release to one person, with an optional due date. */
export function AssignSuiteDialog({
  projectId,
  releaseId,
  topic,
  suite,
  onClose,
}: {
  projectId: number;
  releaseId: number;
  topic: string;
  suite: TopicSuiteDTO;
  onClose: () => void;
}) {
  const assign = useAssignSuites(projectId);
  const current = suite.runs.find((r) => r.tester)?.tester ?? null;
  const [testerId, setTesterId] = useState<number | null>(current?.id ?? null);
  const [dueDate, setDueDate] = useState('');

  const submit = async () => {
    try {
      const result = await assign.mutateAsync({
        releaseId,
        suiteIds: [suite.suite.id],
        testerId,
        // Untouched = keep the due dates of the runs.
        dueDate: dueDate || undefined,
      });
      const locked = result.lockedRuns
        ? ` ${pluralize(result.lockedRuns, 'run')} in completed plans left as they were.`
        : '';
      notifySuccess(
        testerId ? 'Topic handed out' : 'Topic released',
        `${pluralize(result.updatedRuns, 'run')} updated.${locked}`,
      );
      onClose();
    } catch (error) {
      notifyError(error, 'Could not hand out the topic');
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Hand out {suite.suite.name}</DialogTitle>
          <DialogDescription>
            {topic} — all {pluralize(suite.runs.length, 'run')} of this suite in the release go to
            the person you pick. A run can still be changed one by one.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="assign-person" className="text-sm font-medium">
              Person
            </label>
            <UserSelect
              id="assign-person"
              projectId={projectId}
              value={testerId}
              onChange={setTesterId}
              roles={['tester', 'lead']}
              placeholder="No one (take the topic back)"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="assign-due" className="text-sm font-medium">
              Due date
            </label>
            <DateInput id="assign-due" value={dueDate} onChange={(v) => setDueDate(v ?? '')} />
            <p className="text-xs text-muted-foreground">
              Leave empty to keep the due dates the runs already have.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={assign.isPending}>
            {testerId ? 'Hand out' : 'Take back'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

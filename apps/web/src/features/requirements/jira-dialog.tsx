'use client';

import { useState } from 'react';
import { ErrorAlert } from '@/components/common/error-alert';
import { SegmentedControl } from '@/components/common/list-controls';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useImportRequirementsFromJira } from '@/lib/api/requirements';
import { notifySuccess } from '@/lib/notify';
import { useProject } from '@/providers/project-provider';
import { jiraResultText, parseJiraKeys } from './requirement-format';

type Mode = 'keys' | 'jql';

/** Reads issues from Jira into requirements. Jira is only read — nothing is written to it. */
export function JiraImportDialog({ onClose }: { onClose: () => void }) {
  const { projectId, project } = useProject();
  const read = useImportRequirementsFromJira(projectId);
  const [mode, setMode] = useState<Mode>('keys');
  const [text, setText] = useState('');
  const [error, setError] = useState<unknown>(null);
  const parsed = mode === 'keys' ? parseJiraKeys(text) : null;
  const ready =
    mode === 'keys' ? parsed!.keys.length > 0 && parsed!.invalid.length === 0 : text.trim() !== '';

  const submit = async () => {
    setError(null);
    try {
      const result = await read.mutateAsync(
        mode === 'keys' ? { keys: parsed!.keys } : { jql: text.trim() },
      );
      notifySuccess('Read from Jira', jiraResultText(result));
      onClose();
    } catch (e) {
      setError(e);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Read requirements from Jira</DialogTitle>
          <DialogDescription>
            Each issue becomes a requirement with its summary, description and status. Jira is only
            read, never changed. Read again later to refresh the status.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <SegmentedControl
            aria-label="How to choose issues"
            value={mode}
            onChange={(m) => {
              setMode(m);
              setError(null);
            }}
            options={[
              { value: 'keys', label: 'Issue keys' },
              { value: 'jql', label: 'JQL search' },
            ]}
          />
          <Textarea
            aria-label={mode === 'keys' ? 'Issue keys' : 'JQL search'}
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              mode === 'keys'
                ? 'IOT-12, IOT-13 …  (up to 100)'
                : `project = ${project.key} AND issuetype = Story`
            }
            aria-invalid={parsed !== null && parsed.invalid.length > 0}
          />
          {parsed && parsed.invalid.length > 0 && (
            <p role="alert" className="text-sm text-destructive">
              Not an issue key: {parsed.invalid.join(', ')}
            </p>
          )}
          {mode === 'jql' && (
            <p className="text-xs text-muted-foreground">The first 200 issues found are read.</p>
          )}
          {error !== null && <ErrorAlert error={error} />}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={read.isPending} disabled={!ready}>
            Read from Jira
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

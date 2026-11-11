'use client';

import { jiraIssueKeySchema, type DefectDTO, type IntegrationsStatusDTO } from '@tmt/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Link2, RefreshCw, Send, TriangleAlert, Unlink, X } from 'lucide-react';
import { useState } from 'react';
import { confirmAction } from '@/components/common/confirm-host';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api/client';
import {
  useCreateJiraIssue,
  useLinkJiraIssue,
  useSyncJiraIssue,
  useUnlinkJiraIssue,
} from '@/lib/api/defects';
import { qk } from '@/lib/api/keys';
import { formatDateTime, formatRelative } from '@/lib/format';
import { errorMessage, notifySuccess } from '@/lib/notify';
import { jiraIssueUrl, jiraMessages } from './defect-model';
import { JiraKey } from './jira';

type JiraStatus = NonNullable<IntegrationsStatusDTO['jira']>;

/**
 * Jira issue of a defect (ADR-008): create an issue, link an existing one by key, sync its status
 * on demand or unlink. Shown when the project's Jira integration is enabled.
 */
export function JiraPanel({
  defect,
  jira,
  canUse,
}: {
  defect: DefectDTO;
  jira: JiraStatus;
  canUse: boolean;
}) {
  const qc = useQueryClient();
  const create = useCreateJiraIssue(defect.projectId);
  const link = useLinkJiraIssue(defect.projectId);
  const sync = useSyncJiraIssue(defect.projectId);
  const unlink = useUnlinkJiraIssue(defect.projectId);
  const [error, setError] = useState<unknown>(null);
  const [key, setKey] = useState('');
  const [keyError, setKeyError] = useState<string | null>(null);
  const busy = create.isPending || link.isPending || sync.isPending || unlink.isPending;

  const run = async (action: () => Promise<DefectDTO>, success: (d: DefectDTO) => string) => {
    setError(null);
    try {
      const d = await action();
      notifySuccess(success(d));
    } catch (err) {
      setError(err);
      // The link changed elsewhere (ALREADY_LINKED, NOT_LINKED): show the current state.
      if (err instanceof ApiError && (err.status === 409 || err.code === 'NOT_LINKED'))
        void qc.invalidateQueries({ queryKey: qk.defect(defect.projectId, defect.id) });
    }
  };

  const onLink = async () => {
    const parsed = jiraIssueKeySchema.safeParse(key);
    if (!parsed.success) {
      setKeyError(parsed.error.issues[0]?.message ?? 'Enter a Jira issue key, e.g. TEAM-123');
      return;
    }
    setKeyError(null);
    setError(null);
    try {
      const d = await link.mutateAsync({ defectId: defect.id, key: parsed.data });
      notifySuccess(`${d.key} linked to ${d.externalKey ?? parsed.data}.`);
      setKey('');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'JIRA_ISSUE_NOT_FOUND') setKeyError(err.message);
      else setError(err);
    }
  };

  const linked = defect.externalKey;
  const url = linked ? (defect.externalUrl ?? jiraIssueUrl(jira.baseUrl, linked)) : null;
  const extra = jiraMessages(error);

  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <Alert variant="destructive" className="pr-10">
          <TriangleAlert />
          <AlertTitle>
            {error instanceof ApiError && error.code === 'JIRA_NOT_CONFIGURED'
              ? 'Jira is not configured'
              : 'Jira action failed'}
          </AlertTitle>
          <AlertDescription>
            <p>{errorMessage(error)}</p>
            {extra.map((m) => (
              <p key={m} className="text-xs">
                {m}
              </p>
            ))}
          </AlertDescription>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setError(null)}
            className="absolute top-2.5 right-2.5 flex size-6 items-center justify-center rounded-sm hover:bg-destructive/10"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </Alert>
      ) : null}

      {linked ? (
        <>
          <JiraKey issueKey={linked} url={url} status={defect.externalStatus} />
          <p
            className="text-xs text-muted-foreground"
            title={formatDateTime(defect.externalSyncedAt)}
          >
            {defect.externalSyncedAt
              ? `Status synced ${formatRelative(defect.externalSyncedAt)}`
              : 'Status not synced yet'}
          </p>
          {canUse && (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                loading={sync.isPending}
                disabled={busy && !sync.isPending}
                onClick={() =>
                  void run(
                    () => sync.mutateAsync({ defectId: defect.id }),
                    (d) => `Jira status: ${d.externalStatus ?? 'unknown'}.`,
                  )
                }
              >
                {!sync.isPending && <RefreshCw />}
                Sync status
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                disabled={busy}
                onClick={() =>
                  confirmAction({
                    title: `Unlink ${linked}?`,
                    message: `${defect.key} will no longer show the Jira issue. The issue itself stays in Jira.`,
                    confirmLabel: 'Unlink',
                    danger: true,
                    onConfirm: () =>
                      run(
                        () => unlink.mutateAsync({ defectId: defect.id }),
                        (d) => `${d.key} unlinked from Jira.`,
                      ),
                  })
                }
              >
                <Unlink />
                Unlink
              </Button>
            </div>
          )}
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Not linked to a Jira issue ({jira.projectKey}).
          </p>
          {canUse && (
            <>
              <Button
                size="sm"
                className="w-fit"
                loading={create.isPending}
                disabled={busy && !create.isPending}
                onClick={() =>
                  void run(
                    () => create.mutateAsync({ defectId: defect.id }),
                    (d) => `Jira issue ${d.externalKey ?? ''} created.`,
                  )
                }
              >
                {!create.isPending && <Send />}
                Create Jira issue
              </Button>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <Input
                    aria-label="Existing Jira issue key"
                    placeholder={`${jira.projectKey}-123`}
                    className="h-8 font-mono"
                    aria-invalid={Boolean(keyError)}
                    aria-describedby={keyError ? 'jira-key-error' : undefined}
                    value={key}
                    onChange={(e) => {
                      setKey(e.currentTarget.value);
                      setKeyError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void onLink();
                      }
                    }}
                  />
                  {keyError && (
                    <p id="jira-key-error" className="mt-1 text-xs text-destructive">
                      {keyError}
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  loading={link.isPending}
                  disabled={!key.trim() || (busy && !link.isPending)}
                  onClick={() => void onLink()}
                >
                  {!link.isPending && <Link2 />}
                  Link existing
                </Button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

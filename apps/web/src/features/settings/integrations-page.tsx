'use client';

import type { IntegrationsStatusDTO } from '@tmt/shared';
import { ExternalLink, Lock, SquareKanban } from 'lucide-react';
import type { ReactNode } from 'react';
import { ErrorAlert, Spinner } from '@/components/common/error-alert';
import { PageHeader } from '@/components/common/page-header';
import { StatusPill } from '@/components/common/status-pill';
import { Card } from '@/components/ui/card';
import { useIntegrationsStatus, useJiraConfig } from '@/lib/api/integrations';
import { GRAY, GREEN, ORANGE } from '@/lib/status';
import { useProject } from '@/providers/project-provider';
import { JiraSettingsForm } from './jira-settings-form';

type JiraStatus = IntegrationsStatusDTO['jira'];

const LINK = 'text-primary underline-offset-4 hover:underline';

function StatusBadge({ jira }: { jira: JiraStatus | undefined }) {
  if (jira === undefined) return null;
  if (!jira) return <StatusPill tone={GRAY}>Not set up</StatusPill>;
  return jira.enabled ? (
    <StatusPill tone={GREEN}>Enabled</StatusPill>
  ) : (
    <StatusPill tone={ORANGE}>Turned off</StatusPill>
  );
}

function JiraHeader({ jira }: { jira: JiraStatus | undefined }) {
  return (
    <div className="flex items-start gap-3">
      <span
        aria-hidden
        className="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground"
      >
        <SquareKanban className="size-6" />
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold">Jira</h2>
          <StatusBadge jira={jira} />
        </div>
        <p className="text-sm text-muted-foreground">
          Create Jira issues from defects, link existing issues and show their Jira status.
        </p>
      </div>
    </div>
  );
}

/** What a non-lead sees: the connection status only (no auth details). */
function JiraStatusView({ jira }: { jira: JiraStatus }) {
  if (!jira)
    return (
      <p className="text-sm text-muted-foreground">
        Jira is not connected to this project. A project lead can set it up on this page.
      </p>
    );
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-sm">
        <span className="w-[90px] text-muted-foreground">Jira site</span>
        <a
          href={jira.baseUrl}
          target="_blank"
          rel="noreferrer"
          className={`${LINK} inline-flex items-center gap-1`}
        >
          {jira.baseUrl}
          <ExternalLink aria-hidden className="size-3.5" />
        </a>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <span className="w-[90px] text-muted-foreground">Project</span>
        <span className="font-mono font-semibold">{jira.projectKey}</span>
      </div>
      <p className="mt-2 text-sm">
        {jira.enabled
          ? 'On a defect, use “Create Jira issue” or “Link Jira issue”; “Sync” refreshes the Jira status.'
          : 'The connection is turned off: Jira actions on defects are not available.'}
      </p>
    </div>
  );
}

function TokenHelp() {
  return (
    <Card className="gap-1 px-5">
      <h2 className="mb-1 font-semibold">Creating a token</h2>
      <p className="mt-2 text-sm font-semibold">
        Jira Server / Data Center — personal access token
      </p>
      <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm">
        <li>In Jira, open your profile picture → Profile.</li>
        <li>Choose Personal Access Tokens → Create token.</li>
        <li>Name it (e.g. “TMT”), set an expiry if your policy needs one, and copy it.</li>
      </ol>
      <p className="mt-4 text-sm font-semibold">Jira Cloud — e-mail + API token</p>
      <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm">
        <li>
          Go to{' '}
          <a
            href="https://id.atlassian.com/manage-profile/security/api-tokens"
            target="_blank"
            rel="noreferrer"
            className={LINK}
          >
            id.atlassian.com
          </a>{' '}
          → Security → Create and manage API tokens.
        </li>
        <li>Create API token, name it “TMT” and copy it.</li>
        <li>Use “E-mail + API token” with your Atlassian account e-mail.</li>
      </ol>
      <p className="mt-4 text-sm text-muted-foreground">
        Issues are created as the token&apos;s user, who needs the Browse projects and Create issues
        permissions in the Jira project. Use a service account if your team has one.
      </p>
      <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
        <Lock aria-hidden className="mt-0.5 size-4 shrink-0" />
        The token is encrypted on the TMT server (AES-256-GCM) and never sent back to the browser.
      </p>
    </Card>
  );
}

const loading = (
  <div className="flex justify-center py-8">
    <Spinner />
  </div>
);

export function IntegrationsPage() {
  const { project, projectId, can } = useProject();
  const canManage = can('manageIntegrations');
  const status = useIntegrationsStatus(projectId);
  const config = useJiraConfig(projectId, canManage);

  let body: ReactNode;
  if (canManage) {
    if (config.isPending) body = loading;
    else if (config.isError)
      body = (
        <ErrorAlert
          error={config.error}
          title="Could not load the Jira settings"
          onRetry={() => void config.refetch()}
        />
      );
    else body = <JiraSettingsForm projectId={projectId} config={config.data} />;
  } else if (status.isPending) {
    body = loading;
  } else if (status.isError) {
    body = (
      <ErrorAlert
        error={status.error}
        title="Could not load the Jira status"
        onRetry={() => void status.refetch()}
      />
    );
  } else {
    body = <JiraStatusView jira={status.data.jira} />;
  }

  return (
    <>
      <PageHeader
        title="Integrations"
        subtitle={`${project.name} · connect TMT to your issue tracker${
          canManage ? '' : ' (read only — leads can change the connection)'
        }`}
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card className="gap-4 px-5">
          <JiraHeader jira={status.data?.jira} />
          {body}
        </Card>
        {canManage && <TokenHelp />}
      </div>
    </>
  );
}

'use client';

import type { DefectDTO } from '@tmt/shared';
import { History, Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { DefectStatusBadge, PriorityLabel, SeverityLabel } from '@/components/common/badges';
import { confirmDelete } from '@/components/common/confirm-host';
import { CopyButton } from '@/components/common/copy-button';
import { ErrorAlert, QueryState, Spinner } from '@/components/common/error-alert';
import { MonoId } from '@/components/common/mono-id';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useActivity } from '@/lib/api/collab';
import { useDefect, useDeleteDefect } from '@/lib/api/defects';
import { useIntegrationsStatus } from '@/lib/api/integrations';
import { formatDateTime, formatRelative } from '@/lib/format';
import { toId } from '@/lib/forms';
import { notifyError, notifySuccess } from '@/lib/notify';
import { routes } from '@/lib/routes';
import { useProject } from '@/providers/project-provider';
import { AttachmentsPanel } from '../collab/attachments-panel';
import { CommentsPanel } from '../collab/comments-panel';
import { UserAvatar } from '../collab/user-avatar';
import { WIDE_DIALOG } from '../runs/run-case-defects';
import { FieldLabel, Property, TextBlock } from '../runs/run-ui';
import { DefectForm } from './defect-form';
import { DefectLinks } from './defect-links';
import { DefectWorkflow } from './defect-workflow';
import { JiraKey } from './jira';
import { JiraPanel } from './jira-panel';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="gap-3 px-5" aria-label={title} role="region">
      <h2 className="text-base font-semibold">{title}</h2>
      {children}
    </Card>
  );
}

/** Route `/projects/[projectId]/defects/[defectId]`. */
export function DefectDetailPage() {
  const { projectId } = useProject();
  const params = useParams<{ defectId?: string | string[] }>();
  const raw = params?.defectId;
  const defectId = toId(Array.isArray(raw) ? raw[0] : raw);
  const defect = useDefect(projectId, defectId);
  const crumbs = [{ label: 'Defects', href: routes.defects(projectId) }];

  if (defectId === null)
    return (
      <>
        <PageHeader title="Defect" breadcrumbs={crumbs} />
        <ErrorAlert error={new Error('This defect address is not valid.')} title="Not found" />
      </>
    );
  if (defect.isPending)
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  if (defect.isError || !defect.data)
    return (
      <>
        <PageHeader title="Defect" breadcrumbs={[...crumbs, { label: `#${defectId}` }]} />
        <div className="flex max-w-[560px] flex-col gap-4">
          <ErrorAlert error={defect.error} onRetry={() => void defect.refetch()} />
          <Button asChild variant="outline" className="w-fit">
            <Link href={routes.defects(projectId)}>Back to defects</Link>
          </Button>
        </div>
      </>
    );
  return <DefectDetail defect={defect.data} />;
}

/** Defect detail: reproduction, linked results, evidence, discussion, workflow and Jira. */
function DefectDetail({ defect: d }: { defect: DefectDTO }) {
  const { projectId, can } = useProject();
  const router = useRouter();
  const integrations = useIntegrationsStatus(projectId);
  const jira = integrations.data?.jira?.enabled ? integrations.data.jira : null;
  const remove = useDeleteDefect(projectId);
  const [editing, setEditing] = useState(false);
  const canEdit = can('writeDefects');
  const link = `${window.location.origin}${routes.defect(projectId, d.id)}`;

  const onDelete = () =>
    confirmDelete(`defect ${d.key}`, async () => {
      try {
        await remove.mutateAsync(d.id);
        notifySuccess(`${d.key} deleted.`);
        router.push(routes.defects(projectId));
      } catch (err) {
        notifyError(err, 'Could not delete the defect');
      }
    });

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Defects', href: routes.defects(projectId) }, { label: d.key }]}
        eyebrow={<MonoId className="text-sm">{d.key}</MonoId>}
        badges={
          <>
            <DefectStatusBadge status={d.status} />
            <span className="text-sm">
              <SeverityLabel severity={d.severity} />
            </span>
            <span className="text-sm text-muted-foreground">·</span>
            <span className="text-sm">
              Priority <PriorityLabel priority={d.priority} />
            </span>
          </>
        }
        title={d.title}
        subtitle={
          <>
            Reported by {d.reporter?.displayName ?? 'unknown'} ·{' '}
            <span title={formatDateTime(d.createdAt)}>{formatRelative(d.createdAt)}</span>
            {d.updatedAt !== d.createdAt && (
              <>
                {' '}
                · updated{' '}
                <span title={formatDateTime(d.updatedAt)}>{formatRelative(d.updatedAt)}</span>
              </>
            )}
          </>
        }
        actions={
          <>
            <CopyButton value={link} label="Copy link to this defect" />
            {canEdit && (
              <Button onClick={() => setEditing(true)}>
                <Pencil />
                Edit
              </Button>
            )}
            {can('deleteDefects') && (
              <Button
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={onDelete}
              >
                <Trash2 />
                Delete
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 min-[992px]:grid-cols-[minmax(0,1fr)_minmax(300px,360px)]">
        <div className="flex min-w-0 flex-col gap-4">
          <Section title="Reproduction">
            <div className="flex flex-col gap-4">
              {d.description && <TextBlock label="Description" value={d.description} />}
              <TextBlock label="Steps to reproduce" value={d.steps} empty="Not described" />
              <div className="grid gap-4 sm:grid-cols-2">
                <TextBlock label="Expected" value={d.expected} />
                <TextBlock label="Actual" value={d.actual} tone={d.actual ? 'red' : 'gray'} />
              </div>
            </div>
          </Section>

          <Section title={`Linked results (${d.links.length})`}>
            <DefectLinks defect={d} canEdit={canEdit} />
          </Section>

          <Section title={`Evidence (${d.attachments.length})`}>
            <AttachmentsPanel
              entityType="defect"
              entityId={d.id}
              attachments={d.attachments}
              canUpload={canEdit}
              pasteToUpload
            />
          </Section>

          <Card className="px-5">
            <Tabs defaultValue="comments">
              <TabsList>
                <TabsTrigger value="comments">Comments</TabsTrigger>
                <TabsTrigger value="activity">Activity</TabsTrigger>
              </TabsList>
              <TabsContent value="comments" className="pt-2">
                <CommentsPanel entityType="defect" entityId={d.id} canComment={can('comment')} />
              </TabsContent>
              <TabsContent value="activity" className="pt-2">
                <DefectActivity defectId={d.id} />
              </TabsContent>
            </Tabs>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Section title="Workflow">
            <DefectWorkflow defect={d} canEdit={canEdit} />
          </Section>

          <Section title="Details">
            <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-3">
              <Property label="Assignee">
                {d.assignee ? (
                  <span className="flex items-center gap-1.5">
                    <UserAvatar user={d.assignee} size={22} />
                    {d.assignee.displayName}
                  </span>
                ) : (
                  <span className="text-muted-foreground">Unassigned</span>
                )}
              </Property>
              <Property label="Reporter">{d.reporter?.displayName ?? '—'}</Property>
              <Property label="Release">{d.release?.name ?? '—'}</Property>
              <Property label="Found in build">{d.foundInBuild?.name ?? '—'}</Property>
              <Property label="Fixed in build">{d.fixedInBuild?.name ?? '—'}</Property>
              <Property label="Found in">{d.foundIn || '—'}</Property>
              <Property label="Fixed in">{d.fixedIn || '—'}</Property>
              <Property label="Resolved">{formatDateTime(d.resolvedAt)}</Property>
              <Property label="Closed">{formatDateTime(d.closedAt)}</Property>
              <Property label="Created">{formatDateTime(d.createdAt)}</Property>
            </dl>
            {d.environment && (
              <div className="mt-1 flex flex-col gap-1">
                <FieldLabel as="div">Environment</FieldLabel>
                <p className="text-sm whitespace-multiline">{d.environment}</p>
              </div>
            )}
          </Section>

          {jira ? (
            <Section title="Jira">
              <JiraPanel defect={d} jira={jira} canUse={can('useIntegrations')} />
            </Section>
          ) : d.externalKey ? (
            <Section title="External issue">
              <JiraKey issueKey={d.externalKey} url={d.externalUrl} status={d.externalStatus} />
            </Section>
          ) : null}
        </div>
      </div>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className={WIDE_DIALOG} onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Edit {d.key}</DialogTitle>
          </DialogHeader>
          {editing && (
            <DefectForm
              projectId={projectId}
              defect={d}
              showExternalKey={!jira}
              onDone={() => setEditing(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function DefectActivity({ defectId }: { defectId: number }) {
  const { projectId } = useProject();
  const activity = useActivity(projectId, { entityType: 'defect', entityId: defectId, limit: 50 });
  const list = activity.data ?? [];
  return (
    <QueryState query={activity}>
      {list.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <History className="size-4" aria-hidden />
          No activity recorded.
        </p>
      ) : (
        <ol className="m-0 ml-1 flex list-none flex-col gap-3 border-l-2 border-[#dee2e6] p-0 pl-4">
          {list.map((a) => (
            <li key={a.id} className="relative">
              <span
                aria-hidden
                className="absolute top-1.5 -left-[22px] size-2.5 rounded-full border-2 border-white bg-[#1971c2]"
              />
              <p className="text-sm">{a.summary}</p>
              <p className="text-xs text-muted-foreground" title={formatDateTime(a.createdAt)}>
                {a.user?.displayName ?? 'System'} · {formatRelative(a.createdAt)}
              </p>
            </li>
          ))}
        </ol>
      )}
    </QueryState>
  );
}

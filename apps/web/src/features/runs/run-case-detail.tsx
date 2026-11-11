'use client';

import {
  formatMinutes,
  RESULT_SOURCE_LABELS,
  type CaseRunHistoryItem,
  type ResultHistoryDTO,
  type RunCaseDTO,
  type RunDTO,
} from '@tmt/shared';
import { Clock, History, X } from 'lucide-react';
import Link from 'next/link';
import { useState, type Ref } from 'react';
import { CaseTypeBadge, ResultBadge } from '@/components/common/badges';
import { CasePriorityLabel } from '@/components/common/case-priority-label';
import { CopyButton } from '@/components/common/copy-button';
import { ErrorAlert } from '@/components/common/error-alert';
import { IconButton } from '@/components/common/icon-button';
import { MonoId } from '@/components/common/mono-id';
import { StepsView } from '@/components/common/steps-view';
import { TagList } from '@/components/common/tag-list';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useRunCase } from '@/lib/api/runs';
import { formatDateTime, formatRelative } from '@/lib/format';
import { routes } from '@/lib/routes';
import { useProject } from '@/providers/project-provider';
import { AttachmentsPanel } from '../collab/attachments-panel';
import { CommentsPanel } from '../collab/comments-panel';
import { UserAvatar } from '../collab/user-avatar';
import type { DraftStore, ResultDraft } from './drafts';
import { ResultForm, type ResultFormHandle } from './result-form';
import { RunCaseDefects } from './run-case-defects';
import { effectiveAssignee, PATH_SEP } from './run-cases';
import { FieldLabel, Property, TextBlock } from './run-ui';
import { formatClock } from './time';

interface Props {
  rc: RunCaseDTO;
  run: RunDTO;
  store: DraftStore;
  /** Tester role and plan not completed. */
  editable: boolean;
  canDefects: boolean;
  canComment: boolean;
  onNext: () => void;
  onClose?: () => void;
  formRef: Ref<ResultFormHandle>;
  /** Reads the form's current draft (for the defect prefill). */
  getDraft: () => ResultDraft | null;
}

/** Everything about one run case: the case snapshot, result entry, evidence, defects, history. */
export function RunCaseDetail({
  rc,
  run,
  store,
  editable,
  canDefects,
  canComment,
  onNext,
  onClose,
  formRef,
  getDraft,
}: Props) {
  const { projectId } = useProject();
  const detail = useRunCase(projectId, rc.id);
  const assignee = effectiveAssignee(rc, run);
  const link = `${window.location.origin}${routes.run(projectId, run.id, { case: rc.id })}`;
  const customDefs = run.suite.fieldDefs.filter((f) => (rc.custom[f.key] ?? '').trim() !== '');
  const history = detail.data?.history ?? [];
  const otherRuns = detail.data?.otherRuns ?? [];
  const retry = () => void detail.refetch();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <MonoId className="text-sm">{rc.displayId}</MonoId>
            {rc.code && (
              <Badge variant="outline" className="font-mono">
                {rc.code}
              </Badge>
            )}
            <CaseTypeBadge type={rc.caseType} />
            <span className="text-sm">
              <CasePriorityLabel priority={rc.priority} />
            </span>
          </div>
          <h2 className="text-xl leading-7 font-semibold [overflow-wrap:anywhere]">{rc.title}</h2>
          <p className="text-xs text-muted-foreground">
            {rc.sectionPath.length ? rc.sectionPath.join(PATH_SEP) : 'No section'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <CopyButton value={link} label="Copy link to this case" />
          {onClose && (
            <IconButton label="Close case" onClick={onClose}>
              <X />
            </IconButton>
          )}
        </div>
      </div>

      <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
        <Property label="Assignee">
          {assignee.user ? (
            <span className="flex items-center gap-1.5">
              <UserAvatar user={assignee.user} size={22} inherited={assignee.inherited} />
              <span className="min-w-0">
                {assignee.user.displayName}
                {assignee.inherited && (
                  <span className="block text-xs font-normal text-muted-foreground">
                    run tester
                  </span>
                )}
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">Unassigned</span>
          )}
        </Property>
        <Property label="Estimate">{formatMinutes(rc.estimateMinutes) || '—'}</Property>
        <Property label="Last executed">
          {rc.executedAt ? (
            <span title={formatDateTime(rc.executedAt)}>
              {formatRelative(rc.executedAt)}
              {rc.executedBy ? ` · ${rc.executedBy.displayName}` : ''}
            </span>
          ) : (
            '—'
          )}
        </Property>
        {rc.references && <Property label="References">{rc.references}</Property>}
        {rc.tags.length > 0 && (
          <Property label="Tags">
            <TagList tags={rc.tags} max={6} wrap />
          </Property>
        )}
        {customDefs.map((f) => (
          <Property key={f.key} label={f.label}>
            <span className="whitespace-multiline">{rc.custom[f.key]}</span>
          </Property>
        ))}
      </dl>

      {rc.precondition && <TextBlock label="Precondition" value={rc.precondition} />}
      {rc.steps.length === 0 && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
          <TextBlock label="Test procedure" value={rc.procedure} />
          <TextBlock label="Expected result" value={rc.expected} />
        </div>
      )}
      {rc.caseRemark && <TextBlock label="Case note" value={rc.caseRemark} />}

      <ResultForm
        key={rc.id}
        ref={formRef}
        rc={rc}
        runId={run.id}
        store={store}
        editable={editable}
        onNext={onNext}
      />

      <Separator />
      <section className="flex flex-col gap-2">
        <FieldLabel>Evidence ({detail.data?.attachments.length ?? rc.attachmentCount})</FieldLabel>
        {detail.isError ? (
          <ErrorAlert error={detail.error} onRetry={retry} />
        ) : (
          <AttachmentsPanel
            entityType="run_case"
            entityId={rc.id}
            attachments={detail.data?.attachments ?? []}
            canUpload={editable}
            pasteToUpload
          />
        )}
      </section>

      <section className="flex flex-col gap-2">
        <FieldLabel>Linked defects ({detail.data?.defects.length ?? rc.defectCount})</FieldLabel>
        <RunCaseDefects
          rc={rc}
          run={run}
          defects={detail.data?.defects}
          loading={detail.isPending}
          canWrite={canDefects}
          getDraft={getDraft}
        />
      </section>

      <Tabs defaultValue="history">
        <TabsList>
          <TabsTrigger value="history">
            History{history.length ? ` (${history.length})` : ''}
          </TabsTrigger>
          <TabsTrigger value="comments">Comments</TabsTrigger>
          <TabsTrigger value="runs">
            Other runs{otherRuns.length ? ` (${otherRuns.length})` : ''}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="history" className="pt-1">
          {detail.isError ? (
            <ErrorAlert error={detail.error} onRetry={retry} />
          ) : detail.isPending ? (
            <p className="text-sm text-muted-foreground">Loading history…</p>
          ) : history.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <History className="size-4" aria-hidden />
              No results recorded yet.
            </p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {history.map((h) => (
                <HistoryItem key={h.id} item={h} rc={rc} />
              ))}
            </ul>
          )}
        </TabsContent>
        <TabsContent value="comments" className="pt-1">
          <CommentsPanel entityType="run_case" entityId={rc.id} canComment={canComment} />
        </TabsContent>
        <TabsContent value="runs" className="pt-1">
          {otherRuns.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {detail.isPending ? 'Loading…' : 'This case has not been run elsewhere.'}
            </p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {otherRuns.map((r) => (
                <OtherRun key={r.runCaseId} item={r} projectId={projectId} />
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function HistoryItem({ item: h, rc }: { item: ResultHistoryDTO; rc: RunCaseDTO }) {
  const [open, setOpen] = useState(false);
  const hasSteps = Boolean(h.stepResults?.length) && rc.steps.length > 0;
  return (
    <li className="border-b border-[#edf0f2] pb-2">
      <div className="flex flex-wrap items-center gap-2">
        <ResultBadge status={h.status} />
        <span className="text-sm">
          {h.executedBy?.displayName ?? 'Unknown'}{' '}
          <span className="text-xs text-muted-foreground" title={formatDateTime(h.executedAt)}>
            · {formatDateTime(h.executedAt)}
          </span>
        </span>
        <Badge variant="secondary">{RESULT_SOURCE_LABELS[h.source]}</Badge>
        {h.elapsedSec ? (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="size-3" aria-hidden />
            {formatClock(h.elapsedSec)}
          </span>
        ) : null}
      </div>
      {h.actualResult && (
        <p className={`mt-1 text-sm whitespace-multiline ${open ? '' : 'line-clamp-3'}`}>
          {h.actualResult}
        </p>
      )}
      {h.remark && (
        <p className="mt-0.5 text-xs whitespace-multiline text-muted-foreground">
          Remark: {h.remark}
        </p>
      )}
      {hasSteps && (
        <>
          <Button
            size="sm"
            variant="ghost"
            className="mt-1 h-6 px-2 text-xs"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? 'Hide step results' : 'Show step results'}
          </Button>
          {open && (
            <div className="mt-1.5">
              <StepsView steps={rc.steps} results={h.stepResults} />
            </div>
          )}
        </>
      )}
    </li>
  );
}

function OtherRun({ item: r, projectId }: { item: CaseRunHistoryItem; projectId: number }) {
  return (
    <li className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <p className="truncate text-sm">
          <Link
            href={routes.run(projectId, r.runId, { case: r.runCaseId })}
            className="text-primary hover:underline"
          >
            Run {r.runCode}
          </Link>{' '}
          <span className="font-mono text-xs text-muted-foreground">{r.planDocNo}</span>
        </p>
        <p className="truncate text-xs text-muted-foreground" title={r.planTitle}>
          {r.releaseName ? `${r.releaseName} · ` : ''}
          {r.executedAt
            ? `${formatRelative(r.executedAt)}${r.executedBy ? ` · ${r.executedBy.displayName}` : ''}`
            : 'Not executed'}
        </p>
      </div>
      <ResultBadge status={r.status} />
    </li>
  );
}

/** Notice when the selected case id is not in this run. */
export function MissingRunCase({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <ErrorAlert
        title="Case not in this run"
        error={new Error('This run case does not exist in the run (it may have been removed).')}
      />
      <Button variant="outline" className="w-fit" onClick={onClose}>
        Close
      </Button>
    </div>
  );
}

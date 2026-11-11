'use client';

import type { SuiteDTO, TestCaseDTO } from '@tmt/shared';
import { CopyPlus, Pencil, Trash2, X } from 'lucide-react';
import { CaseStatusBadge, CaseTypeBadge } from '@/components/common/badges';
import { CasePriorityLabel } from '@/components/common/case-priority-label';
import { confirmDelete } from '@/components/common/confirm-host';
import { CopyButton } from '@/components/common/copy-button';
import { ErrorAlert, Spinner } from '@/components/common/error-alert';
import { IconButton } from '@/components/common/icon-button';
import { MonoId } from '@/components/common/mono-id';
import { TagList } from '@/components/common/tag-list';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useComments } from '@/lib/api/collab';
import { useCase, useCloneCase, useDeleteCase } from '@/lib/api/library';
import { notifyError, notifySuccess } from '@/lib/notify';
import { useProject } from '@/providers/project-provider';
import { CaseCommentsTab } from './case-comments-tab';
import { CaseDetailsTab } from './case-details-tab';
import { CaseHistoryTab } from './case-history-tab';
import { CaseResultsTab } from './case-results-tab';
import { CaseReviewPanel } from './case-review-panel';
import { caseLink } from './use-cases-url-state';

interface CaseDetailProps {
  caseId: number;
  suite: SuiteDTO;
  sectionName: (id: number) => string | null;
  onClose: () => void;
  onEdit: (tc: TestCaseDTO) => void;
  onOpenCase: (caseId: number) => void;
  /** The drawer has its own close button. */
  showClose?: boolean;
}

/** Header, actions and tabs of one library case (shown in a side panel or a drawer). */
export function CaseDetail({
  caseId,
  suite,
  sectionName,
  onClose,
  onEdit,
  onOpenCase,
  showClose = true,
}: CaseDetailProps) {
  const { projectId, can } = useProject();
  const query = useCase(projectId, caseId);
  const clone = useCloneCase(projectId);
  const remove = useDeleteCase(projectId);
  const comments = useComments(projectId, 'test_case', caseId);
  const tc = query.data;
  const commentCount = comments.data?.length ?? 0;

  if (query.isPending)
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  if (query.isError || !tc)
    return (
      <div className="flex flex-col gap-3">
        <ErrorAlert error={query.error} onRetry={() => void query.refetch()} />
        <Button variant="outline" className="w-fit" onClick={onClose}>
          Close
        </Button>
      </div>
    );

  const link = `${window.location.origin}${caseLink(projectId, tc)}`;

  const onClone = async () => {
    try {
      const copy = await clone.mutateAsync(tc.id);
      notifySuccess(`${copy.displayId} created as a copy of ${tc.displayId}.`);
      onOpenCase(copy.id);
    } catch (err) {
      notifyError(err, 'Could not clone the case');
    }
  };

  const onDelete = () =>
    confirmDelete(`test case ${tc.displayId}`, async () => {
      try {
        await remove.mutateAsync(tc.id);
        notifySuccess(`${tc.displayId} deleted.`);
        onClose();
      } catch (err) {
        notifyError(err, 'Could not delete the case');
      }
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <MonoId className="text-sm">{tc.displayId}</MonoId>
            {tc.code && (
              <Badge variant="outline" className="font-mono font-normal">
                {tc.code}
              </Badge>
            )}
            <CaseTypeBadge type={tc.caseType} />
            <CaseStatusBadge status={tc.status} />
            <span className="text-xs">
              <CasePriorityLabel priority={tc.priority} />
            </span>
          </div>
          <h2 className="text-lg leading-snug font-semibold [overflow-wrap:anywhere]">
            {tc.title}
          </h2>
          <p className="text-xs text-muted-foreground">
            {tc.sectionPath.length > 0 ? tc.sectionPath.join(' › ') : 'No section'}
          </p>
          {tc.tags.length > 0 && <TagList tags={tc.tags} max={6} wrap />}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <CopyButton value={link} label="Copy link to this case" />
          {showClose && (
            <IconButton label="Close case details" onClick={onClose}>
              <X />
            </IconButton>
          )}
        </div>
      </div>

      {can('writeLibrary') && (
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" onClick={() => onEdit(tc)}>
            <Pencil />
            Edit
          </Button>
          <Button
            size="sm"
            variant="outline"
            loading={clone.isPending}
            onClick={() => void onClone()}
          >
            <CopyPlus />
            Clone
          </Button>
          {can('deleteLibrary') && (
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={onDelete}
            >
              <Trash2 />
              Delete
            </Button>
          )}
        </div>
      )}

      <CaseReviewPanel testCase={tc} />

      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="comments">
            Comments
            {commentCount > 0 && (
              <Badge variant="secondary" className="h-5 min-w-5 rounded-full px-1.5">
                {commentCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="results">Results</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        <TabsContent value="details" className="pt-1">
          <CaseDetailsTab testCase={tc} suite={suite} />
        </TabsContent>
        <TabsContent value="comments" className="pt-1">
          <CaseCommentsTab caseId={tc.id} />
        </TabsContent>
        <TabsContent value="results" className="pt-1">
          <CaseResultsTab caseId={tc.id} />
        </TabsContent>
        <TabsContent value="history" className="pt-1">
          <CaseHistoryTab caseId={tc.id} fieldDefs={suite.fieldDefs} sectionName={sectionName} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

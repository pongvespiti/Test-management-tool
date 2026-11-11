'use client';

import type { BuildDTO, ReleaseDTO } from '@tmt/shared';
import { Flag, Pencil, Plus, Trash2 } from 'lucide-react';
import { Fragment } from 'react';
import { ReleaseStatusBadge } from '@/components/common/badges';
import { confirmDelete } from '@/components/common/confirm-host';
import { EmptyState } from '@/components/common/empty-state';
import { QueryState } from '@/components/common/error-alert';
import { IconButton } from '@/components/common/icon-button';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useModalTarget } from '@/hooks/use-modal-target';
import { useBuilds, useDeleteBuild } from '@/lib/api/builds';
import { ApiError } from '@/lib/api/client';
import { useDeleteRelease, useReleases } from '@/lib/api/projects';
import { formatDate } from '@/lib/format';
import { notifyError, notifySuccess } from '@/lib/notify';
import { useProject } from '@/providers/project-provider';
import { BuildFormDialog } from './build-form-dialog';
import { ReleaseBuilds } from './release-builds';
import { ReleaseFormDialog } from './release-form-dialog';

export function ReleasesPage() {
  const { project, projectId, can } = useProject();
  const releases = useReleases(projectId);
  const remove = useDeleteRelease(projectId);
  const builds = useBuilds(projectId, null);
  const removeBuild = useDeleteBuild(projectId);
  const editor = useModalTarget<ReleaseDTO | 'new'>();
  const buildEditor = useModalTarget<{ release: ReleaseDTO; build: BuildDTO | null }>();
  const canManage = can('manageReleases');
  const canManageBuilds = can('manageBuilds');
  const list = releases.data ?? [];
  const buildsOf = (releaseId: number) =>
    (builds.data ?? []).filter((b) => b.releaseId === releaseId);

  const onDeleteBuild = (b: BuildDTO) =>
    confirmDelete(`build “${b.name}”`, async () => {
      try {
        await removeBuild.mutateAsync(b.id);
        notifySuccess(`Build ${b.name} deleted.`);
      } catch (err) {
        if (err instanceof ApiError && err.code === 'BUILD_IN_USE') {
          notifyError(
            new Error('Test runs or defects use this build, so it cannot be deleted.'),
            'Build is in use',
          );
        } else {
          notifyError(err, 'Could not delete the build');
        }
      }
    });

  const onDelete = (r: ReleaseDTO) =>
    confirmDelete(`release “${r.name}”`, async () => {
      try {
        await remove.mutateAsync(r.id);
        notifySuccess(`Release ${r.name} deleted.`);
      } catch (err) {
        if (err instanceof ApiError && err.code === 'RELEASE_IN_USE') {
          notifyError(
            new Error(
              'Test plans or defects use this release. Set its status to Completed instead.',
            ),
            'Release is in use',
          );
        } else {
          notifyError(err, 'Could not delete the release');
        }
      }
    });

  const newButton = canManage && (
    <Button onClick={() => editor.open('new')}>
      <Plus />
      New release
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Releases"
        subtitle={`${project.name} · a release is a step of the product; list the application builds you test under it.`}
        actions={newButton}
      />
      <Card className="py-0">
        <QueryState query={releases}>
          {list.length === 0 ? (
            <EmptyState
              icon={<Flag className="size-6" strokeWidth={1.6} />}
              title="No releases yet"
              description="Releases are optional. Create one to filter the dashboard and plans by release."
              action={newButton}
            />
          ) : (
            <Table className="min-w-[640px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Release</TableHead>
                  <TableHead className="w-[130px]">Status</TableHead>
                  <TableHead className="w-[140px]">Start</TableHead>
                  <TableHead className="w-[140px]">End</TableHead>
                  {canManage && (
                    <TableHead className="w-[96px]">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((r) => (
                  <Fragment key={r.id}>
                    <TableRow>
                      <TableCell className="whitespace-normal">
                        <div className="text-sm font-semibold">{r.name}</div>
                        {r.description && (
                          <div className="line-clamp-2 text-xs text-muted-foreground">
                            {r.description}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <ReleaseStatusBadge status={r.status} />
                      </TableCell>
                      <TableCell>{formatDate(r.startDate)}</TableCell>
                      <TableCell>{formatDate(r.endDate)}</TableCell>
                      {canManage && (
                        <TableCell>
                          <div className="flex gap-1">
                            <IconButton label={`Edit ${r.name}`} onClick={() => editor.open(r)}>
                              <Pencil />
                            </IconButton>
                            <IconButton
                              label={`Delete ${r.name}`}
                              tone="danger"
                              onClick={() => onDelete(r)}
                            >
                              <Trash2 />
                            </IconButton>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                    <TableRow className="hover:bg-transparent">
                      <TableCell
                        colSpan={canManage ? 5 : 4}
                        className="bg-muted/30 whitespace-normal"
                      >
                        <ReleaseBuilds
                          releaseName={r.name}
                          builds={buildsOf(r.id)}
                          canManage={canManageBuilds}
                          onAdd={() => buildEditor.open({ release: r, build: null })}
                          onEdit={(build) => buildEditor.open({ release: r, build })}
                          onDelete={onDeleteBuild}
                        />
                      </TableCell>
                    </TableRow>
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          )}
        </QueryState>
      </Card>
      {buildEditor.target && (
        <BuildFormDialog
          open={buildEditor.opened}
          projectId={projectId}
          releaseId={buildEditor.target.release.id}
          build={buildEditor.target.build}
          formKey={buildEditor.key}
          onClose={buildEditor.close}
        />
      )}
      {editor.target && (
        <ReleaseFormDialog
          open={editor.opened}
          projectId={projectId}
          release={editor.target === 'new' ? null : editor.target}
          formKey={editor.key}
          onClose={editor.close}
        />
      )}
    </>
  );
}

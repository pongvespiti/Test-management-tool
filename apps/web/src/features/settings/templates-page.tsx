'use client';

import type { TemplateDTO } from '@tmt/shared';
import {
  Download,
  Ellipsis,
  FileSpreadsheet,
  ListChecks,
  Pencil,
  Star,
  Trash2,
  Upload,
} from 'lucide-react';
import { useMemo } from 'react';
import { confirmDelete } from '@/components/common/confirm-host';
import { QueryState } from '@/components/common/error-alert';
import { MonoId } from '@/components/common/mono-id';
import { PageHeader } from '@/components/common/page-header';
import { StatusPill } from '@/components/common/status-pill';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useModalTarget } from '@/hooks/use-modal-target';
import { useSuites } from '@/lib/api/library';
import {
  downloadTemplate,
  useDeleteTemplate,
  useTemplates,
  useUpdateTemplate,
} from '@/lib/api/templates';
import { formatDate } from '@/lib/format';
import { notifyError, notifySuccess } from '@/lib/notify';
import { BLUE, GRAY } from '@/lib/status';
import { useProject } from '@/providers/project-provider';
import { PlaceholderReference } from './placeholder-reference';
import { placeholderNames } from './placeholder-info';
import { TemplateCheckPanel } from './template-check-panel';
import { TemplateEditForm, TemplateUploadForm } from './template-forms';
import { TemplateHowTo } from './template-how-to';

export function TemplatesPage() {
  const { project, projectId, can } = useProject();
  const canManage = can('manageTemplates');
  const templates = useTemplates(projectId);
  const suites = useSuites(projectId, true);
  const update = useUpdateTemplate(projectId);
  const remove = useDeleteTemplate(projectId);
  const uploader = useModalTarget<true>();
  const editor = useModalTarget<TemplateDTO>();
  const checker = useModalTarget<TemplateDTO>();

  const list = templates.data ?? [];
  const names = useMemo(() => placeholderNames(suites.data), [suites.data]);
  const suiteName = (suiteId: number | null) => {
    if (suiteId === null) return null;
    const s = suites.data?.find((x) => x.id === suiteId);
    return s ? s.name : `Suite #${suiteId}`;
  };
  const customDefault = list.find((t) => t.isDefault && !t.builtIn) ?? null;

  const makeDefault = async (t: TemplateDTO) => {
    try {
      if (t.builtIn) {
        // The built-in template is the default whenever no uploaded template is.
        if (customDefault)
          await update.mutateAsync({ templateId: customDefault.id, isDefault: false });
      } else {
        await update.mutateAsync({ templateId: t.id, isDefault: true });
      }
      notifySuccess(`${t.name} is now the default report template.`);
    } catch (err) {
      notifyError(err, 'Could not change the default template');
    }
  };

  const onDelete = (t: TemplateDTO) =>
    confirmDelete(
      `template “${t.name}”`,
      async () => {
        try {
          await remove.mutateAsync(t.id);
          notifySuccess(`Template ${t.name} deleted.`);
        } catch (err) {
          notifyError(err, 'Could not delete the template');
        }
      },
      <p className="mt-2">
        Plans that use it export with the default template instead
        {t.isDefault ? ', and the built-in template becomes the default' : ''}.
      </p>,
    );

  const download = (t: TemplateDTO) =>
    void downloadTemplate(projectId, t).catch((err: unknown) =>
      notifyError(err, 'Download failed'),
    );

  const uploadButton = canManage && (
    <Button onClick={() => uploader.open(true)}>
      <Upload />
      Upload template
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Report templates"
        subtitle={`${project.name} · controlled Excel forms that test reports are exported into${
          canManage ? '' : ' (read only — leads can upload and edit)'
        }`}
        actions={uploadButton}
      />
      <div className="flex flex-col gap-6">
        <Card className="gap-0 py-0">
          <QueryState query={templates}>
            <Table className="min-w-[760px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Template</TableHead>
                  <TableHead className="w-[180px]">Suite</TableHead>
                  <TableHead className="w-[130px]">Run sheet</TableHead>
                  <TableHead className="w-[170px]">Added</TableHead>
                  <TableHead className={canManage ? 'w-[168px]' : 'w-[132px]'}>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((t) => {
                  const suite = suiteName(t.suiteId);
                  const canDefault = !t.isDefault && (!t.builtIn || customDefault !== null);
                  const hasMenu = canManage && (!t.builtIn || canDefault);
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="max-w-0 min-w-[260px] whitespace-normal">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold">{t.name}</span>
                          {t.isDefault && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex">
                                  <StatusPill
                                    tone={BLUE}
                                    leftSection={
                                      <Star aria-hidden className="size-2.5 fill-current" />
                                    }
                                  >
                                    Default
                                  </StatusPill>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                Used for plans that have no template chosen
                              </TooltipContent>
                            </Tooltip>
                          )}
                          {t.builtIn && <StatusPill tone={GRAY}>Built-in</StatusPill>}
                        </div>
                        {t.description && (
                          <p className="line-clamp-2 text-xs text-muted-foreground">
                            {t.description}
                          </p>
                        )}
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                          <FileSpreadsheet aria-hidden className="size-3.5 shrink-0 text-success" />
                          <span className="truncate font-mono">{t.fileName}</span>
                        </p>
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        {suite ?? <span className="text-muted-foreground">All suites</span>}
                      </TableCell>
                      <TableCell>
                        {t.runSheet ? (
                          <MonoId>{t.runSheet}</MonoId>
                        ) : (
                          <span className="text-muted-foreground">None</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {t.builtIn ? (
                          <span className="text-muted-foreground">Ships with TMT</span>
                        ) : (
                          <>
                            <p>{formatDate(t.createdAt)}</p>
                            {t.createdBy && (
                              <p className="text-xs text-muted-foreground">
                                by {t.createdBy.displayName}
                              </p>
                            )}
                          </>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="secondary"
                            className="text-accent-foreground"
                            onClick={() => checker.open(t)}
                            aria-label={`Check ${t.name}`}
                          >
                            <ListChecks />
                            Check
                          </Button>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                className="text-muted-foreground"
                                aria-label={`Download ${t.name}`}
                                onClick={() => download(t)}
                              >
                                <Download />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Download .xlsx</TooltipContent>
                          </Tooltip>
                          {canManage && !hasMenu && <span aria-hidden className="w-8" />}
                          {hasMenu && (
                            <DropdownMenu modal={false}>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  size="icon-sm"
                                  variant="ghost"
                                  className="text-muted-foreground"
                                  aria-label={`More actions for ${t.name}`}
                                >
                                  <Ellipsis />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {!t.builtIn && (
                                  <DropdownMenuItem onSelect={() => editor.open(t)}>
                                    <Pencil />
                                    Edit details
                                  </DropdownMenuItem>
                                )}
                                {canDefault && (
                                  <DropdownMenuItem onSelect={() => void makeDefault(t)}>
                                    <Star />
                                    Set as default
                                  </DropdownMenuItem>
                                )}
                                {!t.builtIn && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      variant="destructive"
                                      onSelect={() => onDelete(t)}
                                    >
                                      <Trash2 />
                                      Delete
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {list.length > 0 && list.every((t) => t.builtIn) && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-4">
                <p className="max-w-[640px] text-sm text-muted-foreground">
                  No uploaded templates yet. Upload the team&apos;s blank controlled form with
                  placeholders so exported reports match the document exactly.
                </p>
                {canManage && (
                  <Button
                    variant="secondary"
                    className="text-accent-foreground"
                    onClick={() => uploader.open(true)}
                  >
                    <Upload />
                    Upload template
                  </Button>
                )}
              </div>
            )}
          </QueryState>
        </Card>
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <TemplateHowTo />
          <PlaceholderReference projectId={projectId} names={names} />
        </div>
      </div>

      {uploader.target && (
        <Dialog open={uploader.opened} onOpenChange={(o) => !o && uploader.close()}>
          <DialogContent className="sm:max-w-[620px]">
            <DialogHeader>
              <DialogTitle>Upload report template</DialogTitle>
              <DialogDescription className="sr-only">
                The blank controlled form with placeholders, and how exports use it.
              </DialogDescription>
            </DialogHeader>
            <TemplateUploadForm
              key={uploader.key}
              projectId={projectId}
              suites={suites.data}
              onCancel={uploader.close}
              onUploaded={(t) => {
                uploader.close();
                checker.open(t);
              }}
            />
          </DialogContent>
        </Dialog>
      )}
      {editor.target && (
        <Dialog open={editor.opened} onOpenChange={(o) => !o && editor.close()}>
          <DialogContent className="sm:max-w-[620px]">
            <DialogHeader>
              <DialogTitle>Edit template</DialogTitle>
              <DialogDescription className="sr-only">
                Name, suite, description and run sheet of the template.
              </DialogDescription>
            </DialogHeader>
            <TemplateEditForm
              key={editor.key}
              projectId={projectId}
              template={editor.target}
              suites={suites.data}
              onDone={editor.close}
            />
          </DialogContent>
        </Dialog>
      )}
      {checker.target && (
        <Dialog open={checker.opened} onOpenChange={(o) => !o && checker.close()}>
          <DialogContent className="sm:max-w-[780px]">
            <DialogHeader>
              <DialogTitle>Check · {checker.target.name}</DialogTitle>
              <DialogDescription className="sr-only">
                Placeholders and sheets found in the template workbook.
              </DialogDescription>
            </DialogHeader>
            <TemplateCheckPanel
              key={checker.key}
              projectId={projectId}
              template={checker.target}
              names={names}
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

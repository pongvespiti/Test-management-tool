'use client';

import type { SectionNode, SectionTreeDTO, SuiteDTO } from '@tmt/shared';
import { Ellipsis, FolderPlus, Pencil, Plus, Trash2 } from 'lucide-react';
import { useId } from 'react';
import { confirmAction } from '@/components/common/confirm-host';
import { ErrorAlert, Spinner } from '@/components/common/error-alert';
import { SectionTree } from '@/components/common/section-tree';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { useModalTarget } from '@/hooks/use-modal-target';
import { useDeleteSection } from '@/lib/api/library';
import { pluralize } from '@/lib/format';
import { notifyError, notifySuccess } from '@/lib/notify';
import { useProject } from '@/providers/project-provider';
import { ComboboxSelect } from '@/components/common/combobox-select';
import { FieldCaption } from '@/components/common/list-controls';
import { SectionFormDialog, type SectionDialog } from './section-form';

interface SuitePanelProps {
  suites: SuiteDTO[];
  suite: SuiteDTO;
  tree: { data?: SectionTreeDTO; isPending: boolean; error: unknown; refetch: () => unknown };
  sectionId: number | null;
  /** "Unsectioned" is selected: cases without a section. */
  unsectioned: boolean;
  onSuiteChange: (suiteId: number) => void;
  onSectionChange: (sectionId: number | null) => void;
  onUnsectionedSelect: () => void;
}

/** Left column of the library: suite picker and section tree with section actions. */
export function SuitePanel({
  suites,
  suite,
  tree,
  sectionId,
  unsectioned,
  onSuiteChange,
  onSectionChange,
  onUnsectionedSelect,
}: SuitePanelProps) {
  const { projectId, can } = useProject();
  const canWrite = can('writeLibrary');
  const canDelete = can('deleteLibrary');
  const dialog = useModalTarget<SectionDialog>();
  const remove = useDeleteSection(projectId);
  const suiteSelectId = useId();

  const deleteSection = (node: SectionNode) => {
    const hasContent = node.totalCount > 0 || node.children.length > 0;
    confirmAction({
      title: `Delete section “${node.name}”?`,
      message: hasContent
        ? `Its ${pluralize(node.totalCount, 'test case')} and ${pluralize(node.children.length, 'sub-section')} move to ${
            node.parentId ? 'the parent section' : 'the top level'
          }. No test case is deleted.`
        : 'The section is empty.',
      confirmLabel: 'Delete section',
      danger: true,
      onConfirm: async () => {
        try {
          await remove.mutateAsync({ sectionId: node.id, moveContentToParent: hasContent });
          notifySuccess(`Section ${node.name} deleted.`);
          if (sectionId === node.id) onSectionChange(node.parentId);
        } catch (err) {
          notifyError(err, 'Could not delete the section');
        }
      },
    });
  };

  const renderActions = canWrite
    ? (node: SectionNode) => (
        // Not modal: the menu opens dialogs.
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-7 shrink-0 text-muted-foreground"
              aria-label={`Actions for section ${node.name}`}
            >
              <Ellipsis />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => dialog.open({ mode: 'create', parentId: node.id })}>
              <FolderPlus />
              Add sub-section
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => dialog.open({ mode: 'edit', node })}>
              <Pencil />
              Rename or move
            </DropdownMenuItem>
            {canDelete && (
              <DropdownMenuItem variant="destructive" onSelect={() => deleteSection(node)}>
                <Trash2 />
                Delete section
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )
    : undefined;

  return (
    <Card className="min-w-0 gap-3 px-3 py-3">
      <div className="grid gap-2">
        <Label htmlFor={suiteSelectId}>Suite</Label>
        <ComboboxSelect
          id={suiteSelectId}
          options={suites.map((s) => ({ value: String(s.id), label: `${s.name} (${s.prefix})` }))}
          value={String(suite.id)}
          onChange={(v) => v && onSuiteChange(Number(v))}
          searchable={suites.length > 8}
          searchPlaceholder="Search suites…"
        />
      </div>
      <div>
        <FieldCaption>Sections</FieldCaption>
        {tree.isPending ? (
          <div className="flex justify-center py-4">
            <Spinner />
          </div>
        ) : tree.error || !tree.data ? (
          <ErrorAlert
            error={tree.error ?? new Error('Sections not loaded.')}
            onRetry={() => void tree.refetch()}
          />
        ) : (
          <SectionTree
            tree={tree.data}
            selected={unsectioned ? 'none' : (sectionId ?? 'all')}
            onSelect={(sel) =>
              sel === 'none'
                ? onUnsectionedSelect()
                : onSectionChange(typeof sel === 'number' ? sel : null)
            }
            renderActions={renderActions}
            unsectionedSelectable
          />
        )}
      </div>
      {canWrite && (
        <Button
          variant="ghost"
          size="sm"
          className="w-fit text-primary"
          onClick={() => dialog.open({ mode: 'create', parentId: null })}
        >
          <Plus />
          New section
        </Button>
      )}
      {dialog.target && tree.data && (
        <SectionFormDialog
          open={dialog.opened}
          formKey={dialog.key}
          projectId={projectId}
          suiteId={suite.id}
          tree={tree.data}
          dialog={dialog.target}
          onClose={(section) => {
            dialog.close();
            if (section && dialog.target?.mode === 'create') onSectionChange(section.id);
          }}
        />
      )}
    </Card>
  );
}

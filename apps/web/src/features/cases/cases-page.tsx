'use client';

import type { TestCaseDTO } from '@tmt/shared';
import { Download, ListChecks, Plus, Upload } from 'lucide-react';
import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { EmptyState } from '@/components/common/empty-state';
import { QueryState, Spinner } from '@/components/common/error-alert';
import { PageHeader } from '@/components/common/page-header';
import { findSection } from '@/components/common/section-tree';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useModalTarget } from '@/hooks/use-modal-target';
import {
  downloadSuiteExport,
  useCase,
  useCases,
  useSectionTree,
  useSuites,
} from '@/lib/api/library';
import { notifyError } from '@/lib/notify';
import { routes } from '@/lib/routes';
import { cn } from '@/lib/utils';
import { useProject } from '@/providers/project-provider';
import { CaseDetail } from './case-detail';
import { CaseFormDialog } from './case-form';
import { CaseListPanel, PAGE_SIZE } from './case-list-panel';
import { SuitePanel } from './suite-panel';
import { useCasesUrlState } from './use-cases-url-state';

const NO_IDS: ReadonlySet<number> = new Set();

/** Test case library: suite + section tree, searchable case table, detail panel and editor. */
export function CasesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      }
    >
      <CaseLibrary />
    </Suspense>
  );
}

function CaseLibrary() {
  const { project, projectId, can } = useProject();
  const url = useCasesUrlState();
  const { update } = url;
  const suites = useSuites(projectId);
  const suiteList = useMemo(() => suites.data ?? [], [suites.data]);
  const suite = suiteList.find((s) => s.id === url.suiteId) ?? suiteList[0] ?? null;
  const tree = useSectionTree(projectId, suite?.id ?? null);
  const cases = useCases(projectId, suite?.id ?? null, {
    sectionId: url.unsectioned ? undefined : (url.sectionId ?? undefined),
    unsectioned: url.unsectioned || undefined,
    q: url.q || undefined,
    caseType: url.caseType ?? undefined,
    status: url.status ?? undefined,
    priority: url.priority.length > 0 ? url.priority : undefined,
    tag: url.tag || undefined,
    page: url.page,
    pageSize: PAGE_SIZE,
  });
  const openCase = useCase(projectId, url.caseId);
  const editor = useModalTarget<{ testCase: TestCaseDTO | null }>();
  const wide = useMediaQuery('(min-width: 100em)');

  // A case linked from elsewhere may belong to another suite: switch to it.
  const linkedSuiteId = openCase.data?.suiteId;
  useEffect(() => {
    if (
      linkedSuiteId &&
      suite &&
      linkedSuiteId !== suite.id &&
      suiteList.some((s) => s.id === linkedSuiteId)
    )
      update({ suiteId: linkedSuiteId, sectionId: null, unsectioned: false });
  }, [linkedSuiteId, suite, suiteList, update]);

  // The selection belongs to one list scope; changing suite, section or filters clears it.
  const scope = [
    suite?.id,
    url.sectionId,
    url.unsectioned,
    url.q,
    url.caseType,
    url.status,
    url.priority.join(','),
    url.tag,
  ].join('|');
  const [selection, setSelection] = useState({ scope, ids: NO_IDS });
  const selected = selection.scope === scope ? selection.ids : NO_IDS;
  const setSelected = useCallback(
    (ids: ReadonlySet<number>) => setSelection({ scope, ids }),
    [scope],
  );

  const sectionName = useCallback(
    (id: number) => findSection(tree.data?.sections ?? [], id)?.name ?? null,
    [tree.data],
  );
  const openCaseId = useCallback((id: number) => update({ caseId: id }, { push: true }), [update]);
  const closeCase = useCallback(() => update({ caseId: null }), [update]);

  if (suites.isPending || suites.isError) return <QueryState query={suites}>{null}</QueryState>;

  const header = (
    <PageHeader
      title="Test cases"
      subtitle={project.name}
      actions={
        suite && (
          <>
            <Button
              variant="outline"
              onClick={() =>
                void downloadSuiteExport(projectId, suite).catch((e) =>
                  notifyError(e, 'Export failed'),
                )
              }
            >
              <Download />
              Export
            </Button>
            {can('import') && (
              <Button asChild variant="outline">
                <Link href={routes.import(projectId, { suite: suite.id })}>
                  <Upload />
                  Import from Excel
                </Link>
              </Button>
            )}
            {can('writeLibrary') && (
              <Button onClick={() => editor.open({ testCase: null })}>
                <Plus />
                New case
              </Button>
            )}
          </>
        )
      }
    />
  );

  if (!suite)
    return (
      <>
        {header}
        <Card>
          <EmptyState
            icon={<ListChecks className="size-6" strokeWidth={1.6} />}
            title="No test suites yet"
            description="Import an Excel workbook to create a suite with its cases, or create an empty suite first."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                {can('import') && (
                  <Button asChild>
                    <Link href={routes.import(projectId)}>
                      <Upload />
                      Import from Excel
                    </Link>
                  </Button>
                )}
                {can('manageSuites') && (
                  <Button asChild variant="outline">
                    <Link href={routes.settingsSuites(projectId)}>Create a suite</Link>
                  </Button>
                )}
              </div>
            }
          />
        </Card>
      </>
    );

  const selectedNode = url.sectionId ? findSection(tree.data?.sections ?? [], url.sectionId) : null;
  const inlineDetail = wide && url.caseId !== null;
  const detail = url.caseId !== null && (
    <CaseDetail
      caseId={url.caseId}
      suite={suite}
      sectionName={sectionName}
      onClose={closeCase}
      onEdit={(tc) => editor.open({ testCase: tc })}
      onOpenCase={openCaseId}
      showClose={inlineDetail}
    />
  );

  return (
    <>
      {header}
      <div
        className={cn(
          'grid items-start gap-4',
          inlineDetail
            ? 'min-[62em]:grid-cols-[260px_minmax(0,1fr)_minmax(380px,460px)]'
            : 'min-[62em]:grid-cols-[280px_minmax(0,1fr)]',
        )}
      >
        <SuitePanel
          suites={suiteList}
          suite={suite}
          tree={tree}
          sectionId={url.sectionId}
          unsectioned={url.unsectioned}
          onSuiteChange={(id) =>
            update({ suiteId: id, sectionId: null, unsectioned: false, caseId: null })
          }
          onSectionChange={(id) => update({ sectionId: id, unsectioned: false })}
          onUnsectionedSelect={() => update({ unsectioned: true })}
        />
        <CaseListPanel
          suite={suite}
          tree={tree.data}
          url={url}
          onFilter={update}
          cases={cases}
          showSection={!selectedNode || selectedNode.children.length > 0}
          onOpen={(tc) => openCaseId(tc.id)}
          selection={can('writeLibrary') ? { ids: selected, set: setSelected } : undefined}
        />
        {inlineDetail && (
          <Card className="sticky top-[77px] max-h-[calc(100vh-93px)] overflow-y-auto px-5">
            {detail}
          </Card>
        )}
      </div>

      <Sheet open={url.caseId !== null && !wide} onOpenChange={(o) => !o && closeCase()}>
        <SheetContent aria-describedby={undefined} className="w-full gap-0 sm:max-w-[680px]">
          <SheetHeader className="border-b px-6 py-4">
            <SheetTitle>Test case</SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{!wide && detail}</div>
        </SheetContent>
      </Sheet>

      {editor.target && (
        <CaseFormDialog
          open={editor.opened}
          formKey={editor.key}
          projectId={projectId}
          suite={suite}
          tree={tree.data}
          testCase={editor.target.testCase}
          defaultSectionId={url.sectionId}
          onClose={(saved) => {
            editor.close();
            if (saved && !editor.target?.testCase) openCaseId(saved.id);
          }}
        />
      )}
    </>
  );
}

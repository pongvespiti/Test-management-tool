'use client';

import { FolderPlus, Plus } from 'lucide-react';
import { Suspense, useId, useState } from 'react';
import { EmptyState } from '@/components/common/empty-state';
import { QueryState, Spinner } from '@/components/common/error-alert';
import { MonoId } from '@/components/common/mono-id';
import { PageHeader } from '@/components/common/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useModalTarget } from '@/hooks/use-modal-target';
import { useSuites } from '@/lib/api/library';
import { toId } from '@/lib/forms';
import { cn } from '@/lib/utils';
import { useProject } from '@/providers/project-provider';
import { useUrlSearchParams } from '@/hooks/use-url-search-params';
import { CreateSuiteDialog } from './create-suite-dialog';
import { SuiteEditor } from './suite-editor';

/** Suites & fields: suites of the project with their custom fields and environment labels. */
export function SuitesSettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      }
    >
      <SuitesSettings />
    </Suspense>
  );
}

function SuitesSettings() {
  const { project, projectId, can } = useProject();
  const canManage = can('manageSuites');
  const [showArchived, setShowArchived] = useState(false);
  const suites = useSuites(projectId, true);
  const [params, setParams] = useUrlSearchParams();
  const creator = useModalTarget<true>();
  const switchId = useId();

  const all = suites.data ?? [];
  const visible = all.filter((s) => showArchived || !s.isArchived);
  const requested = toId(params.get('suite'));
  const selected = all.find((s) => s.id === requested) ?? visible[0] ?? null;
  const archivedCount = all.filter((s) => s.isArchived).length;

  const select = (suiteId: number | null) =>
    setParams((prev) => {
      if (suiteId) prev.set('suite', String(suiteId));
      else prev.delete('suite');
      return prev;
    });

  const newButton = canManage && (
    <Button onClick={() => creator.open(true)}>
      <Plus />
      New suite
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Suites & fields"
        subtitle={`${project.name} · custom fields and environment labels per suite${canManage ? '' : ' (read only — leads can edit)'}`}
        actions={newButton}
      />
      <QueryState query={suites}>
        {all.length === 0 ? (
          <Card>
            <EmptyState
              icon={<FolderPlus className="size-6" strokeWidth={1.6} />}
              title="No suites yet"
              description="Create a suite for each family of test cases, or import an Excel workbook to create one."
              action={newButton}
            />
          </Card>
        ) : (
          <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:grid-cols-[minmax(0,1fr)_minmax(0,3fr)]">
            <Card className="gap-1 p-2">
              <nav aria-label="Suites" className="flex flex-col gap-1">
                {visible.map((s) => {
                  const active = selected?.id === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => select(s.id)}
                      aria-current={active ? 'true' : undefined}
                      className={cn(
                        'rounded-lg px-3 py-2 text-left hover:bg-muted',
                        active && 'bg-accent hover:bg-accent',
                      )}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            'truncate text-sm',
                            active ? 'font-semibold text-accent-foreground' : 'font-medium',
                          )}
                        >
                          {s.name}
                        </span>
                        {s.isArchived && <Badge variant="secondary">Archived</Badge>}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <MonoId>{s.prefix}</MonoId>
                        <span className="text-xs text-muted-foreground">
                          · {s.caseCount} cases · {s.fieldDefs.length} fields
                        </span>
                      </span>
                    </button>
                  );
                })}
                {archivedCount > 0 && (
                  <div className="mx-3 mt-2 mb-1 flex items-center gap-2">
                    <Switch
                      id={switchId}
                      checked={showArchived}
                      onCheckedChange={setShowArchived}
                    />
                    <Label htmlFor={switchId} className="text-xs font-normal">
                      Show archived ({archivedCount})
                    </Label>
                  </div>
                )}
              </nav>
            </Card>
            {selected ? (
              <SuiteEditor
                key={selected.id}
                projectId={projectId}
                suite={selected}
                readOnly={!canManage}
                onDeleted={() => select(null)}
              />
            ) : (
              <Card>
                <EmptyState compact title="Select a suite" />
              </Card>
            )}
          </div>
        )}
      </QueryState>
      {creator.target && (
        <CreateSuiteDialog
          open={creator.opened}
          formKey={creator.key}
          projectId={projectId}
          onClose={creator.close}
          onCreated={(suite) => {
            creator.close();
            select(suite.id);
          }}
        />
      )}
    </>
  );
}

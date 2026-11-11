'use client';

import {
  REQUIREMENT_SOURCES,
  REQUIREMENT_SOURCE_LABELS,
  type RequirementListItemDTO,
  type RequirementSource,
} from '@tmt/shared';
import { FileSpreadsheet, Plus, RefreshCw, ScrollText } from 'lucide-react';
import { EmptyState } from '@/components/common/empty-state';
import { QueryState } from '@/components/common/error-alert';
import { SearchInput, SegmentedControl } from '@/components/common/list-controls';
import { MonoId } from '@/components/common/mono-id';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useDebouncedValue } from '@/hooks/use-debounce';
import { useModalTarget } from '@/hooks/use-modal-target';
import { useUrlSearchParams } from '@/hooks/use-url-search-params';
import { useIntegrationsStatus } from '@/lib/api/integrations';
import { useRequirements, useSyncRequirementsFromJira } from '@/lib/api/requirements';
import { notifyError, notifySuccess } from '@/lib/notify';
import { useProject } from '@/providers/project-provider';
import { ImportRequirementsDialog } from './import-dialog';
import { JiraImportDialog } from './jira-dialog';
import { RequirementSourceBadge } from './requirement-badges';
import { RequirementDialog } from './requirement-dialog';
import { jiraResultText } from './requirement-format';
import { RequirementForm } from './requirement-form';

type Filter = RequirementSource | 'all';
const FILTERS: Filter[] = ['all', ...REQUIREMENT_SOURCES];

function parseFilter(value: string | null): Filter {
  return FILTERS.find((f) => f === value) ?? 'all';
}

/** Route `/projects/[projectId]/requirements`: what the project must satisfy and the cases that test it. */
export function RequirementsPage() {
  const { project, projectId, can } = useProject();
  const [params, setParams] = useUrlSearchParams();
  const source = parseFilter(params.get('source'));
  const text = params.get('q') ?? '';
  const q = useDebouncedValue(text.trim(), 250);
  const creator = useModalTarget<'new'>();
  const importer = useModalTarget<'excel'>();
  const jira = useModalTarget<'jira'>();
  const viewer = useModalTarget<number>();
  const integrations = useIntegrationsStatus(projectId);
  const sync = useSyncRequirementsFromJira(projectId);
  const query = useRequirements(projectId, {
    q: q || undefined,
    source: source === 'all' ? undefined : source,
  });
  const items = query.data ?? [];
  const canWrite = can('writeRequirements');
  const jiraOn = can('useIntegrations') && integrations.data?.jira?.enabled === true;
  const filtered = source !== 'all' || q !== '';

  const update = (patch: Record<string, string | null>) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      return next;
    });

  const refreshFromJira = async () => {
    try {
      notifySuccess('Refreshed from Jira', jiraResultText(await sync.mutateAsync()));
    } catch (err) {
      notifyError(err, 'Could not read from Jira');
    }
  };

  const newButton = canWrite && (
    <Button onClick={() => creator.open('new')}>
      <Plus /> New requirement
    </Button>
  );

  return (
    <>
      <PageHeader
        eyebrow={project.name}
        title="Requirements"
        subtitle="What the product must do, from Excel, Jira or typed in — each one shows the cases that test it"
        actions={
          <>
            {canWrite && can('import') && (
              <Button variant="outline" onClick={() => importer.open('excel')}>
                <FileSpreadsheet /> Import Excel
              </Button>
            )}
            {canWrite && jiraOn && (
              <>
                <Button variant="outline" onClick={() => jira.open('jira')}>
                  Read from Jira
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void refreshFromJira()}
                  loading={sync.isPending}
                >
                  <RefreshCw /> Refresh from Jira
                </Button>
              </>
            )}
            {newButton}
          </>
        }
      />
      <div
        role="group"
        aria-label="Requirement filters"
        className="mb-4 flex flex-wrap items-center gap-3"
      >
        <SearchInput
          aria-label="Search requirements"
          placeholder="Search by ID or title"
          className="w-[280px] max-w-full"
          value={text}
          onValueChange={(v) => update({ q: v || null })}
        />
        <SegmentedControl
          aria-label="Source"
          value={source}
          onChange={(v) => update({ source: v === 'all' ? null : v })}
          options={FILTERS.map((f) => ({
            value: f,
            label: f === 'all' ? 'All' : REQUIREMENT_SOURCE_LABELS[f],
          }))}
        />
      </div>
      <QueryState query={query}>
        {items.length === 0 ? (
          <EmptyState
            icon={<ScrollText className="size-6" strokeWidth={1.6} />}
            title={filtered ? 'No requirements match' : 'No requirements yet'}
            description="Import them from an Excel sheet, read them from Jira, or add one by hand. Then link cases, or write the requirement ID in a case’s References."
            action={filtered ? undefined : newButton || undefined}
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-card">
            <Table className="min-w-[860px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[140px]">ID</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead className="w-[100px]">Source</TableHead>
                  <TableHead className="w-[130px]">Jira status</TableHead>
                  <TableHead className="w-[72px] text-right">Cases</TableHead>
                  <TableHead className="w-[200px]">Source document</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((r) => (
                  <RequirementRow key={r.id} requirement={r} onOpen={() => viewer.open(r.id)} />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </QueryState>
      {creator.opened && (
        <RequirementForm
          key={creator.key}
          requirement={null}
          onClose={creator.close}
          onSaved={(saved) => viewer.open(saved.id)}
        />
      )}
      {importer.opened && <ImportRequirementsDialog key={importer.key} onClose={importer.close} />}
      {jira.opened && <JiraImportDialog key={jira.key} onClose={jira.close} />}
      {viewer.opened && viewer.target !== null && (
        <RequirementDialog key={viewer.key} requirementId={viewer.target} onClose={viewer.close} />
      )}
    </>
  );
}

function RequirementRow({
  requirement: r,
  onOpen,
}: {
  requirement: RequirementListItemDTO;
  onOpen: () => void;
}) {
  return (
    <TableRow className="cursor-pointer" onClick={onOpen}>
      <TableCell>
        <MonoId>{r.key}</MonoId>
      </TableCell>
      <TableCell className="font-medium">
        <button
          type="button"
          className="text-left hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
        >
          {r.title}
        </button>
      </TableCell>
      <TableCell>
        <RequirementSourceBadge source={r.source} />
      </TableCell>
      <TableCell className="text-sm">
        {r.externalStatus ?? <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {r.caseCount === 0 ? (
          <span className="font-semibold text-destructive" title="No case tests this requirement">
            0
          </span>
        ) : (
          r.caseCount
        )}
      </TableCell>
      <TableCell className="truncate text-sm text-muted-foreground">{r.sourceRef ?? '—'}</TableCell>
    </TableRow>
  );
}

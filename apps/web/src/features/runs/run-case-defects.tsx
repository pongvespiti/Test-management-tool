'use client';

import type { DefectRef, RunCaseDTO, RunDTO } from '@tmt/shared';
import { Bug, Link2, Plus } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { DefectStatusBadge, SeverityLabel } from '@/components/common/badges';
import { ErrorAlert, Spinner } from '@/components/common/error-alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useDebouncedValue } from '@/hooks/use-debounce';
import { useDefects, useLinkDefect } from '@/lib/api/defects';
import { useIntegrationsStatus } from '@/lib/api/integrations';
import { usePlan } from '@/lib/api/plans';
import { notifyError, notifySuccess } from '@/lib/notify';
import { routes } from '@/lib/routes';
import { cn } from '@/lib/utils';
import { useProject } from '@/providers/project-provider';
import { SearchInput } from '@/components/common/list-controls';
import { DefectForm } from '../defects/defect-form';
import type { DefectPrefill } from '../defects/defect-model';
import { defectPrefill } from './defect-prefill';
import type { ResultDraft } from './drafts';

/** Dialog classes: wide on desktop, full screen on phones. */
export const WIDE_DIALOG =
  'max-sm:h-dvh max-sm:max-h-dvh max-sm:max-w-full max-sm:rounded-none sm:max-w-[780px]';

/** Linked defects of a run case with "Create defect" (prefilled) and "Link existing defect". */
export function RunCaseDefects({
  rc,
  run,
  defects,
  loading,
  canWrite,
  getDraft,
}: {
  rc: RunCaseDTO;
  run: RunDTO;
  defects: DefectRef[] | undefined;
  loading: boolean;
  canWrite: boolean;
  getDraft: () => ResultDraft | null;
}) {
  const { projectId } = useProject();
  const integrations = useIntegrationsStatus(projectId);
  const jiraEnabled = Boolean(integrations.data?.jira?.enabled);
  const [creating, setCreating] = useState<DefectPrefill | null>(null);
  const [linking, setLinking] = useState(false);
  const failed = rc.status === 'ng' || rc.status === 'blocked';
  const list = defects ?? [];

  return (
    <div className="flex flex-col gap-2">
      {loading && !defects ? (
        <Spinner className="size-4 animate-spin text-muted-foreground" />
      ) : list.length === 0 ? (
        <p className="text-sm text-muted-foreground">No linked defects.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {list.map((d) => (
            <li key={d.id} className="flex items-center gap-2">
              <Link
                href={routes.defect(projectId, d.id)}
                className="shrink-0 font-mono text-sm font-semibold text-primary hover:underline"
              >
                {d.key}
              </Link>
              <span className="min-w-0 flex-1 truncate text-sm" title={d.title}>
                {d.title}
              </span>
              <span className="text-xs">
                <SeverityLabel severity={d.severity} />
              </span>
              <DefectStatusBadge status={d.status} />
            </li>
          ))}
        </ul>
      )}
      {canWrite && (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={failed ? 'secondary' : 'outline'}
            className={cn(failed && 'bg-[#fff5f5] text-destructive hover:bg-[#ffe3e3]')}
            onClick={() => setCreating(defectPrefill(rc, run, getDraft()))}
          >
            <Plus />
            {failed ? 'Create defect from this result' : 'Create defect'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setLinking(true)}>
            <Link2 />
            Link existing defect
          </Button>
        </div>
      )}

      <Dialog open={creating !== null} onOpenChange={(o) => !o && setCreating(null)}>
        <DialogContent className={WIDE_DIALOG} onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>New defect from {rc.displayId}</DialogTitle>
          </DialogHeader>
          {creating && (
            <CreateDefectBody
              rc={rc}
              run={run}
              prefill={creating}
              showExternalKey={!jiraEnabled}
              onDone={() => setCreating(null)}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={linking} onOpenChange={setLinking}>
        <DialogContent className="sm:max-w-[620px]">
          <DialogHeader>
            <DialogTitle>Link a defect to {rc.displayId}</DialogTitle>
          </DialogHeader>
          {linking && (
            <LinkDefectBody
              runCaseId={rc.id}
              linked={new Set(list.map((d) => d.id))}
              onDone={() => setLinking(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CreateDefectBody({
  rc,
  run,
  prefill,
  showExternalKey,
  onDone,
}: {
  rc: RunCaseDTO;
  run: RunDTO;
  prefill: DefectPrefill;
  showExternalKey: boolean;
  onDone: () => void;
}) {
  const { projectId } = useProject();
  // The release comes from the plan; wait for it so the form starts with it selected.
  const plan = usePlan(projectId, run.planId);
  if (plan.isPending) return <Spinner />;
  return (
    <DefectForm
      projectId={projectId}
      defect={null}
      prefill={{ ...prefill, releaseId: plan.data?.release?.id ?? null }}
      runCaseId={rc.id}
      linkLabel={`${rc.displayId} in run ${run.code}`}
      showExternalKey={showExternalKey}
      onDone={onDone}
    />
  );
}

function LinkDefectBody({
  runCaseId,
  linked,
  onDone,
}: {
  runCaseId: number;
  linked: ReadonlySet<number>;
  onDone: () => void;
}) {
  const { projectId } = useProject();
  const [q, setQ] = useState('');
  const debounced = useDebouncedValue(q.trim(), 250);
  const defects = useDefects(projectId, { q: debounced || undefined, pageSize: 20 });
  const link = useLinkDefect(projectId);
  const [busyId, setBusyId] = useState<number | null>(null);
  const items = useMemo(
    () => (defects.data?.items ?? []).filter((d) => !linked.has(d.id)),
    [defects.data, linked],
  );

  const onLink = async (defectId: number, key: string) => {
    setBusyId(defectId);
    try {
      await link.mutateAsync({ defectId, runCaseId });
      notifySuccess(`${key} linked.`);
      onDone();
    } catch (err) {
      notifyError(err, 'Could not link the defect');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <SearchInput
        placeholder="Search key (BUG-12), title or Jira key"
        aria-label="Search defects"
        value={q}
        onValueChange={setQ}
        autoFocus
      />
      {defects.isError ? (
        <ErrorAlert error={defects.error} onRetry={() => void defects.refetch()} />
      ) : defects.isPending ? (
        <Spinner />
      ) : items.length === 0 ? (
        <p className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
          <Bug className="size-4" aria-hidden />
          {debounced ? 'No defect matches.' : 'No other defects in this project.'}
        </p>
      ) : (
        <div className="flex max-h-[360px] flex-col gap-1 overflow-y-auto">
          {items.map((d) => (
            <button
              key={d.id}
              type="button"
              disabled={busyId !== null}
              aria-label={`Link ${d.key} ${d.title}`}
              onClick={() => void onLink(d.id, d.key)}
              className="flex items-center gap-2 rounded-lg border border-[#e3e6ea] px-2.5 py-2 text-left hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-60"
            >
              <span className="shrink-0 font-mono text-sm font-semibold text-[#1971c2]">
                {d.key}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm" title={d.title}>
                {d.title}
              </span>
              <DefectStatusBadge status={d.status} />
              {busyId === d.id ? (
                <Spinner className="size-4 animate-spin text-muted-foreground" />
              ) : (
                <Link2 className="size-4 text-muted-foreground" aria-hidden />
              )}
            </button>
          ))}
        </div>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
      </DialogFooter>
    </div>
  );
}

'use client';

import { RESULT_LABELS, type DefectDTO } from '@tmt/shared';
import { Link2, Link2Off, Plus } from 'lucide-react';
import Link from 'next/link';
import { useId, useMemo, useState } from 'react';
import { ResultBadge } from '@/components/common/badges';
import { confirmAction } from '@/components/common/confirm-host';
import { ErrorAlert } from '@/components/common/error-alert';
import { IconButton } from '@/components/common/icon-button';
import { MonoId } from '@/components/common/mono-id';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useLinkDefect, useUnlinkDefect } from '@/lib/api/defects';
import { usePlans } from '@/lib/api/plans';
import { useRunCases, useRuns } from '@/lib/api/runs';
import { notifyError, notifySuccess } from '@/lib/notify';
import { routes } from '@/lib/routes';
import { useProject } from '@/providers/project-provider';
import { ComboboxSelect } from '@/components/common/combobox-select';

/** Run cases (results) this defect was found in / affects, with add and remove. */
export function DefectLinks({ defect, canEdit }: { defect: DefectDTO; canEdit: boolean }) {
  const { projectId } = useProject();
  const unlink = useUnlinkDefect(projectId);
  const [adding, setAdding] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      {defect.links.length === 0 ? (
        <p className="text-sm text-muted-foreground">Not linked to any test result.</p>
      ) : (
        <Table className="min-w-[520px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px] px-2">Result</TableHead>
              <TableHead className="px-2">Test case</TableHead>
              <TableHead className="w-[190px] px-2">Plan / run</TableHead>
              {canEdit && (
                <TableHead className="w-11 px-2">
                  <span className="sr-only">Actions</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {defect.links.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="px-2">
                  {l.resultStatus ? (
                    <ResultBadge status={l.resultStatus} />
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="px-2 whitespace-normal">
                  {l.runId && l.runCaseId ? (
                    <Link
                      href={routes.run(projectId, l.runId, { case: l.runCaseId })}
                      className="text-sm text-primary hover:underline"
                    >
                      <MonoId className="mr-1.5">{l.caseDisplayId ?? '—'}</MonoId>
                      {l.caseTitle ?? 'Run case'}
                    </Link>
                  ) : (
                    <span className="text-sm">
                      <MonoId className="mr-1.5">{l.caseDisplayId ?? '—'}</MonoId>
                      {l.caseTitle ?? 'Deleted run case'}
                    </span>
                  )}
                  {l.caseCode && (
                    <p className="font-mono text-xs text-muted-foreground">{l.caseCode}</p>
                  )}
                </TableCell>
                <TableCell className="px-2">
                  {l.planId ? (
                    <Link
                      href={routes.plan(projectId, l.planId)}
                      className="font-mono text-sm text-primary hover:underline"
                    >
                      {l.planDocNo}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                  {l.runCode && (
                    <p className="font-mono text-xs text-muted-foreground">Run {l.runCode}</p>
                  )}
                </TableCell>
                {canEdit && (
                  <TableCell className="px-2">
                    <IconButton
                      label={`Remove link to ${l.caseDisplayId ?? 'run case'}`}
                      onClick={() =>
                        confirmAction({
                          title: 'Remove this link?',
                          message: `${defect.key} will no longer be linked to ${l.caseDisplayId ?? 'this result'}${l.runCode ? ` in run ${l.runCode}` : ''}.`,
                          confirmLabel: 'Remove link',
                          danger: true,
                          onConfirm: () =>
                            unlink
                              .mutateAsync({ defectId: defect.id, linkId: l.id })
                              .then(() => notifySuccess('Link removed.'))
                              .catch((e) => notifyError(e, 'Could not remove the link')),
                        })
                      }
                    >
                      <Link2Off />
                    </IconButton>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {canEdit && (
        <Button size="sm" variant="outline" className="w-fit" onClick={() => setAdding(true)}>
          <Plus />
          Link to a test result
        </Button>
      )}
      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="sm:max-w-[620px]">
          <DialogHeader>
            <DialogTitle>Link to a test result</DialogTitle>
          </DialogHeader>
          {adding && <LinkResultForm defect={defect} onDone={() => setAdding(false)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Pick plan → run → run case and link it to the defect. */
function LinkResultForm({ defect, onDone }: { defect: DefectDTO; onDone: () => void }) {
  const { projectId } = useProject();
  const id = useId();
  const link = useLinkDefect(projectId);
  const plans = usePlans(projectId);
  const [planId, setPlanId] = useState<number | null>(defect.links[0]?.planId ?? null);
  const runs = useRuns(projectId, planId);
  const [runId, setRunId] = useState<number | null>(null);
  const runCases = useRunCases(projectId, runId);
  const [runCaseId, setRunCaseId] = useState<number | null>(null);
  const linked = useMemo(
    () => new Set(defect.links.map((l) => l.runCaseId).filter((v): v is number => v !== null)),
    [defect.links],
  );

  const planOptions = useMemo(
    () =>
      (plans.data ?? []).map((p) => ({ value: String(p.id), label: `${p.docNo} — ${p.title}` })),
    [plans.data],
  );
  const runOptions = useMemo(
    () =>
      (runs.data ?? []).map((r) => ({
        value: String(r.id),
        label: r.scenario ? `${r.code} — ${r.scenario}` : r.code,
      })),
    [runs.data],
  );
  const caseOptions = useMemo(
    () =>
      (runCases.data ?? [])
        .filter((rc) => !linked.has(rc.id))
        .map((rc) => ({
          value: String(rc.id),
          label: `${rc.displayId}${rc.code ? ` · ${rc.code}` : ''} — ${rc.title} [${RESULT_LABELS[rc.status]}]`,
        })),
    [runCases.data, linked],
  );

  const submit = async () => {
    if (!runCaseId) return;
    try {
      await link.mutateAsync({ defectId: defect.id, runCaseId });
      notifySuccess(`${defect.key} linked.`);
      onDone();
    } catch (err) {
      notifyError(err, 'Could not link the result');
    }
  };

  const error = plans.error ?? runs.error ?? runCases.error;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {error ? <ErrorAlert error={error} /> : null}
      <div className="grid gap-2">
        <Label htmlFor={`${id}-plan`}>Test plan</Label>
        <ComboboxSelect
          id={`${id}-plan`}
          placeholder={plans.isPending ? 'Loading…' : 'Choose a plan'}
          emptyText="No plans"
          options={planOptions}
          value={planId === null ? null : String(planId)}
          onChange={(v) => {
            setPlanId(v ? Number(v) : null);
            setRunId(null);
            setRunCaseId(null);
          }}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-run`}>Run</Label>
        <ComboboxSelect
          id={`${id}-run`}
          placeholder={
            planId ? (runs.isPending ? 'Loading…' : 'Choose a run') : 'Choose a plan first'
          }
          emptyText="No runs"
          options={runOptions}
          value={runId === null ? null : String(runId)}
          onChange={(v) => {
            setRunId(v ? Number(v) : null);
            setRunCaseId(null);
          }}
          disabled={!planId}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-case`}>Run case</Label>
        <ComboboxSelect
          id={`${id}-case`}
          placeholder={
            runId ? (runCases.isPending ? 'Loading…' : 'Search id or title') : 'Choose a run first'
          }
          emptyText="No run case matches"
          options={caseOptions}
          value={runCaseId === null ? null : String(runCaseId)}
          onChange={(v) => setRunCaseId(v ? Number(v) : null)}
          disabled={!runId}
        />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button onClick={() => void submit()} disabled={!runCaseId} loading={link.isPending}>
          {!link.isPending && <Link2 />}
          Link
        </Button>
      </DialogFooter>
    </div>
  );
}

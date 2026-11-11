'use client';

import {
  JUNIT_MATCH_MODES,
  JUNIT_SKIPPED_AS,
  RESULT_LABELS,
  type JunitImportResultDTO,
  type JunitMatchMode,
  type JunitSkippedAs,
  type RunDTO,
} from '@tmt/shared';
import { CircleCheck, FileCode, MoveRight, TriangleAlert, Upload, X } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { useDropzone } from 'react-dropzone';
import { ResultBadge } from '@/components/common/badges';
import { ErrorAlert } from '@/components/common/error-alert';
import { IconButton } from '@/components/common/icon-button';
import { MonoId } from '@/components/common/mono-id';
import { countsSummary } from '@/components/common/stacked-progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useJunitImport } from '@/lib/api/automation';
import { formatBytes, formatNumber, pluralize } from '@/lib/format';
import { notifySuccess } from '@/lib/notify';
import { cn } from '@/lib/utils';
import { useProject } from '@/providers/project-provider';

const MATCH_LABELS: Record<JunitMatchMode, { label: string; description: string }> = {
  auto: {
    label: 'Automatic',
    description: 'Property tmt_id / case_id → case code → display id (MBS-036) → title',
  },
  code: { label: 'Case code', description: 'The test name equals the case code' },
  display_id: {
    label: 'Display id',
    description: 'The display id (e.g. MBS-036 or MBS_036) appears in the name or class name',
  },
  title: { label: 'Title', description: 'The test name equals the case title' },
};

const ITEM_LIMIT = 300;
const TABLE_BOX = 'overflow-auto rounded-md border';

function Total({ label, value, tone }: { label: string; value: number; tone?: 'red' }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('text-lg font-bold', tone === 'red' && value > 0 && 'text-destructive')}>
        {formatNumber(value)}
      </p>
    </div>
  );
}

function Summary({ result, children }: { result: JunitImportResultDTO; children?: ReactNode }) {
  const t = result.totals;
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Total label="Tests in file" value={t.tests} />
        <Total label="Matched" value={t.matched} />
        <Total label="Unmatched" value={t.unmatched} tone="red" />
        <Total label="Run cases updated" value={t.updatedRunCases} />
        <Total label="Cases created" value={t.createdCases} />
      </div>
      <p className="text-sm text-muted-foreground">Results: {countsSummary(result.counts)}</p>
      {children}
    </div>
  );
}

function Items({ result }: { result: JunitImportResultDTO }) {
  if (result.items.length === 0) return null;
  const shown = result.items.slice(0, ITEM_LIMIT);
  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm font-semibold">
        Run cases {result.dryRun ? 'that will change' : 'updated'} (
        {formatNumber(result.items.length)})
      </p>
      <div className={cn(TABLE_BOX, 'max-h-[260px]')}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[110px]">ID</TableHead>
              <TableHead>Title</TableHead>
              <TableHead className="w-[210px]">Result</TableHead>
              <TableHead className="w-[60px]">Tests</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((it) => (
              <TableRow key={it.runCaseId}>
                <TableCell className="py-1">
                  <MonoId>{it.displayId}</MonoId>
                  {it.created && (
                    <Badge variant="secondary" className="ml-1">
                      new
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="max-w-0 py-1">
                  <span className="block truncate" title={it.title}>
                    {it.title}
                  </span>
                </TableCell>
                <TableCell className="py-1">
                  <span className="flex items-center gap-1">
                    <ResultBadge status={it.previous} />
                    <MoveRight className="size-3.5" aria-label="becomes" />
                    <ResultBadge status={it.status} />
                  </span>
                </TableCell>
                <TableCell className="py-1">{it.tests}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {result.items.length > ITEM_LIMIT && (
        <p className="text-xs text-muted-foreground">
          … and {formatNumber(result.items.length - ITEM_LIMIT)} more
        </p>
      )}
    </div>
  );
}

function Unmatched({ result }: { result: JunitImportResultDTO }) {
  if (result.unmatched.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm font-semibold">
        Tests without a run case ({formatNumber(result.totals.unmatched)})
      </p>
      <div className={cn(TABLE_BOX, 'max-h-[200px]')}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Test</TableHead>
              <TableHead className="w-[100px]">Result</TableHead>
              <TableHead className="w-[110px]">Reason</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.unmatched.map((u, i) => (
              <TableRow key={`${u.classname ?? ''}:${u.name}:${i}`}>
                <TableCell className="max-w-0 py-1">
                  <span className="block truncate font-mono text-sm" title={u.name}>
                    {u.name}
                  </span>
                  {u.classname && (
                    <span
                      className="block truncate font-mono text-xs text-muted-foreground"
                      title={u.classname}
                    >
                      {u.classname}
                    </span>
                  )}
                </TableCell>
                <TableCell className="py-1">
                  <ResultBadge status={u.status} />
                </TableCell>
                <TableCell className="py-1">
                  {u.reason === 'ambiguous' ? 'Several cases' : 'No match'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/**
 * JUnit XML upload into a run (ADR-010): choose file and options → dry-run preview (nothing is
 * saved) → apply. Writes are refused on completed plans by the server.
 */
function JunitImportBody({ run, onDone }: { run: RunDTO; onDone: () => void }) {
  const id = useId();
  const { projectId } = useProject();
  const junit = useJunitImport(projectId);
  const [file, setFile] = useState<File | null>(null);
  const [matchBy, setMatchBy] = useState<JunitMatchMode>('auto');
  const [skippedAs, setSkippedAs] = useState<JunitSkippedAs>('nt');
  const [createMissing, setCreateMissing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState<JunitImportResultDTO | null>(null);
  const [applied, setApplied] = useState<JunitImportResultDTO | null>(null);
  const [error, setError] = useState<unknown>(null);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) => {
      setError(null);
      setFile(files[0] ?? null);
    },
    onDropRejected: () => setError(new Error('Choose one JUnit XML file (.xml).')),
    accept: { 'application/xml': ['.xml'], 'text/xml': ['.xml'] },
    multiple: false,
  });

  const send = async (dryRun: boolean) => {
    if (!file) return;
    setError(null);
    setProgress(0);
    try {
      const res = await junit.mutateAsync({
        runId: run.id,
        file,
        options: { matchBy, skippedAs, createMissing, dryRun },
        onProgress: setProgress,
      });
      if (dryRun) setPreview(res);
      else {
        setApplied(res);
        notifySuccess(
          `${pluralize(res.totals.updatedRunCases, 'run case')} updated from ${res.fileName}.`,
        );
      }
    } catch (err) {
      setError(err);
    }
  };

  const progressBar = junit.isPending && (
    <Progress value={progress * 100} aria-label="Upload" className="h-1.5" />
  );

  if (applied) {
    return (
      <div className="flex flex-col gap-4">
        <Alert variant="success">
          <CircleCheck />
          <AlertTitle>Imported</AlertTitle>
          <AlertDescription>
            <p>
              {applied.fileName}: {pluralize(applied.totals.updatedRunCases, 'run case')} updated
              {applied.totals.createdCases > 0 &&
                `, ${pluralize(applied.totals.createdCases, 'case')} created and added`}
              . The results are recorded with the source “JUnit import”.
            </p>
          </AlertDescription>
        </Alert>
        <Summary result={applied} />
        <Unmatched result={applied} />
        <DialogFooter>
          <Button onClick={onDone}>Close</Button>
        </DialogFooter>
      </div>
    );
  }

  if (preview) {
    const nothing = preview.totals.updatedRunCases === 0 && preview.totals.createdCases === 0;
    return (
      <div className="flex min-w-0 flex-col gap-4">
        <p className="text-sm">
          Preview of <strong>{preview.fileName}</strong> — nothing has been saved yet.
        </p>
        {error ? <ErrorAlert error={error} /> : null}
        <Summary result={preview} />
        <Items result={preview} />
        <Unmatched result={preview} />
        {nothing && (
          <Alert variant="warning">
            <TriangleAlert />
            <AlertDescription>
              <p>
                No run case would change. Check the matching rule
                {createMissing ? '' : ', or turn on “Create missing cases”'}.
              </p>
            </AlertDescription>
          </Alert>
        )}
        {progressBar}
        <div className="flex flex-wrap justify-between gap-2">
          <Button variant="outline" onClick={() => setPreview(null)} disabled={junit.isPending}>
            Back
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onDone} disabled={junit.isPending}>
              Cancel
            </Button>
            <Button onClick={() => void send(false)} loading={junit.isPending} disabled={nothing}>
              Apply results
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {file ? (
        <div className="flex items-center gap-3 rounded-lg border border-[#e3e6ea] p-3">
          <FileCode className="size-6 shrink-0" strokeWidth={1.6} aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{file.name}</p>
            <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
          </div>
          <IconButton label="Remove the selected file" onClick={() => setFile(null)}>
            <X />
          </IconButton>
        </div>
      ) : (
        <div
          {...getRootProps({ role: 'button', 'aria-label': 'Choose a JUnit XML file' })}
          className={cn(
            'flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border border-dashed border-input px-4 py-5 text-center transition-colors outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50',
            isDragActive && 'border-primary bg-accent',
          )}
        >
          <input {...getInputProps()} />
          <Upload className="size-7 text-[#495057]" strokeWidth={1.6} aria-hidden />
          <p className="text-sm font-semibold">Drop a JUnit XML report here or click to choose</p>
          <p className="text-xs text-muted-foreground">
            pytest, Appium, Playwright, JUnit… ({'<testsuites>'} or {'<testsuite>'} root)
          </p>
        </div>
      )}
      {error ? <ErrorAlert error={error} title="The file was not accepted" /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid content-start gap-2">
          <Label htmlFor={`${id}-match`}>Match tests to cases by</Label>
          <Select value={matchBy} onValueChange={(v) => setMatchBy(v as JunitMatchMode)}>
            <SelectTrigger id={`${id}-match`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {JUNIT_MATCH_MODES.map((m) => (
                <SelectItem key={m} value={m}>
                  {MATCH_LABELS[m].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{MATCH_LABELS[matchBy].description}</p>
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor={`${id}-skipped`}>Record skipped tests as</Label>
          <Select value={skippedAs} onValueChange={(v) => setSkippedAs(v as JunitSkippedAs)}>
            <SelectTrigger id={`${id}-skipped`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {JUNIT_SKIPPED_AS.map((s) => (
                <SelectItem key={s} value={s}>
                  {RESULT_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Failures and errors become NG, passed tests OK
          </p>
        </div>
      </div>
      <div className="flex items-start gap-3">
        <Switch
          id={`${id}-create`}
          checked={createMissing}
          onCheckedChange={setCreateMissing}
          aria-describedby={`${id}-create-hint`}
        />
        <div className="grid gap-1">
          <Label htmlFor={`${id}-create`} className="font-normal">
            Create missing cases
          </Label>
          <p id={`${id}-create-hint`} className="text-xs text-muted-foreground">
            Tests that match nothing become library cases (tag “automated”) in {run.suite.name} and
            are added to this run.
          </p>
        </div>
      </div>
      {progressBar}
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button onClick={() => void send(true)} loading={junit.isPending} disabled={!file}>
          Preview
        </Button>
      </DialogFooter>
    </div>
  );
}

export function JunitImportDialog({
  open,
  run,
  onClose,
}: {
  open: boolean;
  run: RunDTO;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[780px]" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Upload JUnit results into {run.code}</DialogTitle>
        </DialogHeader>
        {open && <JunitImportBody run={run} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

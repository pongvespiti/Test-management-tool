'use client';

import {
  REQUIREMENT_FIELD_LABELS,
  type RequirementField,
  type RequirementImportAnalysisDTO,
  type RequirementImportPreviewDTO,
} from '@tmt/shared';
import { FileSpreadsheet, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { ComboboxSelect } from '@/components/common/combobox-select';
import { ErrorAlert } from '@/components/common/error-alert';
import { SegmentedControl } from '@/components/common/list-controls';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useImportUpload } from '@/lib/api/imports';
import {
  useAnalyzeRequirementImport,
  useCommitRequirementImport,
  usePreviewRequirementImport,
  type RequirementImportBody,
} from '@/lib/api/requirements';
import { pluralize } from '@/lib/format';
import { notifySuccess } from '@/lib/notify';
import { useProject } from '@/providers/project-provider';
import { UploadStep } from '../import/upload-step';

type Mapping = Record<RequirementField, number | null>;
const FIELDS: RequirementField[] = ['key', 'title', 'description', 'sourceRef'];
const REQUIRED: RequirementField[] = ['key', 'title'];

/** Column choice of each field, from the header suggestions. */
export function mappingFromAnalysis(a: RequirementImportAnalysisDTO): Mapping {
  const m: Mapping = { key: null, title: null, description: null, sourceRef: null };
  for (const c of a.columns) if (c.suggested && m[c.suggested] === null) m[c.suggested] = c.col;
  return m;
}

/** Fields of the mapping still missing a column (key and title are required). */
export function missingFields(m: Mapping): RequirementField[] {
  return REQUIRED.filter((f) => m[f] === null);
}

const ACTION_LABEL = {
  create: 'New',
  update: 'Update',
  skip: 'Skip',
  invalid: 'Invalid',
} as const;

/** Upload an Excel/CSV list, choose which column is what, preview, import. */
export function ImportRequirementsDialog({ onClose }: { onClose: () => void }) {
  const { projectId } = useProject();
  const upload = useImportUpload(projectId);
  const analyze = useAnalyzeRequirementImport(projectId);
  const previewM = usePreviewRequirementImport(projectId);
  const commit = useCommitRequirementImport(projectId);

  const [file, setFile] = useState<{ name: string; size: number } | null>(null);
  const [progress, setProgress] = useState(0);
  const [analysis, setAnalysis] = useState<RequirementImportAnalysisDTO | null>(null);
  const [mapping, setMapping] = useState<Mapping>({
    key: null,
    title: null,
    description: null,
    sourceRef: null,
  });
  const [onExisting, setOnExisting] = useState<'update' | 'skip'>('update');
  const [preview, setPreview] = useState<RequirementImportPreviewDTO | null>(null);
  const [error, setError] = useState<unknown>(null);

  const reanalyze = async (uploadId: string, body: { sheet?: string; headerRow?: number } = {}) => {
    setError(null);
    setPreview(null);
    try {
      const a = await analyze.mutateAsync({ uploadId, ...body });
      setAnalysis(a);
      setMapping(mappingFromAnalysis(a));
    } catch (e) {
      setError(e);
    }
  };

  const onFile = async (f: File) => {
    setFile({ name: f.name, size: f.size });
    setProgress(0);
    setError(null);
    try {
      const up = await upload.mutateAsync({ file: f, onProgress: setProgress });
      await reanalyze(up.uploadId);
    } catch (e) {
      setError(e);
      setFile(null);
    }
  };

  const body = (): RequirementImportBody | null => {
    if (!analysis || missingFields(mapping).length > 0) return null;
    return {
      uploadId: analysis.uploadId,
      sheet: analysis.sheet,
      headerRow: analysis.headerRow,
      mapping: {
        key: mapping.key!,
        title: mapping.title!,
        description: mapping.description,
        sourceRef: mapping.sourceRef,
      },
      onExisting,
    };
  };

  const runPreview = async () => {
    const b = body();
    if (!b) return;
    setError(null);
    try {
      setPreview(await previewM.mutateAsync(b));
    } catch (e) {
      setError(e);
    }
  };

  const runCommit = async () => {
    const b = body();
    if (!b) return;
    setError(null);
    try {
      const r = await commit.mutateAsync(b);
      notifySuccess(
        'Requirements imported',
        `${r.created} new, ${r.updated} updated, ${r.skipped} skipped` +
          (r.invalid > 0 ? `, ${r.invalid} invalid` : '') +
          '.',
      );
      onClose();
    } catch (e) {
      setError(e);
    }
  };

  const changed = (fn: () => void) => {
    setPreview(null);
    fn();
  };
  const missing = missingFields(mapping);
  const options = (analysis?.columns ?? []).map((c) => ({
    value: String(c.col),
    label: `${c.letter} · ${c.header || '(no header)'}`,
    hint: c.samples[0] ? <span className="max-w-32 truncate">{c.samples[0]}</span> : undefined,
  }));

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import requirements from Excel or CSV</DialogTitle>
          <DialogDescription>
            One requirement per row. An ID that already exists is updated (or left alone — you
            choose). Requirements that came from Jira are never overwritten.
          </DialogDescription>
        </DialogHeader>

        {!analysis ? (
          <UploadStep
            onFile={(f) => void onFile(f)}
            uploading={upload.isPending || analyze.isPending}
            progress={progress}
            fileName={file?.name ?? null}
            fileSize={file?.size ?? null}
          />
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3">
              <span className="flex min-w-0 items-center gap-3">
                <FileSpreadsheet className="size-5 shrink-0 text-success" />
                <span className="min-w-0 truncate font-medium">{analysis.fileName}</span>
                <span className="text-sm text-muted-foreground">
                  {pluralize(analysis.dataRowCount, 'data row')}
                </span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setAnalysis(null);
                  setPreview(null);
                  setFile(null);
                }}
              >
                <RefreshCw /> Another file
              </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="req-import-sheet" className="text-sm font-medium">
                  Sheet
                </label>
                <ComboboxSelect
                  id="req-import-sheet"
                  searchable={analysis.sheets.length > 8}
                  options={analysis.sheets.map((s) => ({
                    value: s.name,
                    label: s.name,
                    hint: pluralize(s.rowCount, 'row'),
                  }))}
                  value={analysis.sheet}
                  onChange={(v) => v && void reanalyze(analysis.uploadId, { sheet: v })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="req-import-header" className="text-sm font-medium">
                  Header row
                </label>
                <Input
                  id="req-import-header"
                  inputMode="numeric"
                  value={String(analysis.headerRow)}
                  onChange={(e) => {
                    const n = Number(e.target.value.replace(/[^\d]/g, ''));
                    if (n >= 1 && n !== analysis.headerRow)
                      void reanalyze(analysis.uploadId, { sheet: analysis.sheet, headerRow: n });
                  }}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {FIELDS.map((f) => (
                <div key={f} className="flex flex-col gap-1.5">
                  <label htmlFor={`req-import-${f}`} className="text-sm font-medium">
                    {REQUIREMENT_FIELD_LABELS[f]}
                    {REQUIRED.includes(f) && <span className="text-destructive"> *</span>}
                  </label>
                  <ComboboxSelect
                    id={`req-import-${f}`}
                    searchable={false}
                    options={options}
                    value={mapping[f] === null ? null : String(mapping[f])}
                    onChange={(v) =>
                      changed(() => setMapping({ ...mapping, [f]: v ? Number(v) : null }))
                    }
                    placeholder="Not in the file"
                    clearLabel={REQUIRED.includes(f) ? undefined : 'Not in the file'}
                  />
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium">An ID that exists already</span>
              <SegmentedControl
                aria-label="Existing IDs"
                value={onExisting}
                onChange={(v) => changed(() => setOnExisting(v))}
                options={[
                  { value: 'update', label: 'Update its text' },
                  { value: 'skip', label: 'Leave it' },
                ]}
              />
            </div>

            {missing.length > 0 && (
              <p className="text-sm text-muted-foreground">
                Choose a column for {missing.map((f) => REQUIREMENT_FIELD_LABELS[f]).join(' and ')}.
              </p>
            )}

            {preview && <PreviewTable preview={preview} />}
          </div>
        )}

        {error !== null && <ErrorAlert error={error} />}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          {analysis && (
            <>
              <Button
                variant="outline"
                onClick={() => void runPreview()}
                loading={previewM.isPending}
                disabled={missing.length > 0}
              >
                Preview
              </Button>
              <Button
                onClick={() => void runCommit()}
                loading={commit.isPending}
                disabled={!preview || preview.create + preview.update === 0}
              >
                Import
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PreviewTable({ preview }: { preview: RequirementImportPreviewDTO }) {
  return (
    <div className="flex flex-col gap-2" aria-label="Import preview" role="region">
      <p className="text-sm">
        <b>{preview.create}</b> new · <b>{preview.update}</b> updated · <b>{preview.skip}</b>{' '}
        skipped · <b>{preview.invalid}</b> invalid
        {preview.truncated && ' — the sheet is longer than the import limit and is cut'}
      </p>
      <div className="max-h-64 overflow-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14">Row</TableHead>
              <TableHead className="w-32">ID</TableHead>
              <TableHead>Title</TableHead>
              <TableHead className="w-48">What happens</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {preview.rows.map((r) => (
              <TableRow key={r.row}>
                <TableCell className="tabular-nums">{r.row}</TableCell>
                <TableCell className="font-mono text-[13px]">{r.key || '—'}</TableCell>
                <TableCell className="max-w-64 truncate">{r.title || '—'}</TableCell>
                <TableCell className={r.action === 'invalid' ? 'text-destructive' : undefined}>
                  {ACTION_LABEL[r.action]}
                  {r.reason && <span className="text-muted-foreground"> · {r.reason}</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

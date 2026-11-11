'use client';

import type {
  ColumnMapping,
  ImportAnalysisDTO,
  ImportPreviewDTO,
  ImportResultDTO,
} from '@tmt/shared';
import { ArrowLeft, ArrowRight, Eye, Info, TriangleAlert, Upload } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { ErrorAlert, Spinner } from '@/components/common/error-alert';
import { PageHeader } from '@/components/common/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ApiError } from '@/lib/api/client';
import {
  useImportAnalyze,
  useImportCommit,
  useImportPreview,
  useImportUpload,
  type ImportUploadResult,
} from '@/lib/api/imports';
import { useSuites } from '@/lib/api/library';
import { pluralize } from '@/lib/format';
import { toId } from '@/lib/forms';
import { notifySuccess } from '@/lib/notify';
import { routes } from '@/lib/routes';
import { useProject } from '@/providers/project-provider';
import {
  buildRunBody,
  checkMapping,
  DEFAULT_OPTIONS,
  defaultTarget,
  EMPTY_TARGET,
  mappingFromAnalysis,
  runErrorTarget,
  validateTarget,
  type ImportTargetState,
  type TargetErrors,
  type WizardOptions,
} from './import-model';
import { MappingStep } from './mapping-step';
import { OptionsStep } from './options-step';
import { PreviewStep } from './preview-step';
import { RecentImports } from './recent-imports';
import { ResultStep } from './result-step';
import { SourceStep } from './source-step';
import { UploadStep } from './upload-step';
import { WizardStepper } from './wizard-stepper';

const STEPS = ['Upload', 'Sheet & suite', 'Map columns', 'Options', 'Preview', 'Import'] as const;
const DONE = STEPS.length - 1;

const isUploadGone = (err: unknown) => err instanceof ApiError && err.code === 'UPLOAD_NOT_FOUND';

/**
 * Excel/CSV import wizard (api.md § Import): upload → sheet, header row and target suite → column
 * mapping → options → dry-run preview → import. The upload stays on the server for 2 hours, so
 * every step can go back and re-analyse without uploading again.
 */
export function ImportPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      }
    >
      <ImportWizard />
    </Suspense>
  );
}

function ImportWizard() {
  const { projectId, can } = useProject();
  const presetSuiteId = toId(useSearchParams().get('suite'));
  const suitesQuery = useSuites(projectId);
  const suites = useMemo(() => suitesQuery.data ?? [], [suitesQuery.data]);
  const uploadMutation = useImportUpload(projectId);
  const analyzeMutation = useImportAnalyze(projectId);
  const previewMutation = useImportPreview(projectId);
  const commitMutation = useImportCommit(projectId);

  const [step, setStep] = useState(0);
  const [file, setFile] = useState<{ name: string; size: number } | null>(null);
  const [progress, setProgress] = useState(0);
  const [upload, setUpload] = useState<ImportUploadResult | null>(null);
  const [analysis, setAnalysis] = useState<ImportAnalysisDTO | null>(null);
  const [target, setTarget] = useState<ImportTargetState>(EMPTY_TARGET);
  const [mapping, setMapping] = useState<ColumnMapping[]>([]);
  const [options, setOptions] = useState<WizardOptions>(DEFAULT_OPTIONS);
  const [preview, setPreview] = useState<ImportPreviewDTO | null>(null);
  const [result, setResult] = useState<ImportResultDTO | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [fieldErrors, setFieldErrors] = useState<TargetErrors>({});
  const [showMappingErrors, setShowMappingErrors] = useState(false);

  const selectedSuite =
    target.mode === 'existing'
      ? (suites.find((s) => String(s.id) === target.suiteId) ?? null)
      : null;
  const fieldDefs = useMemo(() => selectedSuite?.fieldDefs ?? [], [selectedSuite]);
  const check = useMemo(
    () => (analysis ? checkMapping(mapping, analysis.columns, fieldDefs) : null),
    [analysis, mapping, fieldDefs],
  );
  const suiteName = selectedSuite?.name ?? target.name.trim();
  const suiteLabel =
    target.mode === 'new'
      ? `new suite “${target.name.trim()}” (${target.prefix})`
      : (selectedSuite?.name ?? '');

  const reset = () => {
    setStep(0);
    setFile(null);
    setProgress(0);
    setUpload(null);
    setAnalysis(null);
    setTarget(EMPTY_TARGET);
    setMapping([]);
    setOptions(DEFAULT_OPTIONS);
    setPreview(null);
    setResult(null);
    setError(null);
    setFieldErrors({});
    setShowMappingErrors(false);
  };

  const analyze = async (
    body: { sheet?: string; headerRow?: number; suiteId?: number },
    uploadId = upload?.uploadId,
  ): Promise<ImportAnalysisDTO | null> => {
    if (!uploadId) return null;
    setError(null);
    try {
      const a = await analyzeMutation.mutateAsync({ uploadId, ...body });
      setAnalysis(a);
      setMapping(mappingFromAnalysis(a));
      setPreview(null);
      setShowMappingErrors(false);
      return a;
    } catch (err) {
      setError(err);
      return null;
    }
  };

  const onFile = async (f: File) => {
    setFile({ name: f.name, size: f.size });
    setProgress(0);
    setError(null);
    try {
      const res = await uploadMutation.mutateAsync({ file: f, onProgress: setProgress });
      setProgress(1);
      setUpload(res);
      const t = defaultTarget(res.fileName, suites, presetSuiteId, can('manageSuites'));
      setTarget(t);
      const a = await analyze(
        { suiteId: t.mode === 'existing' ? (toId(t.suiteId) ?? undefined) : undefined },
        res.uploadId,
      );
      if (a) setStep(1);
    } catch (err) {
      setError(err);
    }
  };

  const onTarget = (next: ImportTargetState) => {
    const before = target.mode === 'existing' ? target.suiteId : null;
    const after = next.mode === 'existing' ? next.suiteId : null;
    setTarget(next);
    setFieldErrors({});
    if (before !== after && analysis) {
      // The suite's custom fields change the suggested mapping (headers matching existing fields).
      setOptions((o) => ({ ...o, parentSectionId: '' }));
      void analyze({
        sheet: analysis.sheet,
        headerRow: analysis.headerRow,
        suiteId: toId(after) ?? undefined,
      });
    }
  };

  const runBody = () =>
    upload && analysis
      ? buildRunBody({
          uploadId: upload.uploadId,
          analysis,
          mapping,
          options,
          suite: selectedSuite,
          target,
        })
      : null;

  /** Server-side validation errors: go back to the step that can fix them. */
  const onRunError = (err: unknown) => {
    const back = runErrorTarget(err, target.mode);
    if (!back) {
      setError(err);
      return;
    }
    if (back.fieldErrors) setFieldErrors(back.fieldErrors);
    if (back.showError) setError(err);
    setStep(back.step);
  };

  const goPreview = async () => {
    const body = runBody();
    if (!body) return;
    setError(null);
    try {
      setPreview(await previewMutation.mutateAsync(body));
      setStep(4);
    } catch (err) {
      onRunError(err);
    }
  };

  const doImport = async () => {
    const body = runBody();
    if (!body) return;
    setError(null);
    try {
      const res = await commitMutation.mutateAsync(body);
      setResult(res);
      setStep(DONE);
      notifySuccess(
        `Imported ${pluralize(res.created + res.updated, 'test case')} into ${suiteName}.`,
      );
    } catch (err) {
      onRunError(err);
    }
  };

  const next = () => {
    if (step === 1) {
      const errors = validateTarget(target, suites);
      setFieldErrors(errors);
      if (Object.keys(errors).length === 0) {
        setError(null);
        setStep(2);
      }
    } else if (step === 2) {
      setShowMappingErrors(true);
      if (check && !check.general && check.errors.size === 0) {
        setError(null);
        setStep(3);
      }
    } else if (step === 3) void goPreview();
    else if (step === 4) void doImport();
  };

  const toImport = preview ? preview.counts.create + preview.counts.update : 0;
  const nextLabel =
    step === 1
      ? 'Next: map columns'
      : step === 2
        ? 'Next: options'
        : step === 3
          ? 'Preview import'
          : `Import ${pluralize(toImport, 'test case')}`;
  const busy = analyzeMutation.isPending || previewMutation.isPending || commitMutation.isPending;

  const header = (
    <PageHeader
      title="Import test cases from Excel"
      breadcrumbs={[
        { label: 'Test cases', href: routes.cases(projectId, { suite: presetSuiteId }) },
        { label: 'Import from Excel' },
      ]}
    />
  );

  if (!can('import'))
    return (
      <>
        {header}
        <div className="flex flex-col gap-6">
          <Alert className="bg-secondary">
            <Info />
            <AlertTitle>Importing needs the tester role</AlertTitle>
            <AlertDescription>
              You can see what was imported below. Ask a project lead for the tester role to import
              workbooks yourself.
            </AlertDescription>
          </Alert>
          <RecentImports />
        </div>
      </>
    );

  const errorBox = !error ? null : isUploadGone(error) ? (
    <Alert variant="warning">
      <TriangleAlert />
      <AlertTitle>The uploaded file expired</AlertTitle>
      <AlertDescription>
        <p>Uploads are kept for 2 hours. Upload the file again to continue.</p>
        <Button size="sm" className="mt-1" onClick={reset}>
          <Upload />
          Upload again
        </Button>
      </AlertDescription>
    </Alert>
  ) : (
    <ErrorAlert
      error={error}
      title={
        step === 0
          ? 'The file could not be read'
          : step >= 3
            ? 'The import could not be prepared'
            : undefined
      }
    />
  );

  return (
    <>
      {header}
      <div className="flex flex-col gap-6">
        <WizardStepper
          label="Import steps"
          active={step === DONE ? STEPS.length : step}
          steps={STEPS.map((label, i) => ({
            label,
            description: i === 0 && file && step > 0 ? file.name : undefined,
            selectable: i >= 1 && i < step && step < DONE && !busy,
          }))}
          onSelect={(s) => {
            setError(null);
            setStep(s);
          }}
        />

        {errorBox}

        <div className="relative">
          {step > 0 && analyzeMutation.isPending && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-background/50 backdrop-blur-[1px]">
              <Spinner />
            </div>
          )}
          {step === 0 && (
            <UploadStep
              onFile={(f) => void onFile(f)}
              uploading={uploadMutation.isPending || analyzeMutation.isPending}
              progress={progress}
              fileName={file?.name ?? null}
              fileSize={file?.size ?? null}
            />
          )}
          {step === 1 && analysis && (
            <SourceStep
              fileSize={file?.size ?? null}
              analysis={analysis}
              suites={suites}
              target={target}
              onTarget={onTarget}
              onSheet={(sheet) => void analyze({ sheet, suiteId: selectedSuite?.id })}
              onHeaderRow={(headerRow) =>
                void analyze({ sheet: analysis.sheet, headerRow, suiteId: selectedSuite?.id })
              }
              onRestart={reset}
              errors={fieldErrors}
            />
          )}
          {step === 2 && analysis && check && (
            <MappingStep
              analysis={analysis}
              fieldDefs={fieldDefs}
              mapping={mapping}
              onMapping={(m) => {
                setMapping(m);
                setPreview(null);
              }}
              check={check}
              showErrors={showMappingErrors}
            />
          )}
          {step === 3 && analysis && (
            <OptionsStep
              options={options}
              onOptions={(o) => {
                setOptions(o);
                setFieldErrors({});
              }}
              suite={selectedSuite}
              envBlock={analysis.envBlock}
              sectionError={fieldErrors.section}
            />
          )}
          {step === 4 && preview && <PreviewStep preview={preview} suiteLabel={suiteLabel} />}
          {step === DONE && result && (
            <ResultStep result={result} suiteName={suiteName} onAnother={reset} />
          )}
        </div>

        {step >= 1 && step <= 4 && (
          <Card className="flex-row flex-wrap items-center justify-between gap-3 px-5 py-3">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                setError(null);
                if (step === 1) reset();
                else setStep(step - 1);
              }}
            >
              <ArrowLeft />
              {step === 1 ? 'Start over' : 'Back'}
            </Button>
            <div className="flex flex-wrap items-center gap-3">
              {step === 4 && toImport === 0 && (
                <span className="text-sm text-muted-foreground">
                  Nothing to import with these options.
                </span>
              )}
              <Button
                onClick={next}
                loading={
                  (step === 3 && previewMutation.isPending) ||
                  (step === 4 && commitMutation.isPending)
                }
                disabled={(step === 4 && toImport === 0) || analyzeMutation.isPending}
              >
                {nextLabel}
                {step === 3 ? <Eye /> : <ArrowRight />}
              </Button>
            </div>
          </Card>
        )}

        {(step === 0 || step === DONE) && <RecentImports />}
      </div>
    </>
  );
}

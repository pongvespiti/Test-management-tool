'use client';

import {
  templateFieldsSchema,
  updateTemplateSchema,
  type SuiteDTO,
  type TemplateDTO,
} from '@tmt/shared';
import { FileSpreadsheet, Upload, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { useDropzone, type FileRejection } from 'react-dropzone';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from '@/components/ui/form';
import { Switch } from '@/components/ui/switch';
import { useTemplateCheck, useUpdateTemplate, useUploadTemplate } from '@/lib/api/templates';
import { formatBytes } from '@/lib/format';
import { fromId, toId } from '@/lib/forms';
import { errorMessage, notifyError, notifySuccess } from '@/lib/notify';
import { cn } from '@/lib/utils';
import { flatResolver, schemaErrors, type FlatErrors } from '@/lib/form-errors';
import { applyValidationIssues, errorCode } from './server-errors';
import { runSheetError, TemplateFields, type TemplateFormValues } from './template-fields';
import { readXlsxSheetNames } from './xlsx-sheet-names';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Upload errors that belong to the file, not to a field. */
const FILE_ERRORS = new Set([
  'BAD_TEMPLATE_FILE',
  'UNSUPPORTED_FILE_TYPE',
  'FILE_TOO_LARGE',
  'FILE_REQUIRED',
  'EMPTY_FILE',
]);

const SUITE_GONE = 'This suite no longer exists — choose another one';

const baseName = (fileName: string) =>
  fileName
    .replace(/\.xlsx$/i, '')
    .trim()
    .slice(0, 200);

/** Field errors of the template forms: the shared schema plus the run sheet check. */
function templateErrors(
  errors: FlatErrors,
  values: TemplateFormValues,
  sheets: readonly string[] | null,
): FlatErrors {
  const sheetError = runSheetError(values.runSheet, sheets);
  return sheetError && !errors.runSheet ? { ...errors, runSheet: sheetError } : errors;
}

/** Message for a file the dropzone refused. */
export function templateRejection(rejections: readonly FileRejection[]): string {
  return rejections[0]?.errors.some((e) => e.code === 'too-many-files')
    ? 'Drop one workbook at a time'
    : 'Report templates must be Excel workbooks (.xlsx)';
}

/** Body of the "Upload report template" dialog. */
export function TemplateUploadForm({
  projectId,
  suites,
  onUploaded,
  onCancel,
}: {
  projectId: number;
  suites: readonly SuiteDTO[] | undefined;
  onUploaded: (template: TemplateDTO) => void;
  onCancel: () => void;
}) {
  const upload = useUploadTemplate(projectId);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [sheets, setSheets] = useState<string[] | null>(null);
  const autoName = useRef('');
  const pickCount = useRef(0);

  const form = useForm<TemplateFormValues>({
    defaultValues: { name: '', description: '', suiteId: null, runSheet: '', isDefault: false },
    resolver: flatResolver((v) =>
      templateErrors(
        schemaErrors(templateFieldsSchema, { ...v, suiteId: toId(v.suiteId) }),
        v,
        sheets,
      ),
    ),
  });

  const pick = (f: File) => {
    setFile(f);
    setFileError(null);
    setSheets(null);
    const name = form.getValues('name');
    if (!name.trim() || name === autoName.current) {
      autoName.current = baseName(f.name);
      form.setValue('name', autoName.current, { shouldDirty: true });
    }
    const ticket = ++pickCount.current;
    void readXlsxSheetNames(f).then((names) => {
      if (ticket === pickCount.current) setSheets(names);
    });
  };

  const { getRootProps, getInputProps, isDragAccept, isDragReject } = useDropzone({
    onDrop: (files, rejections) => {
      if (rejections.length > 0) setFileError(templateRejection(rejections));
      else if (files[0]) pick(files[0]);
    },
    accept: { [XLSX_MIME]: ['.xlsx'] },
    multiple: false,
    disabled: upload.isPending,
  });

  const onSubmit = form.handleSubmit(async (values) => {
    if (!file) {
      setFileError('Choose the .xlsx workbook of the form');
      return;
    }
    try {
      const template = await upload.mutateAsync({
        file,
        fields: {
          name: values.name,
          description: values.description,
          suiteId: toId(values.suiteId),
          runSheet: values.runSheet,
          isDefault: values.isDefault,
        },
      });
      notifySuccess(`Template ${template.name} uploaded.`);
      onUploaded(template);
    } catch (err) {
      const code = errorCode(err);
      if (code && FILE_ERRORS.has(code)) setFileError(errorMessage(err));
      else if (code === 'BAD_SUITE') form.setError('suiteId', { message: SUITE_GONE });
      else if (!applyValidationIssues(err, form.setError))
        notifyError(err, 'Could not upload the template');
    }
  });

  const Icon = isDragReject ? X : isDragAccept ? Upload : FileSpreadsheet;
  return (
    <Form {...form}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <div>
          <div
            {...getRootProps({
              role: 'button',
              'aria-label': 'Template workbook (.xlsx)',
              className: cn(
                'flex min-h-24 cursor-pointer items-center justify-center gap-4 rounded-lg border-2 border-dashed border-input p-4 outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50',
                file && 'bg-muted',
                fileError && 'border-destructive',
                isDragAccept && 'border-primary bg-accent',
                upload.isPending && 'pointer-events-none opacity-60',
              ),
            })}
          >
            <input {...getInputProps({ 'aria-label': 'Template workbook file' })} />
            <Icon
              aria-hidden
              strokeWidth={1.5}
              className={cn(
                'size-9 shrink-0',
                isDragReject
                  ? 'text-destructive'
                  : isDragAccept
                    ? 'text-primary'
                    : file
                      ? 'text-success'
                      : 'text-muted-foreground',
              )}
            />
            {file ? (
              <div className="min-w-0">
                <p className="text-sm font-semibold [overflow-wrap:anywhere]">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatBytes(file.size)}
                  {sheets ? ` · ${sheets.length} sheet${sheets.length === 1 ? '' : 's'}` : ''} ·
                  drop or click to choose another file
                </p>
              </div>
            ) : (
              <div>
                <p className="text-sm font-semibold">
                  Drop the blank form here, or click to choose it
                </p>
                <p className="text-xs text-muted-foreground">
                  Excel workbook (.xlsx) with ${'{…}'} placeholders
                </p>
              </div>
            )}
          </div>
          {fileError && (
            <p role="alert" className="mt-1.5 text-xs text-destructive">
              {fileError}
            </p>
          )}
        </div>
        <TemplateFields control={form.control} suites={suites} sheets={sheets} />
        <FormField
          control={form.control}
          name="isDefault"
          render={({ field }) => (
            <FormItem className="flex items-start gap-3">
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} className="mt-0.5" />
              </FormControl>
              <div className="grid gap-1">
                <FormLabel>Use as the default template for exports</FormLabel>
                <FormDescription>Used for every plan that has no template chosen.</FormDescription>
              </div>
            </FormItem>
          )}
        />
        <DialogFooter className="mt-1">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" loading={upload.isPending}>
            {!upload.isPending && <Upload />}
            Upload and check
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

/** Body of the "Edit template" dialog (the file itself is replaced by uploading a new template). */
export function TemplateEditForm({
  projectId,
  template,
  suites,
  onDone,
}: {
  projectId: number;
  template: TemplateDTO;
  suites: readonly SuiteDTO[] | undefined;
  onDone: () => void;
}) {
  const update = useUpdateTemplate(projectId);
  // The check lists the workbook's sheets: suggestions (and a guard) for the run sheet.
  const check = useTemplateCheck(projectId, template.id);
  const sheets = check.data?.sheets ?? null;

  const form = useForm<TemplateFormValues>({
    defaultValues: {
      name: template.name,
      description: template.description ?? '',
      suiteId: fromId(template.suiteId) || null,
      runSheet: template.runSheet ?? '',
      isDefault: template.isDefault,
    },
    resolver: flatResolver((v) =>
      templateErrors(
        schemaErrors(updateTemplateSchema, {
          name: v.name,
          description: v.description,
          suiteId: toId(v.suiteId),
          runSheet: v.runSheet,
        }),
        v,
        sheets,
      ),
    ),
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await update.mutateAsync({
        templateId: template.id,
        name: values.name,
        description: values.description,
        suiteId: toId(values.suiteId),
        runSheet: values.runSheet,
      });
      notifySuccess(`Template ${values.name} saved.`);
      onDone();
    } catch (err) {
      if (errorCode(err) === 'BAD_SUITE') form.setError('suiteId', { message: SUITE_GONE });
      else if (!applyValidationIssues(err, form.setError))
        notifyError(err, 'Could not save the template');
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <TemplateFields
          control={form.control}
          suites={suites}
          sheets={sheets}
          keepSuiteId={template.suiteId}
        />
        <DialogFooter className="mt-1">
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" loading={update.isPending}>
            Save template
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

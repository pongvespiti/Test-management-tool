'use client';

import { FileSpreadsheet, Upload, X } from 'lucide-react';
import { useState } from 'react';
import { useDropzone, type Accept, type FileRejection } from 'react-dropzone';
import { Progress } from '@/components/ui/progress';
import { formatBytes } from '@/lib/format';
import { cn } from '@/lib/utils';

const MAX_MB = 25;

/** Excel (.xlsx/.xlsm) and CSV; the extension decides when the browser reports no MIME type. */
const ACCEPT: Accept = {
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.ms-excel.sheet.macroEnabled.12': ['.xlsm'],
  'text/csv': ['.csv'],
  'application/vnd.ms-excel': ['.csv'],
};

/** Readable reason why a dropped file was refused. */
export function rejectionMessage(rejections: readonly FileRejection[]): string {
  const r = rejections[0];
  if (!r) return 'This file cannot be imported.';
  const name = r.file.name;
  if (/\.xls$/i.test(name))
    return `${name}: old .xls workbooks cannot be imported — open the file in Excel and save it as .xlsx.`;
  if (r.errors.some((e) => e.code === 'file-too-large'))
    return `${name} is larger than ${MAX_MB} MB.`;
  if (r.errors.some((e) => e.code === 'too-many-files')) return 'Drop one file at a time.';
  return `${name}: only .xlsx and .csv files can be imported.`;
}

// Windows reports both .csv and old .xls as application/vnd.ms-excel: decide by extension. While a
// file is dragged the browser exposes no name yet, so nothing is judged before the drop.
function byExtension(file: File) {
  if (!file.name) return null;
  return /\.(xlsx|xlsm|csv)$/i.test(file.name)
    ? null
    : { code: 'file-invalid-type', message: 'Only .xlsx and .csv files can be imported' };
}

/** Step 1: drop or pick one workbook; shows upload progress. */
export function UploadStep({
  onFile,
  uploading,
  progress,
  fileName,
  fileSize,
}: {
  onFile: (file: File) => void;
  uploading: boolean;
  /** 0..1 while uploading. */
  progress: number;
  fileName: string | null;
  fileSize: number | null;
}) {
  const [rejected, setRejected] = useState<string | null>(null);
  const { getRootProps, getInputProps, isDragAccept, isDragReject } = useDropzone({
    onDrop: (files, rejections) => {
      if (rejections.length > 0) {
        setRejected(rejectionMessage(rejections));
        return;
      }
      setRejected(null);
      if (files[0]) onFile(files[0]);
    },
    accept: ACCEPT,
    validator: byExtension,
    maxSize: MAX_MB * 1024 * 1024,
    multiple: false,
    disabled: uploading,
  });

  const Icon = isDragReject ? X : isDragAccept ? Upload : FileSpreadsheet;
  return (
    <div className="flex flex-col gap-3">
      <div
        {...getRootProps({
          role: 'button',
          'aria-label': 'Drop an Excel or CSV file here, or press Enter to choose one',
          className: cn(
            'flex min-h-[210px] cursor-pointer items-center justify-center gap-8 rounded-2xl border-2 border-dashed border-input bg-card p-8 transition-colors outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50',
            isDragAccept && 'border-primary bg-accent',
            isDragReject && 'border-destructive bg-[#fff5f5]',
            uploading && 'pointer-events-none opacity-60',
          ),
        })}
      >
        <input {...getInputProps({ 'aria-label': 'Workbook to import' })} />
        <span
          aria-hidden
          className={cn(
            'flex size-14 shrink-0 items-center justify-center rounded-full',
            isDragReject
              ? 'bg-[#fff5f5] text-destructive'
              : isDragAccept
                ? 'bg-accent text-accent-foreground'
                : 'bg-[#ebfbee] text-success',
          )}
        >
          <Icon className="size-7" strokeWidth={1.6} />
        </span>
        <div className="max-w-xl">
          <p className="text-lg font-semibold">
            Drop the Excel workbook here, or click to choose it
          </p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            .xlsx or .csv, up to {MAX_MB} MB. The team’s layouts (Unit operation, Adapter, Modbus
            system/function) are recognised automatically; any other table can be mapped by hand.
          </p>
        </div>
      </div>
      {rejected && (
        <p role="alert" className="text-sm text-destructive">
          {rejected}
        </p>
      )}
      {uploading && (
        <div aria-live="polite" className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">
              Uploading <b>{fileName}</b>
              {fileSize !== null ? ` (${formatBytes(fileSize)})` : ''}…
            </span>
            <span className="shrink-0 text-muted-foreground">
              {progress >= 1 ? 'Reading the workbook…' : `${Math.round(progress * 100)}%`}
            </span>
          </div>
          <Progress
            value={Math.max(2, progress * 100)}
            aria-label="Upload progress"
            className={progress >= 1 ? 'animate-pulse' : undefined}
          />
        </div>
      )}
    </div>
  );
}

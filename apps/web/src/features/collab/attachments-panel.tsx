'use client';

import type { AttachmentDTO } from '@tmt/shared';
import {
  Download,
  File as FileGeneric,
  FileArchive,
  FileSpreadsheet,
  FileText,
  Film,
  Trash2,
  Upload,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useDropzone, type FileRejection } from 'react-dropzone';
import { confirmDelete } from '@/components/common/confirm-host';
import { IconButton } from '@/components/common/icon-button';
import { Progress } from '@/components/ui/progress';
import {
  attachmentUrl,
  useDeleteAttachment,
  useUploadAttachment,
  type AttachableType,
} from '@/lib/api/collab';
import { formatBytes, formatDateTime } from '@/lib/format';
import { notifyError } from '@/lib/notify';
import { cn } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';
import { useProject } from '@/providers/project-provider';
import { isModalOpen, isTextEntry, pastedImageName } from './dom';

interface Pending {
  id: number;
  name: string;
  progress: number;
}

const THUMB =
  'flex h-[76px] items-center justify-center overflow-hidden rounded-lg border bg-[#e9ecef] text-muted-foreground';

function FileIcon({ mime }: { mime: string }) {
  const props = { className: 'size-[26px]', strokeWidth: 1.6, 'aria-hidden': true } as const;
  if (mime.startsWith('video/')) return <Film {...props} />;
  if (mime === 'application/pdf') return <FileText {...props} />;
  if (mime.includes('spreadsheet') || mime.includes('excel') || mime === 'text/csv')
    return <FileSpreadsheet {...props} />;
  if (mime.includes('zip') || mime.includes('compressed') || mime.includes('gzip'))
    return <FileArchive {...props} />;
  return <FileGeneric {...props} />;
}

function onReject(rejections: FileRejection[]) {
  for (const r of rejections) {
    notifyError(new Error(r.errors.map((e) => e.message).join('; ')), `${r.file.name} rejected`);
  }
}

/**
 * Evidence files of a run case or defect: thumbnails, drag & drop / click upload with progress and,
 * when `pasteToUpload` is on, screenshots pasted with Ctrl+V anywhere on the page (outside text
 * fields that receive text).
 */
export function AttachmentsPanel({
  entityType,
  entityId,
  attachments,
  canUpload,
  pasteToUpload = false,
}: {
  entityType: AttachableType;
  entityId: number;
  attachments: AttachmentDTO[];
  canUpload: boolean;
  pasteToUpload?: boolean;
}) {
  const { projectId, role } = useProject();
  const { user } = useAuth();
  const { mutateAsync: uploadFile } = useUploadAttachment(projectId);
  const remove = useDeleteAttachment(projectId);
  const [pending, setPending] = useState<Pending[]>([]);
  const nextId = useRef(1);

  const start = useCallback(
    (file: Blob, name: string) => {
      const id = nextId.current++;
      setPending((p) => [...p, { id, name, progress: 0 }]);
      uploadFile({
        entityType,
        entityId,
        file,
        fileName: name,
        onProgress: (f) =>
          setPending((p) => p.map((x) => (x.id === id ? { ...x, progress: f } : x))),
      })
        .catch((err) => notifyError(err, `Could not upload ${name}`))
        .finally(() => setPending((p) => p.filter((x) => x.id !== id)));
    },
    [uploadFile, entityType, entityId],
  );

  useEffect(() => {
    if (!pasteToUpload || !canUpload) return;
    const onPaste = (e: ClipboardEvent) => {
      const data = e.clipboardData;
      if (!data) return;
      const images = Array.from(data.files).filter((f) => f.type.startsWith('image/'));
      if (images.length === 0) return;
      // Text copied from Excel also carries an image: inside a text field paste the text.
      if (isTextEntry(e.target) && Array.from(data.types).includes('text/plain')) return;
      if (isModalOpen()) return;
      e.preventDefault();
      images.forEach((f) =>
        start(f, f.name && f.name !== 'image.png' ? f.name : pastedImageName(f)),
      );
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [pasteToUpload, canUpload, start]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) => files.forEach((f) => start(f, f.name)),
    onDropRejected: onReject,
    multiple: true,
    disabled: !canUpload,
  });

  return (
    <div className="flex flex-col gap-2">
      {attachments.length === 0 && pending.length === 0 && !canUpload && (
        <p className="text-sm text-muted-foreground">No files attached.</p>
      )}
      {(attachments.length > 0 || pending.length > 0) && (
        <ul className="m-0 flex list-none flex-wrap items-start gap-2.5 p-0">
          {attachments.map((a) => {
            const isImage = a.mimeType.startsWith('image/');
            const mayDelete = canUpload && (a.createdBy?.id === user?.id || role === 'lead');
            const openUrl = attachmentUrl(projectId, a.id);
            return (
              <li key={a.id} className="flex w-[132px] min-w-0 flex-col gap-1">
                <a
                  href={openUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Open ${a.fileName}`}
                  className={THUMB}
                >
                  {isImage ? (
                    <img src={openUrl} alt="" loading="lazy" className="size-full object-cover" />
                  ) : (
                    <FileIcon mime={a.mimeType} />
                  )}
                </a>
                <div className="flex items-center justify-between gap-0.5">
                  <span className="min-w-0 truncate text-xs font-medium" title={a.fileName}>
                    {a.fileName}
                  </span>
                  <div className="flex shrink-0">
                    <IconButton label={`Download ${a.fileName}`} className="size-6" asChild>
                      <a href={attachmentUrl(projectId, a.id, true)}>
                        <Download className="size-3.5" />
                      </a>
                    </IconButton>
                    {mayDelete && (
                      <IconButton
                        label={`Delete ${a.fileName}`}
                        tone="danger"
                        className="size-6"
                        onClick={() =>
                          confirmDelete(`file “${a.fileName}”`, () =>
                            remove
                              .mutateAsync({ attachmentId: a.id, entityType, entityId })
                              .catch((e) => notifyError(e, 'Could not delete the file')),
                          )
                        }
                      >
                        <Trash2 className="size-3.5" />
                      </IconButton>
                    )}
                  </div>
                </div>
                <span
                  className="truncate text-xs text-muted-foreground"
                  title={`${a.createdBy?.displayName ?? 'Unknown'} · ${formatDateTime(a.createdAt)}`}
                >
                  {formatBytes(a.sizeBytes)}
                  {a.createdBy ? ` · ${a.createdBy.displayName}` : ''}
                </span>
              </li>
            );
          })}
          {pending.map((p) => (
            <li key={`pending-${p.id}`} className="flex w-[132px] min-w-0 flex-col gap-1">
              <div className={THUMB}>
                <Upload className="size-[22px]" strokeWidth={1.6} aria-hidden />
              </div>
              <span className="truncate text-xs" title={p.name}>
                {p.name}
              </span>
              <Progress
                value={p.progress * 100}
                aria-label={`Uploading ${p.name}`}
                className="h-1.5"
              />
            </li>
          ))}
        </ul>
      )}
      {canUpload && (
        <div
          {...getRootProps({ role: 'button', 'aria-label': 'Upload files' })}
          className={cn(
            'flex cursor-pointer items-center justify-center gap-2.5 rounded-lg border border-dashed border-input bg-card p-3 text-center transition-colors outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50',
            isDragActive && 'border-primary bg-accent',
          )}
        >
          <input {...getInputProps()} />
          <Upload className="size-5 shrink-0 text-[#495057]" strokeWidth={1.6} aria-hidden />
          <p className="text-sm text-muted-foreground">
            Drop files here or click to choose
            {pasteToUpload ? ' — or paste a screenshot (Ctrl+V)' : ''}
          </p>
        </div>
      )}
    </div>
  );
}

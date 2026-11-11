'use client';

import type { PlanDTO } from '@tmt/shared';
import { Download, FileCheck, RefreshCw, Trash2, Upload } from 'lucide-react';
import { useId } from 'react';
import { useDropzone, type Accept } from 'react-dropzone';
import { confirmAction } from '@/components/common/confirm-host';
import { IconButton } from '@/components/common/icon-button';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { attachmentUrl } from '@/lib/api/collab';
import { useDeleteSignedCopy, useUploadSignedCopy } from '@/lib/api/plans';
import { formatBytes, formatDateTime } from '@/lib/format';
import { notifyError, notifySuccess } from '@/lib/notify';
import { cn } from '@/lib/utils';

const ACCEPT: Accept = {
  'application/pdf': ['.pdf'],
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
};

interface Props {
  plan: PlanDTO;
  projectId: number;
  /** Tester or lead (attach / replace / remove the signed copy). */
  canWrite: boolean;
}

/**
 * Sign-off stays on paper: the exported report keeps the Approved / Checked / Made boxes empty.
 * Once the plan is completed, the scanned signed report can be kept with the plan.
 */
export function SignOffCard({ plan, projectId, canWrite }: Props) {
  const headingId = useId();
  const upload = useUploadSignedCopy(projectId);
  const remove = useDeleteSignedCopy(projectId);
  const completed = plan.status === 'completed';
  const signed = plan.signedCopy;
  const canAttach = canWrite && completed;

  const onFile = async (file: File) => {
    try {
      await upload.mutateAsync({ planId: plan.id, file });
      notifySuccess(`Signed copy ${file.name} attached.`);
    } catch (err) {
      notifyError(err, 'Could not attach the signed copy');
    }
  };

  const { getRootProps, getInputProps, open, isDragActive } = useDropzone({
    accept: ACCEPT,
    multiple: false,
    noClick: true,
    noKeyboard: true,
    disabled: !canAttach || upload.isPending,
    onDropAccepted: (files) => {
      if (files[0]) void onFile(files[0]);
    },
    onDropRejected: () =>
      notifyError(new Error('Use a PDF, PNG or JPG file.'), 'Could not attach the signed copy'),
  });

  const onRemove = () =>
    confirmAction({
      title: 'Remove the signed copy?',
      message: `${signed?.fileName ?? 'The file'} is deleted from this plan. The paper original is not affected.`,
      confirmLabel: 'Remove',
      danger: true,
      onConfirm: async () => {
        try {
          await remove.mutateAsync(plan.id);
          notifySuccess('Signed copy removed.');
        } catch (err) {
          notifyError(err, 'Could not remove the signed copy');
        }
      },
    });

  return (
    <Card className="px-5 py-[18px]">
      <section aria-labelledby={headingId} className="flex flex-wrap items-center gap-6">
        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-1.5">
          <h2 id={headingId} className="text-base leading-6 font-semibold">
            Sign-off · hand-signed
          </h2>
          <p className="text-sm text-muted-foreground">
            Signatures stay on paper. The exported report keeps the Approved / Checked / Made boxes
            of your controlled form empty for signatures and dates.
          </p>
        </div>

        <SignatureBoxes />

        <div
          {...getRootProps({
            className: cn(
              'flex min-w-0 flex-[1_1_260px] flex-col gap-2 rounded-lg outline-none',
              isDragActive && 'bg-accent ring-2 ring-primary/40',
            ),
          })}
        >
          {canAttach && <input {...getInputProps({ 'aria-label': 'Signed copy file' })} />}
          <p className="text-sm font-semibold">Signed copy</p>
          {signed ? (
            <div className="flex items-start gap-3">
              <div
                aria-hidden
                className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[#ebfbee] text-success"
              >
                <FileCheck className="size-5" />
              </div>
              <div className="min-w-0 flex-auto">
                <a
                  href={signed.url}
                  target="_blank"
                  rel="noopener"
                  className="text-sm font-semibold [overflow-wrap:anywhere] text-primary hover:underline"
                >
                  {signed.fileName}
                </a>
                <p className="text-xs text-muted-foreground">
                  {formatBytes(signed.sizeBytes)} · {signed.createdBy?.displayName ?? 'Unknown'} ·{' '}
                  {formatDateTime(signed.createdAt)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                <IconButton asChild label={`Download ${signed.fileName}`}>
                  <a href={attachmentUrl(projectId, signed.id, true)}>
                    <Download />
                  </a>
                </IconButton>
                {canAttach && (
                  <IconButton
                    label="Replace the signed copy"
                    onClick={open}
                    disabled={upload.isPending}
                  >
                    <RefreshCw className={upload.isPending ? 'animate-spin' : undefined} />
                  </IconButton>
                )}
                {canWrite && (
                  <IconButton
                    label={`Remove ${signed.fileName}`}
                    tone="danger"
                    onClick={onRemove}
                    disabled={remove.isPending}
                  >
                    <Trash2 />
                  </IconButton>
                )}
              </div>
            </div>
          ) : canAttach ? (
            <>
              <Button
                type="button"
                variant="outline"
                className="h-11 w-fit border-dashed border-[#adb5bd]"
                loading={upload.isPending}
                onClick={open}
              >
                {!upload.isPending && <Upload />}
                Attach scanned signed report
              </Button>
              <p className="text-xs text-muted-foreground">
                PDF, PNG or JPG · drop the file here or choose it · keeps the signed version with
                this plan
              </p>
            </>
          ) : completed ? (
            <p className="text-sm text-muted-foreground">No signed copy attached yet.</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              After the plan is completed: export the report, sign it on paper and attach the scan
              here.
            </p>
          )}
        </div>
      </section>
    </Card>
  );
}

const HEADS = ['Approved', 'Checked', 'Made'] as const;
const BOX = 'border-[#868e96]';

/** The Approved / Checked / Made boxes of the controlled form, left blank. */
function SignatureBoxes() {
  return (
    <div
      role="img"
      aria-label="Approved, Checked and Made boxes left blank for hand signatures"
      className={cn(
        'grid flex-none grid-cols-[repeat(3,92px)] border bg-card text-xs text-[#343a40]',
        BOX,
      )}
    >
      {HEADS.map((h, i) => (
        <span
          key={h}
          className={cn(
            'border-b bg-secondary px-1.5 py-1 text-center font-semibold',
            BOX,
            i < 2 && 'border-r',
          )}
        >
          {h}
        </span>
      ))}
      {HEADS.map((h, i) => (
        <span key={`${h}-sign`} className={cn('h-10', BOX, i < 2 && 'border-r')} />
      ))}
      {HEADS.map((h, i) => (
        <span
          key={`${h}-date`}
          className={cn(
            'border-t px-1.5 py-0.5 text-center text-muted-foreground',
            BOX,
            i < 2 && 'border-r',
          )}
        >
          __/__/____
        </span>
      ))}
    </div>
  );
}

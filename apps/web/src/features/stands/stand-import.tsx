'use client';

import type { StandImportResultDTO } from '@tmt/shared';
import { FileSpreadsheet } from 'lucide-react';
import { useState } from 'react';
import { StatusPill } from '@/components/common/status-pill';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useImportStandSheet } from '@/lib/api/stands';
import { notifyError, notifySuccess } from '@/lib/notify';
import { BLUE, GRAY, GREEN } from '@/lib/status';
import { useStandsT } from './stand-i18n';

const ACTION = {
  create: { label: 'New', tone: GREEN },
  update: { label: 'Changed', tone: BLUE },
  unchanged: { label: 'Same', tone: GRAY },
} as const;

/**
 * Import of the lab's stand sheet (.xlsx): blocks of Stand No. / Model Name / In charge under a
 * "Zone …" heading. Shows what would change first; nothing is written until Apply.
 */
export function StandImport({ onDone }: { onDone: () => void }) {
  const run = useImportStandSheet();
  const t = useStandsT();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<StandImportResultDTO | null>(null);

  const read = async (f: File) => {
    setFile(f);
    setPreview(null);
    try {
      setPreview(await run.mutateAsync({ file: f, apply: false }));
    } catch (err) {
      notifyError(err, t('Could not read the file'));
    }
  };

  const apply = async () => {
    if (!file) return;
    try {
      const r = await run.mutateAsync({ file, apply: true });
      notifySuccess(
        t('Stand sheet imported: {created} new, {updated} changed{zones}.', {
          created: r.created,
          updated: r.updated,
          zones: r.zonesCreated ? t(', {n} new zones', { n: r.zonesCreated }) : '',
        }),
      );
      setFile(null);
      setPreview(null);
      onDone();
    } catch (err) {
      notifyError(err, t('Could not import the stand sheet'));
    }
  };

  const changes = preview ? preview.created + preview.updated : 0;

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-start gap-3">
          <FileSpreadsheet className="mt-0.5 size-5 text-muted-foreground" />
          <div className="flex flex-1 flex-col gap-2">
            <label htmlFor="stand-sheet" className="font-medium">
              {t('Stand sheet (.xlsx)')}
            </label>
            <p className="text-sm text-muted-foreground">
              {t(
                'The sheet named “Stand” (or the first sheet): each block has Stand No., Model Name and In charge in its first column and the stands to the right, under a “Zone …” heading. Request, Replace and Target are kept as the stand’s note. Stands are matched by code.',
              )}
            </p>
            <Input
              id="stand-sheet"
              type="file"
              accept=".xlsx"
              className="max-w-sm"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void read(f);
              }}
            />
          </div>
        </div>
      </div>
      {preview && (
        <div className="flex flex-col gap-3">
          <p className="text-sm" aria-live="polite">
            {t('{n} stands read: ', { n: preview.rows.length })}
            <strong>{t('{n} new', { n: preview.created })}</strong>,{' '}
            <strong>{t('{n} changed', { n: preview.updated })}</strong>,{' '}
            {t('{n} the same', { n: preview.unchanged })}
            {preview.zonesCreated > 0 && t(', {n} new zones', { n: preview.zonesCreated })}.
          </p>
          {preview.warnings.length > 0 && (
            <ul className="list-disc rounded-md bg-amber-50 py-2 pr-3 pl-7 text-sm text-amber-900">
              {preview.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          <div className="overflow-x-auto rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[90px]" />
                  <TableHead>{t('Zone')}</TableHead>
                  <TableHead>{t('Stand')}</TableHead>
                  <TableHead>{t('Model')}</TableHead>
                  <TableHead>{t('In charge')}</TableHead>
                  <TableHead>{t('Note')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.rows.map((r) => (
                  <TableRow key={r.code}>
                    <TableCell>
                      <StatusPill tone={ACTION[r.action].tone}>
                        {t(ACTION[r.action].label)}
                      </StatusPill>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{r.zone}</TableCell>
                    <TableCell className="font-mono text-xs whitespace-nowrap">{r.code}</TableCell>
                    <TableCell>{r.model ?? '—'}</TableCell>
                    <TableCell>{r.inCharge ?? '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.note ?? ''}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => void apply()} disabled={changes === 0} loading={run.isPending}>
              {changes === 0 ? t('Nothing to change') : t('Apply {n} changes', { n: changes })}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setFile(null);
                setPreview(null);
              }}
            >
              {t('Discard')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

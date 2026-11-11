'use client';

import {
  formatMinutes,
  type ImportPreviewCaseDTO,
  type ImportPreviewDTO,
  type ImportWarningDTO,
} from '@tmt/shared';
import { CircleCheck, Info, TriangleAlert } from 'lucide-react';
import { CaseTypeBadge } from '@/components/common/badges';
import { CasePriorityLabel } from '@/components/common/case-priority-label';
import { StatusPill } from '@/components/common/status-pill';
import { TagList } from '@/components/common/tag-list';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatNumber, pluralize } from '@/lib/format';
import { CASE_STATUS_TONES, PLAN_STATUS_TONES, type Tone } from '@/lib/status';
import { cn } from '@/lib/utils';
import { INFO_WARNINGS, rowsText } from './import-model';

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number;
  hint?: string;
  tone?: 'good' | 'muted';
}) {
  return (
    <div
      className={cn('rounded-lg border p-3', tone === 'good' && 'border-[#b2f2bb] bg-[#ebfbee]')}
    >
      <p
        className={cn(
          'text-2xl leading-tight font-bold',
          tone === 'muted' && value === 0 && 'text-muted-foreground',
        )}
      >
        {formatNumber(value)}
      </p>
      <p className="text-sm text-muted-foreground">{label}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** What happens to a row (tones from the status palette: readable on their background). */
const ACTIONS: Record<ImportPreviewCaseDTO['action'], { label: string; tone: Tone }> = {
  create: { label: 'New', tone: CASE_STATUS_TONES.ready },
  update: { label: 'Update', tone: PLAN_STATUS_TONES.in_progress },
  skip: { label: 'Skip', tone: CASE_STATUS_TONES.draft },
};

function WarningLine({ warning: w }: { warning: ImportWarningDTO }) {
  const info = INFO_WARNINGS.has(w.kind);
  return (
    <div className="flex items-start gap-2.5">
      <span
        aria-hidden
        className={cn(
          'flex size-[22px] shrink-0 items-center justify-center rounded-full',
          info ? 'bg-accent text-accent-foreground' : 'bg-[#fff4e6] text-warning',
        )}
      >
        {info ? <Info className="size-3.5" /> : <TriangleAlert className="size-3.5" />}
      </span>
      <div className="min-w-0">
        <p className="text-sm">
          {w.rows.length > 0 && <b>{pluralize(w.count, 'row')}: </b>}
          {w.message}
        </p>
        {w.rows.length > 0 && (
          <p className="text-xs text-muted-foreground">{rowsText(w.rows, w.count)}</p>
        )}
      </div>
    </div>
  );
}

/** Step 5: dry-run result — counts, warnings with rows, the first cases as they will look. */
export function PreviewStep({
  preview,
  suiteLabel,
}: {
  preview: ImportPreviewDTO;
  suiteLabel: string;
}) {
  const c = preview.counts;
  const problems = preview.warnings.filter((w) => !INFO_WARNINGS.has(w.kind));
  const infos = preview.warnings.filter((w) => INFO_WARNINGS.has(w.kind));
  return (
    <div className="flex flex-col gap-4">
      <Card className="gap-4 px-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Check before import · {suiteLabel}</h2>
          <span className="text-sm text-muted-foreground">Dry run — nothing is saved yet</span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="test cases" value={c.cases} tone="good" />
          <Stat label="new cases" value={c.create} tone="muted" />
          <Stat label="updated cases" value={c.update} tone="muted" />
          <Stat label="skipped rows" value={c.skip} tone="muted" />
          <Stat
            label="sections"
            value={c.sections}
            hint={c.newSections > 0 ? `${c.newSections} new` : 'all exist'}
          />
          <Stat label="new custom fields" value={c.newFields} tone="muted" />
        </div>
        {preview.newFields.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm text-muted-foreground">New fields:</span>
            {preview.newFields.map((f) => (
              <Badge key={f.key} variant="secondary">
                {f.label}
              </Badge>
            ))}
          </div>
        )}
        {preview.warnings.length === 0 ? (
          <p className="flex items-center gap-2 text-sm">
            <CircleCheck aria-hidden className="size-[18px] text-success" />
            No warnings — the file reads cleanly.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {[...problems, ...infos].map((w) => (
              <WarningLine key={`${w.kind}-${w.message}`} warning={w} />
            ))}
          </div>
        )}
      </Card>
      <Card className="gap-0 py-0">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4 pb-3">
          <h2 className="font-semibold">
            Preview · first {formatNumber(preview.sample.length)} of {formatNumber(c.cases)}
          </h2>
          <span className="text-sm text-muted-foreground">
            How the cases will look in the library
          </span>
        </div>
        {preview.sample.length === 0 ? (
          <p className="px-5 pb-4 text-sm text-muted-foreground">
            No test cases were found with this mapping. Go back and check the header row and the
            Title / Case code columns.
          </p>
        ) : (
          // One scroll container for both axes, so the header row stays visible (sticky).
          <div className="max-h-[560px] overflow-auto">
            <table className="w-full min-w-[1100px] caption-bottom text-sm [&_th]:sticky [&_th]:top-0 [&_th]:z-[1] [&_th]:bg-card">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">Row</TableHead>
                  <TableHead className="w-[180px]">Section</TableHead>
                  <TableHead className="w-[90px]">Code</TableHead>
                  <TableHead className="w-[220px]">Title</TableHead>
                  <TableHead className="w-[120px]">Type · priority</TableHead>
                  <TableHead>Procedure</TableHead>
                  <TableHead>Expected result</TableHead>
                  <TableHead className="w-20">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.sample.map((p) => (
                  <TableRow key={p.row} className="align-top">
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {p.row}
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <span className="line-clamp-2">{p.sectionPath.join(' › ') || '—'}</span>
                    </TableCell>
                    <TableCell className="font-mono text-xs [overflow-wrap:anywhere] whitespace-normal">
                      {p.code ?? '—'}
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <span className="line-clamp-3 font-semibold">{p.title}</span>
                      {(p.tags.length > 0 || p.estimateMinutes || p.references) && (
                        <div className="mt-1 flex flex-col gap-0.5">
                          {p.tags.length > 0 && <TagList tags={p.tags} max={3} />}
                          {(p.estimateMinutes || p.references) && (
                            <span className="text-xs text-muted-foreground">
                              {[formatMinutes(p.estimateMinutes), p.references]
                                .filter(Boolean)
                                .join(' · ')}
                            </span>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <CaseTypeBadge type={p.caseType} />
                        <span className="text-xs">
                          <CasePriorityLabel priority={p.priority} />
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <span className="line-clamp-5 whitespace-multiline">
                        {p.procedure || '—'}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <span className="line-clamp-5 whitespace-multiline">{p.expected || '—'}</span>
                    </TableCell>
                    <TableCell>
                      <StatusPill tone={ACTIONS[p.action].tone}>
                        {ACTIONS[p.action].label}
                      </StatusPill>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

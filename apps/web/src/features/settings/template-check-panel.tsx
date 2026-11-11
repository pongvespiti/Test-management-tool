'use client';

import type { TemplateDTO } from '@tmt/shared';
import { CircleCheck, CircleX, Info, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { ErrorAlert, Spinner } from '@/components/common/error-alert';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useTemplateCheck, useTemplatePlaceholders } from '@/lib/api/templates';
import { pluralize } from '@/lib/format';
import { cn } from '@/lib/utils';
import { CopyCode } from './copy-code';
import {
  describePlaceholder,
  groupOf,
  innerOf,
  PLACEHOLDER_GROUPS,
  suggestPlaceholder,
  wrapPlaceholder,
  type PlaceholderNames,
} from './placeholder-info';
import { PlaceholderList } from './placeholder-list';

function Tile({ label, value, tone }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs font-semibold tracking-[0.04em] text-muted-foreground uppercase">
        {label}
      </p>
      <div className={cn('mt-0.5 text-lg font-bold [overflow-wrap:anywhere]', tone)}>{value}</div>
    </div>
  );
}

interface Problem {
  severity: 'error' | 'warning';
  title: string;
  text: string;
}

/** Result of `GET templates/:id/check` for one template (body of the "Check" dialog). */
export function TemplateCheckPanel({
  projectId,
  template,
  names,
}: {
  projectId: number;
  template: TemplateDTO;
  names: PlaceholderNames;
}) {
  const check = useTemplateCheck(projectId, template.id);
  const reference = useTemplatePlaceholders(projectId);

  if (check.isPending)
    return (
      <div className="flex flex-col items-center gap-2 py-10">
        <Spinner />
        <p className="text-sm text-muted-foreground">Reading the workbook…</p>
      </div>
    );
  if (check.isError)
    return (
      <ErrorAlert
        error={check.error}
        title="Could not check the template"
        onRetry={() => void check.refetch()}
      />
    );

  const data = check.data;
  const unknown = data.unknown.map(innerOf);
  const unknownSet = new Set(unknown);
  const known = data.placeholders.map(innerOf).filter((p) => !unknownSet.has(p));
  const runSheet = template.runSheet?.trim() || null;
  const usesRunValues = known.some((p) => groupOf(p) === 'run' || groupOf(p) === 'cases');

  const problems: Problem[] = [];
  if (runSheet && !data.runSheetFound)
    problems.push({
      severity: 'error',
      title: `Run sheet “${runSheet}” is missing`,
      text: 'Exports with this template fail until the run sheet matches one of the sheets below. Edit the template to fix the name.',
    });
  if (unknown.length > 0)
    problems.push({
      severity: 'warning',
      title: pluralize(unknown.length, 'unknown placeholder'),
      text: 'Unknown placeholders export as empty cells. Fix the spelling in Excel and upload the template again.',
    });
  if (data.placeholders.length === 0)
    problems.push({
      severity: 'warning',
      title: 'No placeholders found',
      text: 'The export would be an unchanged copy of the form. Type placeholders such as ${plan.docNo} into the cells that should be filled.',
    });
  if (!runSheet && usesRunValues)
    problems.push({
      severity: 'warning',
      title: 'No run sheet set',
      text: 'The template uses run or case placeholders (${run.…}, ${table:cases.…}), but they are only filled on the run sheet. Edit the template and choose its run sheet.',
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Tile
          label="Placeholders"
          value={
            unknown.length > 0 ? `${known.length} known · ${unknown.length} unknown` : known.length
          }
          tone={unknown.length > 0 ? 'text-warning' : undefined}
        />
        <Tile
          label="Run sheet"
          value={
            runSheet ? (
              <span className="inline-flex items-center gap-1.5">
                {data.runSheetFound ? (
                  <CircleCheck aria-hidden className="size-5 text-success" />
                ) : (
                  <CircleX aria-hidden className="size-5 text-destructive" />
                )}
                <span className="font-mono">{runSheet}</span>
                <span className="sr-only">{data.runSheetFound ? 'found' : 'missing'}</span>
              </span>
            ) : (
              'Not set'
            )
          }
          tone={runSheet && !data.runSheetFound ? 'text-destructive' : undefined}
        />
        <Tile label="Sheets" value={data.sheets.length} />
      </div>

      {problems.length === 0 ? (
        <Alert variant="success">
          <CircleCheck />
          <AlertTitle>Ready to use</AlertTitle>
          <AlertDescription>
            {runSheet
              ? `All ${pluralize(known.length, 'placeholder')} are known and the run sheet exists.`
              : `All ${pluralize(known.length, 'placeholder')} are known. This template has no per-run sheet.`}
          </AlertDescription>
        </Alert>
      ) : (
        problems.map((p) => (
          <Alert key={p.title} variant={p.severity === 'error' ? 'destructive' : 'warning'}>
            {p.severity === 'error' ? <CircleX /> : <TriangleAlert />}
            <AlertTitle>{p.title}</AlertTitle>
            <AlertDescription>{p.text}</AlertDescription>
          </Alert>
        ))
      )}

      <div>
        <h3 className="mb-1.5 text-sm font-semibold">Sheets</h3>
        <div className="flex flex-wrap gap-1.5">
          {data.sheets.map((s) => {
            const isRun = runSheet !== null && s.toLowerCase() === runSheet.toLowerCase();
            return (
              <Badge
                key={s}
                variant={isRun ? 'default' : 'secondary'}
                className="rounded-sm font-mono"
              >
                {s}
                {isRun ? ' · run sheet' : ''}
              </Badge>
            );
          })}
        </div>
        {runSheet && data.runSheetFound && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            The run sheet is copied once per test run, renamed to the run code, and the original is
            removed.
          </p>
        )}
      </div>

      {unknown.length > 0 && (
        <div>
          <h3 className="mb-1 text-sm font-semibold text-destructive">Unknown placeholders</h3>
          <PlaceholderList
            items={unknown.map((u) => {
              const hint = suggestPlaceholder(u, reference.data);
              return {
                value: wrapPlaceholder(u),
                invalid: true,
                description: hint ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm text-muted-foreground">Did you mean</span>
                    <CopyCode value={wrapPlaceholder(hint)} />
                  </div>
                ) : (
                  'Not a known placeholder'
                ),
              };
            })}
          />
        </div>
      )}

      {PLACEHOLDER_GROUPS.map((g) => {
        const items = known.filter((p) => groupOf(p) === g.key);
        if (items.length === 0) return null;
        return (
          <div key={g.key}>
            <h3 className="mb-1 text-sm font-semibold">
              {g.label} <span className="font-normal text-muted-foreground">({items.length})</span>
            </h3>
            <PlaceholderList
              items={items.map((p) => ({
                value: wrapPlaceholder(p),
                description: describePlaceholder(p, names) ?? '—',
              }))}
            />
          </div>
        );
      })}

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Info aria-hidden className="size-4 shrink-0" />
        Environment, custom-field and summary-group placeholders are accepted by their shape because
        their values depend on the exported plan.
      </p>
    </div>
  );
}

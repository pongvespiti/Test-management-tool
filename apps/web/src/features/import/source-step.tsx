'use client';

import type { ImportAnalysisDTO, SuiteDTO } from '@tmt/shared';
import { FileSpreadsheet, Info, RefreshCw } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatBytes, pluralize } from '@/lib/format';
import { suggestPrefix } from '@/lib/slug';
import { useProject } from '@/providers/project-provider';
import { ComboboxSelect } from '@/components/common/combobox-select';
import { LAYOUT_LABELS, type ImportTargetState, type TargetErrors } from './import-model';

const SHEET_STATE: Record<string, string> = { hidden: 'hidden', veryHidden: 'very hidden' };

/** Label, control, description and error of one wizard field. */
export function WizardField({
  id,
  label,
  description,
  error,
  children,
  className,
}: {
  id: string;
  label: string;
  description?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className ?? 'grid gap-2'}>
      <Label htmlFor={id} className={error ? 'text-destructive' : undefined}>
        {label}
      </Label>
      {children}
      {description && (
        <p id={`${id}-description`} className="text-xs text-muted-foreground">
          {description}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/** `aria-describedby` / `aria-invalid` of a control inside a {@link WizardField}. */
export function fieldAria(id: string, description: boolean, error?: string) {
  const ids = [description ? `${id}-description` : null, error ? `${id}-error` : null].filter(
    Boolean,
  );
  return {
    id,
    'aria-describedby': ids.length > 0 ? ids.join(' ') : undefined,
    'aria-invalid': error ? true : undefined,
  } as const;
}

/** Header row input: applies on blur/Enter, resets an invalid entry (remount it per header row). */
function HeaderRowInput({ value, onApply }: { value: number; onApply: (row: number) => void }) {
  const [row, setRow] = useState(String(value));
  const apply = () => {
    const n = Number.parseInt(row, 10);
    if (Number.isInteger(n) && n >= 1 && n <= 100000 && n !== value) onApply(n);
    else setRow(String(value));
  };
  return (
    <WizardField id="import-header-row" label="Header row" description="Row with the column titles">
      <Input
        {...fieldAria('import-header-row', true)}
        type="number"
        min={1}
        max={100000}
        step={1}
        inputMode="numeric"
        value={row}
        onChange={(e) => setRow(e.currentTarget.value)}
        onBlur={apply}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            apply();
          }
        }}
        className="w-[220px]"
      />
    </WizardField>
  );
}

/** Step 2: which sheet, which header row, into which suite. Changes re-analyse the sheet. */
export function SourceStep({
  fileSize,
  analysis,
  suites,
  target,
  onTarget,
  onSheet,
  onHeaderRow,
  onRestart,
  errors,
}: {
  fileSize: number | null;
  analysis: ImportAnalysisDTO;
  suites: readonly SuiteDTO[];
  target: ImportTargetState;
  onTarget: (next: ImportTargetState) => void;
  onSheet: (sheet: string) => void;
  onHeaderRow: (row: number) => void;
  onRestart: () => void;
  errors: TargetErrors;
}) {
  const { can } = useProject();
  const canCreateSuite = can('manageSuites');
  const hidden = analysis.sheets.filter((s) => s.state !== 'visible').length;
  const recognised = analysis.layout !== 'generic';
  const mappedAuto = analysis.columns.filter((c) => c.suggested.target !== 'ignore').length;

  const modes = (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      aria-label="Existing or new suite"
      value={target.mode}
      onValueChange={(v) => v && onTarget({ ...target, mode: v as ImportTargetState['mode'] })}
      className="bg-card"
    >
      <ToggleGroupItem
        value="existing"
        disabled={suites.length === 0}
        className="px-3 data-[state=on]:font-semibold"
      >
        Existing suite
      </ToggleGroupItem>
      <ToggleGroupItem
        value="new"
        disabled={!canCreateSuite}
        className="px-3 data-[state=on]:font-semibold"
      >
        New suite
      </ToggleGroupItem>
    </ToggleGroup>
  );

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex-row flex-wrap items-center justify-between gap-4 px-5">
        <div className="flex min-w-0 items-center gap-4">
          <span
            aria-hidden
            className="flex size-11 shrink-0 items-center justify-center rounded-md bg-[#ebfbee] text-success"
          >
            <FileSpreadsheet className="size-6" strokeWidth={1.6} />
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold" title={analysis.fileName}>
              {analysis.fileName}
            </p>
            <p className="text-sm text-muted-foreground">
              {fileSize !== null ? `${formatBytes(fileSize)} · ` : ''}
              {pluralize(analysis.sheets.length, 'sheet')}
              {hidden > 0 ? ` (${hidden} hidden)` : ''}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onRestart}>
          <RefreshCw />
          Upload another file
        </Button>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="gap-4 px-5">
          <h2 className="font-semibold">Source</h2>
          <WizardField
            id="import-sheet"
            label="Sheet"
            description="The engine picks the most likely test-case sheet"
          >
            <ComboboxSelect
              {...fieldAria('import-sheet', true)}
              options={analysis.sheets.map((s) => ({
                value: s.name,
                label: SHEET_STATE[s.state] ? `${s.name} (${SHEET_STATE[s.state]})` : s.name,
                hint: pluralize(s.rowCount, 'row'),
              }))}
              value={analysis.sheet}
              onChange={(v) => v && v !== analysis.sheet && onSheet(v)}
              searchable={analysis.sheets.length > 8}
            />
          </WizardField>
          <div>
            <HeaderRowInput
              key={analysis.headerRow}
              value={analysis.headerRow}
              onApply={onHeaderRow}
            />
            {analysis.headerCandidates.length > 1 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Candidates:</span>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  size="sm"
                  aria-label="Header row candidates"
                  value={String(analysis.headerRow)}
                  onValueChange={(v) => v && onHeaderRow(Number(v))}
                  className="bg-card"
                >
                  {analysis.headerCandidates.map((r) => (
                    <ToggleGroupItem
                      key={r}
                      value={String(r)}
                      className="h-7 px-2.5 text-xs data-[state=on]:font-semibold"
                    >
                      Row {r}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
            )}
          </div>
        </Card>

        <Card className="gap-4 px-5">
          <h2 className="font-semibold">Import into</h2>
          {canCreateSuite ? (
            modes
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="w-fit">{modes}</div>
              </TooltipTrigger>
              <TooltipContent side="top" align="start">
                Creating a suite needs the lead role
              </TooltipContent>
            </Tooltip>
          )}
          {target.mode === 'existing' ? (
            <WizardField
              id="import-suite"
              label="Suite"
              description="Existing cases with the same case code are updated (see options)"
              error={errors.suite}
            >
              <ComboboxSelect
                {...fieldAria('import-suite', true, errors.suite)}
                options={suites.map((s) => ({
                  value: String(s.id),
                  label: `${s.name} (${s.prefix})`,
                }))}
                value={target.suiteId}
                onChange={(v) => onTarget({ ...target, suiteId: v })}
                placeholder={suites.length === 0 ? 'No suites yet' : 'Choose a suite'}
                searchable={suites.length > 8}
              />
            </WizardField>
          ) : (
            <div className="flex flex-wrap items-start gap-4">
              <WizardField
                id="import-suite-name"
                label="Suite name"
                error={errors.name}
                className="grid min-w-[200px] flex-1 gap-2"
              >
                <Input
                  {...fieldAria('import-suite-name', false, errors.name)}
                  placeholder="Unit operation test"
                  value={target.name}
                  onChange={(e) => {
                    const name = e.currentTarget.value;
                    onTarget({
                      ...target,
                      name,
                      prefix: target.prefixEdited ? target.prefix : suggestPrefix(name),
                    });
                  }}
                />
              </WizardField>
              <WizardField
                id="import-suite-prefix"
                label="ID prefix"
                description="System ids: PREFIX-001"
                error={errors.prefix}
                className="grid w-[170px] gap-2"
              >
                <Input
                  {...fieldAria('import-suite-prefix', true, errors.prefix)}
                  placeholder="UOP"
                  className="font-mono"
                  value={target.prefix}
                  onChange={(e) =>
                    onTarget({
                      ...target,
                      prefix: e.currentTarget.value.toUpperCase(),
                      prefixEdited: true,
                    })
                  }
                />
              </WizardField>
            </div>
          )}
          {suites.length === 0 && !canCreateSuite && (
            <p className="text-sm text-muted-foreground">
              This project has no suite yet — ask a lead to create one, or to run the import.
            </p>
          )}
        </Card>
      </div>

      <Alert variant={recognised ? 'info' : 'default'} className={recognised ? '' : 'bg-secondary'}>
        <Info />
        <AlertDescription className="block">
          {recognised ? (
            <>
              <b>Layout recognised: {LAYOUT_LABELS[analysis.layout]}.</b>{' '}
            </>
          ) : (
            <>
              <b>No known layout</b> — check the column mapping in the next step.{' '}
            </>
          )}
          Header on row {analysis.headerRow}, {pluralize(analysis.dataRowCount, 'data row')},{' '}
          {pluralize(analysis.columns.length, 'column')} ({mappedAuto} mapped automatically)
          {analysis.envBlock
            ? `, environment block with ${pluralize(analysis.envBlock.labels.length, 'label')} above the table`
            : ''}
          .
        </AlertDescription>
      </Alert>
    </div>
  );
}

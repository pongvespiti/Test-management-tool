'use client';

import type { ColumnMapping, FieldDef, ImportAnalysisDTO, ImportEnvBlock } from '@tmt/shared';
import { Check, ChevronsUpDown, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { StatusPill } from '@/components/common/status-pill';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { pluralize } from '@/lib/format';
import { BLUE, GRAY } from '@/lib/status';
import { cn } from '@/lib/utils';
import { matchLabel } from '@/components/common/combobox-select';
import {
  columnRange,
  LAYOUT_LABELS,
  mappingFromValue,
  mappingValue,
  TARGET_HINTS,
  targetOptions,
  type MappingCheck,
  type TargetOptionGroup,
} from './import-model';

/** "Import as" select: grouped targets with a search box (Popover + Command). */
function TargetSelect({
  groups,
  value,
  onChange,
  label,
  invalid,
}: {
  groups: readonly TargetOptionGroup[];
  value: string;
  onChange: (value: string) => void;
  label: string;
  invalid: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = groups.flatMap((g) => g.items).find((i) => i.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={label}
          aria-invalid={invalid || undefined}
          className="w-full justify-between px-3 font-normal"
        >
          <span className="truncate">{selected?.label ?? 'Select…'}</span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-[240px] p-0">
        <Command filter={matchLabel}>
          <CommandInput placeholder="Search…" />
          <CommandList className="max-h-[320px]">
            <CommandEmpty>Nothing found</CommandEmpty>
            {groups.map((g) => (
              <CommandGroup key={g.group} heading={g.group}>
                {g.items.map((item) => (
                  <CommandItem
                    key={item.value}
                    value={`opt:${item.value}`}
                    keywords={[item.label]}
                    onSelect={() => {
                      onChange(item.value);
                      setOpen(false);
                    }}
                  >
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    <Check className={cn(item.value === value ? 'opacity-100' : 'opacity-0')} />
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Step 3: one row per sheet column — header, sample values, "Import as". */
export function MappingStep({
  analysis,
  fieldDefs,
  mapping,
  onMapping,
  check,
  showErrors,
}: {
  analysis: ImportAnalysisDTO;
  /** Custom fields of the target suite (none for a new suite). */
  fieldDefs: readonly FieldDef[];
  mapping: readonly ColumnMapping[];
  onMapping: (next: ColumnMapping[]) => void;
  check: MappingCheck;
  /** Show blocking errors (after "Next" was pressed). */
  showErrors: boolean;
}) {
  const options = useMemo(() => targetOptions(fieldDefs), [fieldDefs]);
  const byCol = useMemo(() => new Map(mapping.map((m) => [m.col, m])), [mapping]);
  const imported = mapping.filter((m) => m.target !== 'ignore').length;

  const set = (col: number, next: ColumnMapping) =>
    onMapping(mapping.map((m) => (m.col === col ? next : m)));

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <Card className="min-w-0 gap-0 py-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-3">
          <h2 className="font-semibold">Column mapping</h2>
          <div className="flex items-center gap-2">
            <StatusPill tone={analysis.layout === 'generic' ? GRAY : BLUE}>
              {LAYOUT_LABELS[analysis.layout]}
            </StatusPill>
            <span className="text-sm text-muted-foreground">
              {imported} of {pluralize(analysis.columns.length, 'column')} imported
            </span>
          </div>
        </div>
        {showErrors && check.general && (
          <Alert variant="destructive" className="mx-5 mb-3 w-auto py-2">
            <TriangleAlert />
            <AlertDescription>{check.general}</AlertDescription>
          </Alert>
        )}
        <Table className="min-w-[760px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[200px]">Column in file</TableHead>
              <TableHead>Sample (row {analysis.headerRow + 1}…)</TableHead>
              <TableHead className="w-[230px]">Import as</TableHead>
              <TableHead className="w-[230px]">Note</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {analysis.columns.map((c) => {
              const m = byCol.get(c.col) ?? { col: c.col, target: 'ignore' as const };
              const ignored = m.target === 'ignore';
              const error = showErrors ? check.errors.get(c.col) : undefined;
              const note = check.notes.get(c.col);
              const range = columnRange(c);
              return (
                <TableRow key={c.col} className={ignored ? 'bg-[#fbfbfc]' : undefined}>
                  <TableCell className="whitespace-normal">
                    <div className="flex items-baseline gap-2">
                      <span className="w-[34px] shrink-0 font-mono text-xs text-muted-foreground">
                        {range}
                      </span>
                      <span
                        className={cn(
                          'line-clamp-2 text-sm font-semibold',
                          ignored && 'text-muted-foreground',
                        )}
                        title={c.header}
                      >
                        {c.header || <i>(no header)</i>}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    {c.samples.length === 0 ? (
                      <span className="text-sm text-muted-foreground">(empty)</span>
                    ) : (
                      <span
                        className={cn('line-clamp-2 text-sm', ignored && 'text-muted-foreground')}
                        title={c.samples.join('\n')}
                      >
                        {c.samples.join(' · ')}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <TargetSelect
                      groups={options}
                      value={mappingValue(m)}
                      onChange={(v) => set(c.col, mappingFromValue(v, c, m))}
                      label={`Import column ${range} ${c.header} as`.replace(/\s+/g, ' ').trim()}
                      invalid={Boolean(error)}
                    />
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    {m.target === 'new_custom' ? (
                      <div className="grid gap-1">
                        <Input
                          aria-label={`Name of the new field from column ${range}`}
                          aria-invalid={error ? true : undefined}
                          placeholder="Field name"
                          className="h-8"
                          value={m.newFieldLabel ?? ''}
                          onChange={(e) =>
                            set(c.col, { ...m, newFieldLabel: e.currentTarget.value })
                          }
                        />
                        <span
                          className={cn(
                            'text-xs',
                            error ? 'text-destructive' : 'text-muted-foreground',
                          )}
                        >
                          {error ?? 'New field of the suite'}
                        </span>
                      </div>
                    ) : error ? (
                      <span className="text-xs text-destructive">{error}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {note ?? TARGET_HINTS[m.target] ?? ''}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
      <div className="flex min-w-0 flex-col gap-4">
        <EnvBlockCard block={analysis.envBlock} headerRow={analysis.headerRow} />
        <Card className="gap-1.5 px-5">
          <h2 className="font-semibold">What gets imported</h2>
          <p className="text-sm text-muted-foreground">
            {pluralize(analysis.dataRowCount, 'data row')} below row {analysis.headerRow}. Rows
            whose only content is a section name open a section; rows without a title or code are
            added to the case above. The preview shows exactly what will happen.
          </p>
        </Card>
      </div>
    </div>
  );
}

function EnvBlockCard({ block, headerRow }: { block: ImportEnvBlock | null; headerRow: number }) {
  if (!block || block.labels.length === 0)
    return (
      <Card className="gap-1.5 px-5">
        <h2 className="font-semibold">Environment block</h2>
        <p className="text-sm text-muted-foreground">
          No environment labels (device model, FW version …) were found above row {headerRow}.
        </p>
      </Card>
    );
  const columns = block.columns.slice(0, 2);
  return (
    <Card className="gap-3 px-5">
      <div>
        <h2 className="font-semibold">Environment block</h2>
        <p className="text-xs text-muted-foreground">
          {pluralize(block.labels.length, 'label')} above the table
          {block.columns.length > 0 ? ` · ${pluralize(block.columns.length, 'value column')}` : ''}.
          The labels can become the suite’s environment template (next step).
        </p>
      </div>
      <div className="max-h-[300px] overflow-auto rounded-md border">
        <table className="w-full text-xs">
          <tbody>
            {block.labels.map((label, i) => (
              <tr key={`${label}-${i}`} className="border-b last:border-0">
                <td className="w-[45%] px-2 py-1 align-top font-semibold">{label}</td>
                {columns.map((values, k) => (
                  <td
                    key={k}
                    className={cn('px-2 py-1 align-top', !values[i] && 'text-muted-foreground')}
                  >
                    {values[i] || '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

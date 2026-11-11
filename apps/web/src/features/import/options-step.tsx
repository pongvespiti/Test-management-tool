'use client';

import type { ImportEnvBlock, SuiteDTO } from '@tmt/shared';
import { useId } from 'react';
import { useSectionOptions } from '@/components/common/section-tree';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useSectionTree } from '@/lib/api/library';
import { pluralize } from '@/lib/format';
import { useProject } from '@/providers/project-provider';
import { ComboboxSelect } from '@/components/common/combobox-select';
import type { WizardOptions } from './import-model';
import { fieldAria, WizardField } from './source-step';

/** Radio group with a caption and a description (Mantine `Radio.Group` look). */
function RadioField<T extends string>({
  label,
  description,
  value,
  onChange,
  options,
}: {
  label: string;
  description: string;
  value: T;
  onChange: (value: T) => void;
  options: readonly { value: T; label: string; disabled?: boolean }[];
}) {
  const id = useId();
  return (
    <div className="grid gap-2">
      <div>
        <p id={`${id}-label`} className="text-sm font-medium">
          {label}
        </p>
        <p id={`${id}-description`} className="text-xs text-muted-foreground">
          {description}
        </p>
      </div>
      <RadioGroup
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-description`}
        value={value}
        onValueChange={(v) => onChange(v as T)}
        className="gap-2"
      >
        {options.map((o) => (
          <div key={o.value} className="flex items-center gap-2">
            <RadioGroupItem value={o.value} id={`${id}-${o.value}`} disabled={o.disabled} />
            <Label
              htmlFor={`${id}-${o.value}`}
              className="leading-snug font-normal peer-disabled:opacity-50"
            >
              {o.label}
            </Label>
          </div>
        ))}
      </RadioGroup>
    </div>
  );
}

/** Step 4: duplicates, existing cases, environment template and target section. */
export function OptionsStep({
  options,
  onOptions,
  suite,
  envBlock,
  sectionError,
}: {
  options: WizardOptions;
  onOptions: (next: WizardOptions) => void;
  /** Existing target suite; null when a new suite is created. */
  suite: SuiteDTO | null;
  envBlock: ImportEnvBlock | null;
  sectionError?: string;
}) {
  const { projectId } = useProject();
  const tree = useSectionTree(projectId, suite?.id ?? null);
  const sectionOptions = useSectionOptions(tree.data, true).map((o) =>
    o.value === '' ? { ...o, label: '(Top level of the suite)' } : o,
  );
  const set = (patch: Partial<WizardOptions>) => onOptions({ ...options, ...patch });
  const envLabels = envBlock?.labels.length ?? 0;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="gap-6 px-5">
        <RadioField
          label="Same case code twice in the file"
          description="e.g. two rows numbered 3-2-1"
          value={options.onDuplicateInFile}
          onChange={(v) => set({ onDuplicateInFile: v })}
          options={[
            { value: 'renumber', label: 'Renumber the later ones (3-2-1-2, 3-2-1-3 …)' },
            { value: 'keep_first', label: 'Keep the first row, skip the others' },
          ]}
        />
        <RadioField
          label="Case code already in the suite"
          description={
            suite
              ? `Cases of “${suite.name}” with the same case code`
              : 'Only applies when importing into an existing suite'
          }
          value={options.onExisting}
          onChange={(v) => set({ onExisting: v })}
          options={[
            {
              value: 'update',
              label: 'Update the existing case (only the imported columns change)',
              disabled: !suite,
            },
            { value: 'skip', label: 'Skip the row, keep the existing case', disabled: !suite },
            {
              value: 'create_new',
              label: 'Create a new case with a renumbered code (3-2-1-2 …)',
              disabled: !suite,
            },
          ]}
        />
      </Card>
      <Card className="gap-6 px-5">
        <WizardField
          id="import-parent-section"
          label="Put the imported cases under"
          description={
            suite
              ? 'Sections from the file are created inside this section'
              : 'A new suite starts empty: sections come from the file'
          }
          error={sectionError}
        >
          <ComboboxSelect
            {...fieldAria('import-parent-section', true, sectionError)}
            options={sectionOptions}
            value={options.parentSectionId}
            onChange={(v) => set({ parentSectionId: v ?? '' })}
            disabled={!suite || tree.isPending}
            searchable={sectionOptions.length > 10}
          />
        </WizardField>
        <div className="flex items-start gap-3">
          <Checkbox
            id="import-save-env"
            checked={options.saveEnvTemplate && envLabels > 0}
            disabled={envLabels === 0}
            onCheckedChange={(checked) => set({ saveEnvTemplate: checked === true })}
            aria-describedby="import-save-env-description"
            className="mt-0.5"
          />
          <div className="grid gap-1">
            <Label htmlFor="import-save-env" className="leading-snug font-normal">
              {envLabels > 0
                ? `Save the ${pluralize(envLabels, 'environment label')} as the suite’s environment template`
                : 'Save environment labels as the suite’s environment template'}
            </Label>
            <p id="import-save-env-description" className="text-xs text-muted-foreground">
              {envLabels > 0
                ? 'New runs of the suite then ask for these values (device model, FW version …). Labels the suite already has are kept.'
                : 'No environment block was found above the table.'}
            </p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          The next step is a dry run: nothing is saved until you press Import.
        </p>
      </Card>
    </div>
  );
}

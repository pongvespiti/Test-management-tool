'use client';

import type { FieldDef } from '@tmt/shared';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ComboboxSelect } from '@/components/common/combobox-select';

/** Options of a choice-list field; an imported value that is not one of them stays selectable. */
export function customFieldOptions(def: FieldDef, value: string): string[] {
  const options = def.options ?? [];
  return value && !options.includes(value) ? [...options, value] : options;
}

/** Input for one suite custom field (text / long text / choice list); label comes from the form. */
export function CustomFieldInput({
  def,
  value,
  onChange,
  ...control
}: {
  def: FieldDef;
  value: string;
  onChange: (value: string) => void;
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}) {
  if (def.type === 'longtext')
    return (
      <Textarea {...control} value={value} onChange={(e) => onChange(e.currentTarget.value)} />
    );
  if (def.type === 'select') {
    const data = customFieldOptions(def, value);
    return (
      <ComboboxSelect
        {...control}
        options={data.map((o) => ({ value: o, label: o }))}
        value={value || null}
        onChange={(v) => onChange(v ?? '')}
        placeholder="—"
        clearLabel="—"
        searchable={data.length > 8}
      />
    );
  }
  return <Input {...control} value={value} onChange={(e) => onChange(e.currentTarget.value)} />;
}

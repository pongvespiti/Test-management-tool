'use client';

import { DEFAULT_ENV_DIMENSIONS, type EnvDimension } from '@tmt/shared';
import { ListTree, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { ComboboxSelect } from '@/components/common/combobox-select';
import { EmptyState } from '@/components/common/empty-state';
import { QueryState } from '@/components/common/error-alert';
import { IconButton } from '@/components/common/icon-button';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useEnvDimensions, useNormalizeRuns, useSaveEnvDimensions } from '@/lib/api/env-dimensions';
import { pluralize } from '@/lib/format';
import { notifyError, notifySuccess } from '@/lib/notify';
import { useProject } from '@/providers/project-provider';
import {
  addDimension,
  addValue,
  parentChoices,
  removeDimension,
  removeValue,
  setParent,
} from './env-lists-model';

/** Values of one list (or of one parent value) as removable chips with an add box. */
function ValueChips({
  name,
  values,
  disabled,
  onAdd,
  onRemove,
}: {
  name: string;
  values: string[];
  disabled: boolean;
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
}) {
  const [text, setText] = useState('');
  const add = () => {
    onAdd(text);
    setText('');
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      {values.map((v) => (
        <span
          key={v}
          className="inline-flex items-center gap-1 rounded-full border bg-muted px-2.5 py-0.5 text-sm"
        >
          {v}
          {!disabled && (
            <button
              type="button"
              aria-label={`Remove ${v} from ${name}`}
              className="rounded-full text-muted-foreground hover:text-foreground"
              onClick={() => onRemove(v)}
            >
              <X className="size-3.5" />
            </button>
          )}
        </span>
      ))}
      {values.length === 0 && <span className="text-sm text-muted-foreground">No values yet</span>}
      {!disabled && (
        <div className="flex items-center gap-1">
          <Input
            className="h-8 w-40"
            aria-label={`Add value to ${name}`}
            placeholder="New value"
            value={text}
            onChange={(e) => setText(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Add to ${name}`}
            disabled={!text.trim()}
            onClick={add}
          >
            <Plus />
          </Button>
        </div>
      )}
    </div>
  );
}

function DimensionCard({
  dim,
  dims,
  disabled,
  onChange,
}: {
  dim: EnvDimension;
  dims: EnvDimension[];
  disabled: boolean;
  onChange: (next: EnvDimension[]) => void;
}) {
  const parent = dims.find((d) => d.label === dim.parent);
  const choices = parentChoices(dims, dim.label);
  const groups: { title: string | null; parent: string | null }[] = parent
    ? [
        ...parent.values.map((v) => ({ title: v.value, parent: v.value })),
        ...(dim.values.some((v) => v.parent === null) ? [{ title: 'Any', parent: null }] : []),
      ]
    : [{ title: null, parent: null }];

  return (
    <Card className="gap-3 p-4" role="region" aria-label={dim.label}>
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-base font-semibold">{dim.label}</h3>
        {(choices.length > 0 || dim.parent) && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Depends on</span>
            <ComboboxSelect
              aria-label={`${dim.label} depends on`}
              className="w-[180px]"
              options={choices.map((c) => ({ value: c, label: c }))}
              value={dim.parent}
              onChange={(v) => onChange(setParent(dims, dim.label, v))}
              placeholder="Nothing"
              clearLabel="Nothing"
              searchable={false}
              disabled={disabled}
            />
          </div>
        )}
        {!disabled && (
          <IconButton
            label={`Remove list ${dim.label}`}
            tone="danger"
            className="ml-auto"
            onClick={() => onChange(removeDimension(dims, dim.label))}
          >
            <Trash2 />
          </IconButton>
        )}
      </div>
      {parent && parent.values.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Add values to {parent.label} first, then list the {dim.label} values under each.
        </p>
      )}
      {groups.map((g) => (
        <div key={g.parent ?? '*'} className="flex flex-col gap-1.5">
          {g.title !== null && <p className="text-sm font-medium">{g.title}</p>}
          <ValueChips
            name={g.title === null ? dim.label : `${dim.label} of ${g.title}`}
            values={dim.values.filter((v) => v.parent === g.parent).map((v) => v.value)}
            disabled={disabled}
            onAdd={(value) => onChange(addValue(dims, dim.label, value, g.parent))}
            onRemove={(value) => onChange(removeValue(dims, dim.label, value, g.parent))}
          />
        </div>
      ))}
    </Card>
  );
}

/**
 * Lists of values behind the labels of a run's environment. A list can depend on another one
 * (OS version and phone model on Platform). Saving a run gives its values the spelling listed here
 * and adds the new ones, so the summary can group and filter by them.
 */
export function EnvListsPage() {
  const { project, projectId, can } = useProject();
  const query = useEnvDimensions(projectId);
  const save = useSaveEnvDimensions(projectId);
  const tidy = useNormalizeRuns(projectId);
  const [draft, setDraft] = useState<EnvDimension[] | null>(null);
  const [label, setLabel] = useState('');
  const editable = can('manageDimensions');
  const saved = query.data?.dimensions ?? [];
  const dims = draft ?? saved;
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(saved);

  const commit = async (next: EnvDimension[]) => {
    try {
      await save.mutateAsync({ dimensions: next });
      setDraft(null);
      notifySuccess('Environment lists saved');
    } catch (error) {
      notifyError(error, 'Could not save the lists');
    }
  };

  const runTidy = async () => {
    try {
      const r = await tidy.mutateAsync();
      notifySuccess(
        'Runs tidied',
        `${pluralize(r.updatedRuns, 'run')} respelled, ${pluralize(r.addedValues, 'value')} added to the lists.`,
      );
    } catch (error) {
      notifyError(error, 'Could not tidy the runs');
    }
  };

  return (
    <>
      <PageHeader
        eyebrow={project.name}
        title="Environment lists"
        subtitle="The values behind the items of a run's environment (Platform, OS version, unit model, firmware …). The summary groups and filters runs by them."
        actions={
          editable && (
            <>
              <Button
                variant="outline"
                onClick={() => void runTidy()}
                disabled={dirty || dims.length === 0 || tidy.isPending}
                title={dirty ? 'Save the lists first' : undefined}
              >
                Tidy existing runs
              </Button>
              <Button onClick={() => void commit(dims)} disabled={!dirty || save.isPending}>
                Save lists
              </Button>
            </>
          )
        }
      />
      <QueryState query={query}>
        {dims.length === 0 ? (
          <EmptyState
            icon={<ListTree className="size-6" strokeWidth={1.6} />}
            title="No lists yet"
            description="Start from the usual set (Platform, OS ver, Mobile model, App version, Unit model, FW version, ADP&FW, Router) or add your own."
            action={
              editable ? (
                <Button onClick={() => void commit(structuredClone([...DEFAULT_ENV_DIMENSIONS]))}>
                  Use the usual set
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="flex flex-col gap-4">
            {dims.map((d) => (
              <DimensionCard
                key={d.label}
                dim={d}
                dims={dims}
                disabled={!editable}
                onChange={setDraft}
              />
            ))}
          </div>
        )}
        {editable && dims.length > 0 && (
          <form
            className="mt-4 flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setDraft(addDimension(dims, label));
              setLabel('');
            }}
          >
            <Input
              className="w-64"
              aria-label="New list"
              placeholder="New list, e.g. Region"
              value={label}
              onChange={(e) => setLabel(e.currentTarget.value)}
            />
            <Button type="submit" variant="outline" disabled={!label.trim()}>
              <Plus /> Add list
            </Button>
          </form>
        )}
      </QueryState>
    </>
  );
}

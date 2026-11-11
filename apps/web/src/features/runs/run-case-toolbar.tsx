'use client';

import {
  CASE_PRIORITIES,
  CASE_PRIORITY_LABELS,
  RESULT_LABELS,
  RESULT_STATUSES,
  type CasePriority,
  type ResultStatus,
  type StatusCounts,
} from '@tmt/shared';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useDebouncedCallback } from '@/hooks/use-debounce';
import { formatNumber } from '@/lib/format';
import { CASE_PRIORITY_DOTS, RESULT_TONES } from '@/lib/status';
import { ComboboxSelect, type ComboOption } from '@/components/common/combobox-select';
import { SearchInput } from '@/components/common/list-controls';
import { CheckMenu, Dot } from './check-menu';
import {
  hasFilters,
  NO_FILTERS,
  statusLabelOf,
  type RunFilters,
  type SectionOption,
} from './run-cases';

interface Props {
  filters: RunFilters;
  onChange: (patch: Partial<RunFilters>) => void;
  counts: StatusCounts;
  assigneeOptions: { value: string; label: string }[];
  tags: string[];
  sections: SectionOption[];
  shown: number;
  total: number;
}

const PRIORITY_OPTIONS = CASE_PRIORITIES.map((p) => ({
  value: p,
  label: CASE_PRIORITY_LABELS[p],
  icon: <Dot color={CASE_PRIORITY_DOTS[p]} />,
}));

/** Search and filters of the run's case list (result, assignee, priority, tag, section). */
export function RunCaseToolbar({
  filters,
  onChange,
  counts,
  assigneeOptions,
  tags,
  sections,
  shown,
  total,
}: Props) {
  const [text, setText] = useState(filters.q);
  const [syncedQ, setSyncedQ] = useState(filters.q);
  const commit = useDebouncedCallback((value: string) => onChange({ q: value.trim() }), 250);

  // Follow external changes (clear filters, back button) without eating a trailing space.
  if (syncedQ !== filters.q) {
    setSyncedQ(filters.q);
    if (text.trim() !== filters.q) setText(filters.q);
  }

  const statusOptions = useMemo(
    () =>
      RESULT_STATUSES.map((s: ResultStatus) => ({
        value: s,
        label: statusLabelOf(s, RESULT_LABELS),
        count: counts[s],
        icon: <Dot color={RESULT_TONES[s].bar} outline={s === 'untested'} />,
      })),
    [counts],
  );
  const tagData = useMemo<ComboOption[]>(() => tags.map((t) => ({ value: t, label: t })), [tags]);
  const sectionData = useMemo<ComboOption[]>(
    () =>
      sections.map((s) => ({
        value: s.value,
        label: `${'   '.repeat(s.depth)}${s.label}`,
        hint: s.count,
      })),
    [sections],
  );
  const active = hasFilters(filters);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <SearchInput
        placeholder="Filter by id, code or title"
        aria-label="Filter cases by id, code or title"
        className="min-w-40 flex-[1_1_200px]"
        value={text}
        onValueChange={(value) => {
          setText(value);
          commit.run(value);
        }}
        onClear={() => {
          commit.cancel();
          setText('');
          onChange({ q: '' });
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit.cancel();
            onChange({ q: text.trim() });
          }
          if (e.key === 'Escape' && text) {
            e.stopPropagation();
            commit.cancel();
            setText('');
            onChange({ q: '' });
          }
        }}
      />
      <CheckMenu<ResultStatus>
        label="Result"
        options={statusOptions}
        value={filters.status}
        onChange={(status) => onChange({ status })}
      />
      <ComboboxSelect
        aria-label="Filter by assignee"
        placeholder="Anyone"
        clearLabel="Anyone"
        options={assigneeOptions}
        value={filters.assignee === null ? null : String(filters.assignee)}
        onChange={(v) =>
          onChange({ assignee: v === null ? null : v === 'me' || v === 'none' ? v : Number(v) })
        }
        className="w-[170px]"
      />
      <CheckMenu<CasePriority>
        label="Priority"
        options={PRIORITY_OPTIONS}
        value={filters.priority}
        onChange={(priority) => onChange({ priority })}
        className="w-[200px]"
      />
      {tags.length > 0 && (
        <ComboboxSelect
          aria-label="Filter by tag"
          placeholder="Any tag"
          clearLabel="Any tag"
          options={tagData}
          value={filters.tag}
          onChange={(tag) => onChange({ tag })}
          className="w-[130px]"
        />
      )}
      {sections.length > 0 && (
        <ComboboxSelect
          aria-label="Filter by section"
          placeholder="All sections"
          clearLabel="All sections"
          options={sectionData}
          value={filters.section}
          onChange={(section) => onChange({ section })}
          className="w-[170px]"
        />
      )}
      {active && (
        <div className="ml-auto flex items-center gap-1">
          <span aria-live="polite" className="text-xs whitespace-nowrap text-muted-foreground">
            {formatNumber(shown)} of {formatNumber(total)}
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs"
            onClick={() => {
              commit.cancel();
              setText('');
              onChange(NO_FILTERS);
            }}
          >
            Clear
          </Button>
        </div>
      )}
    </div>
  );
}

'use client';

import {
  CASE_PRIORITIES,
  CASE_STATUS_LABELS,
  CASE_STATUSES,
  CASE_TYPES,
  type CasePriority,
  type CaseStatus,
  type CaseType,
} from '@tmt/shared';
import { ChevronDown, FunnelX, Tag } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CasePriorityLabel } from '@/components/common/case-priority-label';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDebouncedCallback } from '@/hooks/use-debounce';
import { useTags } from '@/lib/api/shared-steps';
import { useProject } from '@/providers/project-provider';
import { ComboboxSelect, type ComboOption } from '@/components/common/combobox-select';
import { SearchInput } from '@/components/common/list-controls';
import type { CasesUrlPatch } from './use-cases-url-state';

const ALL = 'all';

interface CaseToolbarProps {
  q: string;
  caseType: CaseType | null;
  status: CaseStatus | null;
  priority: CasePriority[];
  tag: string;
  onChange: (patch: CasesUrlPatch) => void;
}

/** Search (debounced, server-side) and type/status/priority/tag filters of the case list. */
export function CaseToolbar({ q, caseType, status, priority, tag, onChange }: CaseToolbarProps) {
  const { projectId } = useProject();
  const tags = useTags(projectId);
  const [text, setText] = useState(q);
  const [syncedQ, setSyncedQ] = useState(q);
  const commit = useDebouncedCallback((value: string) => onChange({ q: value.trim() }), 300);

  // Follow external changes (global search, back button) without eating a trailing space while typing.
  if (syncedQ !== q) {
    setSyncedQ(q);
    if (text.trim() !== q) setText(q);
  }

  const tagOptions = useMemo(() => {
    const list: ComboOption[] = (tags.data ?? []).map((t) => ({
      value: t.tag,
      label: t.tag,
      hint: t.count,
    }));
    // A tag from a link may not be in the list (or the list failed to load): keep it selectable.
    if (tag && !list.some((t) => t.value.toLowerCase() === tag.toLowerCase()))
      list.unshift({ value: tag, label: tag });
    return list;
  }, [tags.data, tag]);
  const selectedTag = tag
    ? (tagOptions.find((o) => o.value.toLowerCase() === tag.toLowerCase())?.value ?? null)
    : null;
  const filtered = Boolean(q || caseType || status || priority.length > 0 || tag);

  return (
    <div className="flex min-w-0 flex-[1_1_auto] flex-wrap items-center gap-2">
      <SearchInput
        placeholder="Search this suite: id, code, title, steps…"
        aria-label="Search cases in this suite"
        className="max-w-[380px] flex-[1_1_240px]"
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
          if (e.key !== 'Enter') return;
          commit.cancel();
          onChange({ q: text.trim() });
        }}
      />
      <Select
        value={caseType ?? ALL}
        onValueChange={(v) => onChange({ caseType: v === ALL ? null : (v as CaseType) })}
      >
        <SelectTrigger aria-label="Filter by type" className="w-[130px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All types</SelectItem>
          {CASE_TYPES.map((t) => (
            <SelectItem key={t} value={t}>
              {t}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={status ?? ALL}
        onValueChange={(v) => onChange({ status: v === ALL ? null : (v as CaseStatus) })}
      >
        <SelectTrigger aria-label="Filter by status" className="w-[145px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All statuses</SelectItem>
          {CASE_STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {CASE_STATUS_LABELS[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            aria-label="Filter by priority"
            className="min-w-[150px] justify-between px-3 font-normal"
          >
            {priority.length === 0 ? (
              <span className="text-muted-foreground">All priorities</span>
            ) : (
              <span className="flex items-center gap-2.5">
                {priority.map((p) => (
                  <CasePriorityLabel key={p} priority={p} />
                ))}
              </span>
            )}
            <ChevronDown className="opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[180px]">
          {CASE_PRIORITIES.map((p) => (
            <DropdownMenuCheckboxItem
              key={p}
              checked={priority.includes(p)}
              // Keep the menu open to pick several priorities.
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={(on) =>
                onChange({
                  priority: on
                    ? CASE_PRIORITIES.filter((x) => x === p || priority.includes(x))
                    : priority.filter((x) => x !== p),
                })
              }
            >
              <CasePriorityLabel priority={p} />
            </DropdownMenuCheckboxItem>
          ))}
          {priority.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onChange({ priority: [] })}>
                All priorities
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ComboboxSelect
        aria-label="Filter by tag"
        className="w-[170px]"
        icon={<Tag className="size-3.5 shrink-0 text-muted-foreground" />}
        options={tagOptions}
        value={selectedTag}
        onChange={(v) => onChange({ tag: v ?? '' })}
        placeholder="All tags"
        clearLabel="All tags"
        searchPlaceholder="Search tags…"
        emptyText={tags.isError ? 'Tags could not be loaded' : 'No tags'}
      />
      {filtered && (
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => {
            commit.cancel();
            setText('');
            onChange({ q: '', caseType: null, status: null, priority: [], tag: '' });
          }}
        >
          <FunnelX />
          Clear filters
        </Button>
      )}
    </div>
  );
}

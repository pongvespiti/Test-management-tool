'use client';

import { CASE_PRIORITIES, RESULT_STATUSES } from '@tmt/shared';
import { useCallback, useMemo } from 'react';
import { toId } from '@/lib/forms';
import { useUrlSearchParams } from '@/hooks/use-url-search-params';
import type { AssigneeFilter, RunFilters } from './run-cases';

/** Change of the run page state; omitted keys keep their value. */
export type RunUrlPatch = Partial<RunFilters> & { caseId?: number | null };

interface RawFilters {
  q: string | null;
  status: string | null;
  assignee: string | null;
  priority: string | null;
  tag: string | null;
  section: string | null;
}

function listOf<T extends string>(all: readonly T[], value: string | null): T[] {
  if (!value) return [];
  const wanted = new Set(value.split(','));
  return all.filter((v) => wanted.has(v));
}

function assigneeOf(value: string | null): AssigneeFilter | null {
  if (value === 'me' || value === 'none') return value;
  return toId(value);
}

function rawFilters(params: URLSearchParams): RawFilters {
  return {
    q: params.get('q'),
    status: params.get('status'),
    assignee: params.get('assignee'),
    priority: params.get('priority'),
    tag: params.get('tag'),
    section: params.get('section'),
  };
}

function filtersFrom(raw: RawFilters): RunFilters {
  return {
    q: raw.q ?? '',
    status: listOf(RESULT_STATUSES, raw.status),
    assignee: assigneeOf(raw.assignee),
    priority: listOf(CASE_PRIORITIES, raw.priority),
    tag: raw.tag || null,
    section: raw.section || null,
  };
}

/** Filters of `?q=&status=ng,untested&assignee=me&priority=high&tag=&section=`. */
export function parseRunFilters(params: URLSearchParams): RunFilters {
  return filtersFrom(rawFilters(params));
}

/** URL params after a patch; empty values are removed. */
export function applyRunPatch(prev: URLSearchParams, patch: RunUrlPatch): URLSearchParams {
  const next = new URLSearchParams(prev);
  const set = (key: string, value: string | null | undefined) => {
    if (value === null || value === undefined || value === '') next.delete(key);
    else next.set(key, value);
  };
  if ('caseId' in patch) set('case', patch.caseId ? String(patch.caseId) : null);
  if ('q' in patch) set('q', patch.q?.trim());
  if ('status' in patch) set('status', patch.status?.join(','));
  if ('assignee' in patch) set('assignee', patch.assignee === null ? null : String(patch.assignee));
  if ('priority' in patch) set('priority', patch.priority?.join(','));
  if ('tag' in patch) set('tag', patch.tag);
  if ('section' in patch) set('section', patch.section);
  return next;
}

/**
 * Run page state in the URL: `?case=<runCaseId>` (deep-linkable from defects, dashboards and
 * history) and the filters. All updates replace the history entry (moving through hundreds of cases
 * must not flood "back"). `filters` is stable while only the selected case changes.
 */
export function useRunUrlState() {
  const [params, setParams] = useUrlSearchParams();
  const { q, status, assignee, priority, tag, section } = rawFilters(params);
  const filters = useMemo(
    () => filtersFrom({ q, status, assignee, priority, tag, section }),
    [q, status, assignee, priority, tag, section],
  );
  const update = useCallback(
    (patch: RunUrlPatch) => setParams((prev) => applyRunPatch(prev, patch)),
    [setParams],
  );
  return { caseId: toId(params.get('case')), filters, update };
}

'use client';

import {
  DEFECT_SEVERITIES,
  DEFECT_STATUSES,
  type DefectSeverity,
  type DefectStatus,
} from '@tmt/shared';
import { useCallback, useMemo } from 'react';
import { toId } from '@/lib/forms';
import { useUrlSearchParams } from '@/hooks/use-url-search-params';

export interface DefectsUrlState {
  q: string;
  status: DefectStatus[];
  severity: DefectSeverity[];
  releaseId: number | null;
  buildId: number | null;
  /** A user id, `'me'` (resolved by the page) or null = anyone. */
  assignee: number | 'me' | null;
  page: number;
}

export type DefectsUrlPatch = Partial<DefectsUrlState>;

function listOf<T extends string>(all: readonly T[], value: string | null): T[] {
  if (!value) return [];
  const wanted = new Set(value.split(','));
  return all.filter((v) => wanted.has(v));
}

/** Filters of `?status=new,open&severity=major&release=3&build=8&assignee=me&q=&page=`. */
export function parseDefectsUrl(params: URLSearchParams): DefectsUrlState {
  const assignee = params.get('assignee');
  return {
    q: params.get('q') ?? '',
    status: listOf(DEFECT_STATUSES, params.get('status')),
    severity: listOf(DEFECT_SEVERITIES, params.get('severity')),
    releaseId: toId(params.get('release')),
    buildId: toId(params.get('build')),
    assignee: assignee === 'me' ? 'me' : toId(assignee),
    page: Math.max(1, toId(params.get('page')) ?? 1),
  };
}

/** URL params after a patch; any filter change goes back to page 1 unless `page` is patched. */
export function applyDefectsPatch(prev: URLSearchParams, patch: DefectsUrlPatch): URLSearchParams {
  const next = new URLSearchParams(prev);
  const set = (key: string, value: string | null | undefined) => {
    if (value === null || value === undefined || value === '') next.delete(key);
    else next.set(key, value);
  };
  if ('q' in patch) set('q', patch.q?.trim());
  if ('status' in patch) set('status', patch.status?.join(','));
  if ('severity' in patch) set('severity', patch.severity?.join(','));
  if ('releaseId' in patch) set('release', patch.releaseId ? String(patch.releaseId) : null);
  if ('buildId' in patch) set('build', patch.buildId ? String(patch.buildId) : null);
  if ('assignee' in patch) set('assignee', patch.assignee === null ? null : String(patch.assignee));
  if ('page' in patch) set('page', patch.page && patch.page > 1 ? String(patch.page) : null);
  else next.delete('page');
  return next;
}

/**
 * Defect list filters live in the URL so that a filtered list can be bookmarked or shared and the
 * back button restores it. Updates replace the history entry.
 */
export function useDefectsUrlState() {
  const [params, setParams] = useUrlSearchParams();
  const state = useMemo(() => parseDefectsUrl(params), [params]);
  const update = useCallback(
    (patch: DefectsUrlPatch) => setParams((prev) => applyDefectsPatch(prev, patch)),
    [setParams],
  );
  const clear = useCallback(() => setParams(() => new URLSearchParams()), [setParams]);
  return { ...state, update, clear };
}

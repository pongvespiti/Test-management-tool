'use client';

import {
  CASE_PRIORITIES,
  CASE_STATUSES,
  CASE_TYPES,
  type CasePriority,
  type CaseStatus,
  type CaseType,
} from '@tmt/shared';
import { useCallback, useMemo } from 'react';
import { toId } from '@/lib/forms';
import { routes } from '@/lib/routes';
import { useUrlSearchParams, type UrlUpdateOptions } from '@/hooks/use-url-search-params';

export interface CasesUrlState {
  suiteId: number | null;
  /** Selected section id; null = all cases of the suite (see also `unsectioned`). */
  sectionId: number | null;
  /** Only cases without a section (`section=none`). */
  unsectioned: boolean;
  caseId: number | null;
  q: string;
  caseType: CaseType | null;
  status: CaseStatus | null;
  /** Any of these priorities (`priority=critical,high`); empty = all. */
  priority: CasePriority[];
  /** One tag, case-insensitive; '' = all. */
  tag: string;
  page: number;
}

export type CasesUrlPatch = Partial<{
  [K in keyof CasesUrlState]: CasesUrlState[K] | null;
}>;

const PARAM: Record<Exclude<keyof CasesUrlState, 'unsectioned'>, string> = {
  suiteId: 'suite',
  sectionId: 'section',
  caseId: 'case',
  q: 'q',
  caseType: 'type',
  status: 'status',
  priority: 'priority',
  tag: 'tag',
  page: 'page',
};

const NO_SECTION = 'none';

function oneOf<T extends string>(list: readonly T[], value: string | null): T | null {
  return value !== null && (list as readonly string[]).includes(value) ? (value as T) : null;
}

function priorities(value: string | null): CasePriority[] {
  if (!value) return [];
  const set = new Set(value.split(',').map((v) => v.trim()));
  return CASE_PRIORITIES.filter((p) => set.has(p));
}

/** Library state from the URL: `?suite=&section=<id|none>&case=&q=&type=&status=&priority=&tag=&page=`. */
export function parseCasesUrl(params: URLSearchParams): CasesUrlState {
  const section = params.get('section');
  return {
    suiteId: toId(params.get('suite')),
    sectionId: section === NO_SECTION ? null : toId(section),
    unsectioned: section === NO_SECTION,
    caseId: toId(params.get('case')),
    q: params.get('q') ?? '',
    caseType: oneOf(CASE_TYPES, params.get('type')),
    status: oneOf(CASE_STATUSES, params.get('status')),
    priority: priorities(params.get('priority')),
    tag: params.get('tag') ?? '',
    page: Math.max(1, toId(params.get('page')) ?? 1),
  };
}

/**
 * URL params after a patch. Any change except opening/closing a case goes back to page 1 unless
 * the patch sets `page`.
 */
export function applyCasesPatch(prev: URLSearchParams, patch: CasesUrlPatch): URLSearchParams {
  const next = new URLSearchParams(prev);
  const keys = Object.keys(patch) as (keyof CasesUrlState)[];
  for (const key of keys) {
    const value = patch[key];
    if (key === 'unsectioned') {
      if (value === true) next.set('section', NO_SECTION);
      else if (next.get('section') === NO_SECTION) next.delete('section');
      continue;
    }
    const name = PARAM[key];
    if (Array.isArray(value)) {
      if (value.length === 0) next.delete(name);
      else next.set(name, value.join(','));
    } else if (
      value === null ||
      value === undefined ||
      value === '' ||
      value === false ||
      (key === 'page' && value === 1)
    ) {
      // Selecting "all" must not drop `section=none` set by the same patch.
      if (!(key === 'sectionId' && patch.unsectioned === true)) next.delete(name);
    } else next.set(name, String(value));
  }
  if (!keys.includes('page') && keys.some((k) => k !== 'caseId')) next.delete('page');
  return next;
}

/**
 * Library state lives in the URL so that links from global search, runs, defects and reviews open
 * the right place and the back button closes the case panel (opening a case adds a history entry).
 */
export function useCasesUrlState() {
  const [params, setParams] = useUrlSearchParams();
  const state = useMemo(() => parseCasesUrl(params), [params]);
  const update = useCallback(
    (patch: CasesUrlPatch, opts: UrlUpdateOptions = {}) =>
      setParams((prev) => applyCasesPatch(prev, patch), opts),
    [setParams],
  );
  return { ...state, update };
}

/** Link into the library that opens one case (review queue, shared steps, …). */
export function caseLink(projectId: number, c: { id: number; suiteId: number }): string {
  return routes.cases(projectId, { suite: c.suiteId, case: c.id });
}

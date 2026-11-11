/** Pure helpers of the run page: filters, grouping by section, effective assignee, options. */
import {
  emptyCounts,
  type CasePriority,
  type MemberDTO,
  type ResultStatus,
  type RunCaseDTO,
  type RunDTO,
  type StatusCounts,
  type UserRef,
} from '@tmt/shared';

/** Separator of section paths in labels and the `section` URL parameter. */
export const PATH_SEP = ' › ';

/** `'me'` and `'none'` (no assignee and no run tester) or a user id. */
export type AssigneeFilter = 'me' | 'none' | number;

export interface RunFilters {
  q: string;
  status: ResultStatus[];
  assignee: AssigneeFilter | null;
  priority: CasePriority[];
  tag: string | null;
  /** Section path prefix (joined with PATH_SEP); matches the section and its sub-sections. */
  section: string | null;
}

export const NO_FILTERS: RunFilters = {
  q: '',
  status: [],
  assignee: null,
  priority: [],
  tag: null,
  section: null,
};

export function hasFilters(f: RunFilters): boolean {
  return Boolean(
    f.q || f.status.length || f.assignee !== null || f.priority.length || f.tag || f.section,
  );
}

export function pathKey(path: readonly string[]): string {
  return path.join(PATH_SEP);
}

/** Label of a result in filters and legends ("Untested" instead of the empty export label). */
export function statusLabelOf(status: ResultStatus, labels: Record<ResultStatus, string>): string {
  return status === 'untested' ? 'Untested' : labels[status];
}

/** Effective assignee = explicit assignee, else the run's tester (`inherited`). */
export function effectiveAssignee(
  rc: Pick<RunCaseDTO, 'assignee'>,
  run: Pick<RunDTO, 'tester'>,
): { user: UserRef | null; inherited: boolean } {
  if (rc.assignee) return { user: rc.assignee, inherited: false };
  return { user: run.tester, inherited: run.tester !== null };
}

/** Lower-cased search tokens; every token must appear in id, code, title or references. */
function tokens(q: string): string[] {
  return q.toLowerCase().split(/\s+/).filter(Boolean);
}

export function makeMatcher(
  f: RunFilters,
  run: Pick<RunDTO, 'tester'>,
  meId: number | null,
): (rc: RunCaseDTO) => boolean {
  const words = tokens(f.q);
  const tag = f.tag?.toLowerCase() ?? null;
  const testerId = run.tester?.id ?? null;
  return (rc) => {
    if (f.status.length && !f.status.includes(rc.status)) return false;
    if (f.priority.length && !f.priority.includes(rc.priority)) return false;
    if (tag && !rc.tags.some((t) => t.toLowerCase() === tag)) return false;
    if (f.section) {
      const key = pathKey(rc.sectionPath);
      if (key !== f.section && !key.startsWith(f.section + PATH_SEP)) return false;
    }
    if (f.assignee !== null) {
      const id = rc.assignee?.id ?? testerId;
      if (
        f.assignee === 'me'
          ? id !== meId || meId === null
          : f.assignee === 'none'
            ? id !== null
            : id !== f.assignee
      )
        return false;
    }
    if (words.length) {
      const hay =
        `${rc.displayId} ${rc.code ?? ''} ${rc.title} ${rc.references ?? ''}`.toLowerCase();
      if (!words.every((w) => hay.includes(w))) return false;
    }
    return true;
  };
}

export interface CaseGroup {
  /** Joined section path ('' = no section). */
  key: string;
  path: string[];
  cases: RunCaseDTO[];
  counts: StatusCounts;
}

/** Groups run cases by full section path in order of first appearance (run order = tree order). */
export function groupBySection(cases: readonly RunCaseDTO[]): CaseGroup[] {
  const map = new Map<string, CaseGroup>();
  for (const rc of cases) {
    const key = pathKey(rc.sectionPath);
    let g = map.get(key);
    if (!g) {
      g = { key, path: rc.sectionPath, cases: [], counts: emptyCounts() };
      map.set(key, g);
    }
    g.cases.push(rc);
    g.counts[rc.status] += 1;
  }
  return [...map.values()];
}

export interface SectionOption {
  value: string;
  label: string;
  depth: number;
  count: number;
}

/** Every section path prefix present in the run (tree order), with case counts. */
export function sectionOptions(cases: readonly RunCaseDTO[]): SectionOption[] {
  const byKey = new Map<string, SectionOption>();
  for (const rc of cases) {
    rc.sectionPath.forEach((label, depth) => {
      const key = pathKey(rc.sectionPath.slice(0, depth + 1));
      const opt = byKey.get(key);
      if (opt) opt.count += 1;
      else byKey.set(key, { value: key, label, depth, count: 1 });
    });
  }
  return [...byKey.values()];
}

/** Distinct tags of the run (case-insensitive), alphabetical. */
export function tagOptions(cases: readonly RunCaseDTO[]): string[] {
  const seen = new Map<string, string>();
  for (const rc of cases)
    for (const t of rc.tags) if (!seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
  return [...seen.values()].toSorted((a, b) => a.localeCompare(b));
}

/** Counts of a list of run cases. */
export function countsOf(cases: readonly Pick<RunCaseDTO, 'status'>[]): StatusCounts {
  const c = emptyCounts();
  for (const rc of cases) c[rc.status] += 1;
  return c;
}

/** Suggested code for a re-run: `KR_01` → `KR_01_R2`, `KR_01_R2` → `KR_01_R3`. */
export function suggestRerunCode(code: string): string {
  const m = /^(.*)_R(\d+)$/.exec(code);
  if (m) return `${m[1]}_R${Number(m[2]) + 1}`;
  return `${code}_R2`.slice(0, 60);
}

/** Members who can be assignees (testers and leads; viewers are refused), alphabetical. */
export function assignableMembers(
  members: readonly MemberDTO[],
): { value: string; label: string }[] {
  return members
    .filter((m) => m.role !== 'viewer')
    .map((m) => ({ value: String(m.user.id), label: m.user.displayName }))
    .toSorted((a, b) => a.label.localeCompare(b.label));
}

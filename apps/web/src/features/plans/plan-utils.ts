import {
  PLAN_STATUSES,
  RESULT_LABELS,
  type EnvEntryDTO,
  type PlanDTO,
  type PlanStatus,
  type RunDTO,
  type SectionNode,
  type StatusCounts,
  type TemplateDTO,
} from '@tmt/shared';

/** Distinct suite names of a plan's runs, in run order. */
export function suiteNamesOf(plan: Pick<PlanDTO, 'runs'>): string[] {
  return [...new Set(plan.runs.map((r) => r.suiteName))];
}

/** `Suite: A` / `Suites: A, B`; null without suites. */
export function suitesLabel(suites: readonly string[]): string | null {
  if (suites.length === 0) return null;
  return `${suites.length === 1 ? 'Suite' : 'Suites'}: ${suites.join(', ')}`;
}

/** Short environment summary: the first `max` filled values, e.g. `Gen 4 · 3.12.119`. */
export function envSummary(environment: EnvEntryDTO[], max = 3): string {
  return environment
    .map((e) => e.value.trim())
    .filter(Boolean)
    .slice(0, max)
    .join(' · ');
}

/** Run codes used in the plan (case-insensitive), to suggest a free code. */
export function usedCodes(runs: Pick<RunDTO, 'code'>[]): Set<string> {
  return new Set(runs.map((r) => r.code.trim().toLowerCase()));
}

/** Next free run code: `${base}${n}` with n = start, start + 1 … padded to `pad` digits. */
export function nextFreeCode(base: string, used: Set<string>, pad = 2, start = 1): string {
  for (let n = start; n < start + 500; n++) {
    const code = `${base}${String(n).padStart(pad, '0')}`;
    if (!used.has(code.toLowerCase())) return code;
  }
  return base;
}

/** Re-run code suggestion: `KR_01` → `KR_01_R1`, `KR_01_R1` → `KR_01_R2`. */
export function suggestRerunCode(sourceCode: string, used: Set<string>): string {
  const m = /^(.*)_R(\d+)$/i.exec(sourceCode);
  const stem = m ? m[1]! : sourceCode;
  const start = m ? Number(m[2]) + 1 : 1;
  return nextFreeCode(`${stem}_R`, used, 1, start);
}

/** Duplicate code suggestion: `KR_01` → `KR_02` (next free number), else `KR_01_2`. */
export function suggestDuplicateCode(sourceCode: string, used: Set<string>): string {
  const m = /^(.*?)(\d+)$/.exec(sourceCode);
  if (m) {
    const [, stem, digits] = m;
    return nextFreeCode(stem!, used, digits!.length, Number(digits) + 1);
  }
  return nextFreeCode(`${sourceCode}_`, used, 1, 2);
}

/** "434 OK, 0 NG, 0 blocked, 20 N/A" — NG and blocked are always stated, other zeros omitted. */
export function resultBreakdown(c: StatusCounts): string {
  const parts = [`${c.ok} ${RESULT_LABELS.ok}`];
  if (c.ok_cond) parts.push(`${c.ok_cond} ${RESULT_LABELS.ok_cond}`);
  parts.push(`${c.ng} ${RESULT_LABELS.ng}`, `${c.blocked} blocked`);
  if (c.na) parts.push(`${c.na} ${RESULT_LABELS.na}`);
  if (c.nt) parts.push(`${c.nt} ${RESULT_LABELS.nt}`);
  if (c.untested) parts.push(`${c.untested} untested`);
  return parts.join(', ');
}

/** `value` when it is one of `list`, else null (URL parameters). */
export function oneOf<T extends string>(list: readonly T[], value: string | null): T | null {
  return value !== null && (list as readonly string[]).includes(value) ? (value as T) : null;
}

/** Search of the plan list: doc no., title or a run code (needle already lower-case). */
export function planMatches(plan: PlanDTO, needle: string): boolean {
  if (!needle) return true;
  return (
    plan.docNo.toLowerCase().includes(needle) ||
    plan.title.toLowerCase().includes(needle) ||
    plan.runs.some((r) => r.code.toLowerCase().includes(needle))
  );
}

/** Number of plans per status. */
export function countByStatus(plans: readonly PlanDTO[]): Record<PlanStatus, number> {
  const counts = Object.fromEntries(PLAN_STATUSES.map((s) => [s, 0])) as Record<PlanStatus, number>;
  for (const p of plans) counts[p.status] += 1;
  return counts;
}

/** The template the server would pick by default: the plan's, else the project default. */
export function preferredTemplate(
  plan: Pick<PlanDTO, 'templateId'>,
  templates: TemplateDTO[],
): TemplateDTO | undefined {
  return (
    templates.find((t) => !t.builtIn && t.id === plan.templateId) ??
    templates.find((t) => t.isDefault) ??
    templates.find((t) => t.builtIn)
  );
}

/**
 * Options of the plan's report template: `0` = project default (named after it), then the uploaded
 * templates. A stored template stays selectable while the list is not loaded.
 */
export function templateOptions(
  templates: TemplateDTO[],
  storedTemplateId: number | null,
): { value: string; label: string }[] {
  const projectDefault = templates.find((t) => t.isDefault) ?? templates.find((t) => t.builtIn);
  const options = [
    {
      value: '0',
      label: projectDefault ? `Project default (${projectDefault.name})` : 'Project default',
    },
  ];
  for (const t of templates) if (!t.builtIn) options.push({ value: String(t.id), label: t.name });
  if (storedTemplateId && !options.some((o) => o.value === String(storedTemplateId)))
    options.push({ value: String(storedTemplateId), label: `Template #${storedTemplateId}` });
  return options;
}

export interface SectionOption {
  value: string;
  /** `code · name` or the name. */
  label: string;
  depth: number;
}

/** Sections of a suite tree in display order, with their depth (indentation in the picker). */
export function sectionOptions(nodes: SectionNode[]): SectionOption[] {
  const out: SectionOption[] = [];
  const walk = (list: SectionNode[], depth: number) => {
    for (const n of list) {
      out.push({ value: String(n.id), label: n.code ? `${n.code} · ${n.name}` : n.name, depth });
      walk(n.children, depth + 1);
    }
  };
  walk(nodes, 0);
  return out;
}

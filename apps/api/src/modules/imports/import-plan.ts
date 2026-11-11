/**
 * Excel/CSV import planning (api.md § Import, spec §7): turns a parsed sheet into a plan (sections,
 * cases to create/update/skip, new custom fields, environment template) that the preview shows and
 * the commit applies in one transaction.
 */
import type { Suite, TestCase } from '@tmt/database';
import {
  detectEnvBlock,
  detectLayout,
  isLibraryExport,
  LIBRARY_SECTION_SEPARATOR,
  parseImport,
  tableShape,
  type ParsedCase,
  type ParsedImport,
  type SourceWorkbook,
} from '@tmt/excel';
import {
  roleAtLeast,
  normalizeReferences,
  type CaseStatus,
  type FieldDef,
  type ImportLayout,
  type ImportPreviewCaseDTO,
  type ImportPreviewDTO,
  type ImportRunInput,
  type ImportTarget,
  type ImportWarningDTO,
  type ProjectRole,
} from '@tmt/shared';
import { forbidden, unprocessable } from '../../common/errors/app.exception.js';
import type { Db } from '../../prisma/prisma.service.js';
import { createStatus, loadReviewPolicy, reviewEnforced } from '../library/case-rules.js';
import { suitePrefixTaken } from '../library/library.errors.js';
import { envTemplateOf, fieldDefsOf } from '../library/library.mapper.js';
import { loadSectionTree, type SectionTree } from '../library/section-tree.js';

const MAX_FIELDS = 40;
const MAX_ENV_LABELS = 80;
const SAMPLE_SIZE = 100;

export interface ImportContext {
  projectId: number;
  role: ProjectRole;
  userId: number;
  fileName: string;
  wb: SourceWorkbook;
  body: ImportRunInput;
}

export interface PlannedSection {
  key: string;
  name: string;
  code: string | null;
  parentKey: string | null;
  /** Existing section, or null when the import creates it. */
  existingId: number | null;
}

export type CaseAction = 'create' | 'update' | 'skip';

export interface PlannedCase {
  parsed: ParsedCase;
  action: CaseAction;
  /** Code stored for created cases (renumbered with `onExisting: create_new`). */
  code: string | null;
  existing: TestCase | null;
}

export interface ImportPlan {
  suite: Suite | null;
  newSuite: { name: string; prefix: string } | null;
  parsed: ParsedImport;
  layout: ImportLayout;
  /** Field definitions after the import (existing + new). */
  fieldDefs: FieldDef[];
  newFields: FieldDef[];
  /** Environment template after the import, or null when unchanged. */
  envTemplate: string[] | null;
  rootSectionId: number | null;
  rootPath: string[];
  sections: PlannedSection[];
  cases: PlannedCase[];
  warnings: ImportWarningDTO[];
  mapped: Set<ImportTarget>;
  /** Status of created cases (`ready`, or `draft` under the review rules). */
  createStatus: CaseStatus;
  enforceReview: boolean;
}

const norm = (s: string) => s.trim().toLowerCase();

/** Case-insensitive key of a section path (also used to find a case's section when applying). */
export const pathKey = (path: readonly string[]) => path.map(norm).join('\u0001');

/** Sections the import uses: existing ones matched by name under the same parent, others new. */
export function planSections(
  tree: SectionTree | null,
  rootId: number | null,
  parsed: Pick<ParsedImport, 'sectionPaths'>,
): PlannedSection[] {
  const out = new Map<string, PlannedSection>();
  for (const p of parsed.sectionPaths) {
    let parentKey: string | null = null;
    let parentId: number | null = rootId;
    let parentExists = true;
    p.path.forEach((name, i) => {
      const key = pathKey(p.path.slice(0, i + 1));
      let entry = out.get(key);
      if (!entry) {
        const sibling =
          parentExists && tree
            ? (tree.childrenOf.get(parentId) ?? []).find((s) => norm(s.name) === norm(name))
            : undefined;
        entry = { key, name, code: p.codes[i] ?? null, parentKey, existingId: sibling?.id ?? null };
        out.set(key, entry);
      } else if (!entry.code && p.codes[i]) {
        entry.code = p.codes[i]!;
      }
      parentKey = key;
      parentExists = entry.existingId !== null;
      parentId = entry.existingId;
    });
  }
  return [...out.values()];
}

function fieldTypeFor(parsed: ParsedImport, key: string): FieldDef['type'] {
  return parsed.cases.some((c) => (c.custom[key] ?? '').includes('\n')) ? 'longtext' : 'text';
}

/** Renumbers `code` as `code-2`, `code-3` … avoiding `taken` (lower-case codes). */
export function renumber(code: string, taken: ReadonlySet<string>): string {
  for (let n = 2; ; n++) {
    const suffix = `-${n}`;
    const candidate = `${code.slice(0, 100 - suffix.length)}${suffix}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

/** Target suite: an existing suite of the project or a new one (lead only, free prefix). */
async function targetSuite(
  db: Db,
  ctx: ImportContext,
  lock: boolean,
): Promise<Pick<ImportPlan, 'suite' | 'newSuite'>> {
  const { body } = ctx;
  if (body.suiteId !== undefined) {
    if (lock) {
      await db.$queryRaw`SELECT id FROM suites
        WHERE id = ${body.suiteId} AND project_id = ${ctx.projectId} FOR UPDATE`;
    }
    const suite = await db.suite.findFirst({
      where: { id: body.suiteId, projectId: ctx.projectId },
    });
    if (!suite) throw unprocessable('BAD_SUITE', 'The suite does not belong to this project');
    return { suite, newSuite: null };
  }
  if (!body.newSuite) return { suite: null, newSuite: null };
  if (!roleAtLeast(ctx.role, 'lead')) {
    throw forbidden('Creating a suite needs the lead role — import into an existing suite');
  }
  const taken = await db.suite.findFirst({
    where: { projectId: ctx.projectId, prefix: body.newSuite.prefix },
    select: { id: true },
  });
  if (taken) throw suitePrefixTaken(body.newSuite.prefix);
  return { suite: null, newSuite: body.newSuite };
}

/** Labels of the sheet's environment block merged into the suite's template (null = unchanged). */
function mergedEnvTemplate(
  ctx: ImportContext,
  suite: Suite | null,
  headerRow: number,
): string[] | null {
  if (!ctx.body.options.saveEnvTemplate) return null;
  const block = detectEnvBlock(ctx.wb.grid(ctx.body.sheet), headerRow);
  if (!block) return null;
  const current = suite ? envTemplateOf(suite) : [];
  const seen = new Set(current.map((l) => l.toLowerCase()));
  const merged = [...current];
  for (const raw of block.labels) {
    const label = raw.trim().slice(0, 100);
    if (label && !seen.has(label.toLowerCase()) && merged.length < MAX_ENV_LABELS) {
      seen.add(label.toLowerCase());
      merged.push(label);
    }
  }
  return merged.length !== current.length ? merged : null;
}

/** Live cases of the suite with a code, by lower-case code (exact spelling preferred). */
async function existingByCode(db: Db, suite: Suite | null): Promise<Map<string, TestCase>> {
  const out = new Map<string, TestCase>();
  if (!suite) return out;
  const rows = await db.testCase.findMany({
    where: { suiteId: suite.id, isDeleted: false, code: { not: null } },
  });
  for (const r of rows) {
    const k = r.code!.toLowerCase();
    // Prefer an exact match when codes differ only in case.
    if (!out.has(k) || out.get(k)!.code !== r.code) out.set(k, r);
  }
  return out;
}

/** Create / update / skip per parsed case against live cases with the same code. */
function planCases(
  parsed: ParsedImport,
  existing: Map<string, TestCase>,
  onExisting: ImportRunInput['options']['onExisting'],
): { cases: PlannedCase[]; existingRows: number[] } {
  const taken = new Set([
    ...existing.keys(),
    ...parsed.cases.flatMap((c) => (c.code ? [c.code.toLowerCase()] : [])),
  ]);
  const existingRows: number[] = [];
  const cases = parsed.cases.map((p): PlannedCase => {
    const match = p.code ? (existing.get(p.code.toLowerCase()) ?? null) : null;
    if (!match) return { parsed: p, action: 'create', code: p.code, existing: null };
    existingRows.push(p.row);
    if (onExisting === 'update') {
      return { parsed: p, action: 'update', code: match.code, existing: match };
    }
    if (onExisting === 'skip') return { parsed: p, action: 'skip', code: p.code, existing: match };
    const code = renumber(p.code!, taken);
    taken.add(code.toLowerCase());
    return { parsed: p, action: 'create', code, existing: null };
  });
  return { cases, existingRows };
}

const EXISTING_EFFECT = {
  update: 'the existing case is updated',
  skip: 'the row is skipped',
  create_new: 'a new case with a renumbered code is created',
} as const;

/**
 * Builds the import plan. Inside the commit transaction (`lock`), the target suite row is locked
 * so the plan cannot go stale before it is applied.
 */
export async function planImport(db: Db, ctx: ImportContext, lock = false): Promise<ImportPlan> {
  const { body, wb } = ctx;
  if (!wb.hasSheet(body.sheet)) {
    throw unprocessable('SHEET_NOT_FOUND', `Sheet "${body.sheet}" was not found in the file`);
  }
  const { suite, newSuite } = await targetSuite(db, ctx, lock);
  const existingDefs = suite ? fieldDefsOf(suite) : [];

  for (const m of body.columns) {
    if (m.target === 'custom' && !existingDefs.some((d) => d.key === m.customKey)) {
      throw unprocessable(
        'UNKNOWN_FIELD',
        `Column ${m.col} is mapped to an unknown field “${m.customKey ?? ''}” of the suite`,
      );
    }
  }
  const mapped = new Set(body.columns.map((m) => m.target));

  // Section the imported cases go under.
  const tree = suite ? await loadSectionTree(db, suite.id) : null;
  const rootSectionId = body.options.parentSectionId ?? null;
  if (rootSectionId !== null && !tree?.byId.has(rootSectionId)) {
    throw unprocessable('BAD_SECTION', 'The parent section does not belong to this suite');
  }

  const headers = tableShape(wb.grid(body.sheet), body.headerRow)
    .columns.map((c) => c.header)
    .filter((h) => h !== '');
  const parsed = parseImport(wb, {
    sheet: body.sheet,
    headerRow: body.headerRow,
    columns: body.columns,
    fieldDefs: existingDefs,
    onDuplicateInFile: body.options.onDuplicateInFile,
    // Our own library export writes nested sections as "A > B".
    sectionSeparator: isLibraryExport(headers) ? LIBRARY_SECTION_SEPARATOR : undefined,
  });

  // Custom fields: new ones appended, select options enforced.
  const newFields: FieldDef[] = parsed.newFields.map((f) => ({
    key: f.key,
    label: f.label,
    type: fieldTypeFor(parsed, f.key),
    showInTable: false,
  }));
  const fieldDefs = [...existingDefs, ...newFields];
  if (fieldDefs.length > MAX_FIELDS) {
    throw unprocessable(
      'TOO_MANY_FIELDS',
      `A suite can have at most ${MAX_FIELDS} custom fields — the import would add ${newFields.length}`,
    );
  }
  for (const c of parsed.cases) {
    for (const def of existingDefs) {
      const v = c.custom[def.key];
      if (v && def.type === 'select' && def.options?.length && !def.options.includes(v.trim())) {
        throw unprocessable(
          'INVALID_OPTION',
          `Row ${c.row}: “${v.slice(0, 60)}” is not an option of ${def.label}`,
          { row: c.row, field: def.key, value: v },
        );
      }
    }
  }

  const { cases, existingRows } = planCases(
    parsed,
    await existingByCode(db, suite),
    body.options.onExisting,
  );
  const warnings = [...parsed.warnings];
  if (existingRows.length > 0) {
    warnings.push({
      kind: 'existing_code',
      message: `Case code already exists in the suite — ${EXISTING_EFFECT[body.options.onExisting]}`,
      count: existingRows.length,
      rows: existingRows.slice(0, 50),
    });
  }

  const policy = await loadReviewPolicy(db, ctx.projectId, ctx.role);
  return {
    suite,
    newSuite,
    parsed,
    layout: detectLayout(headers),
    fieldDefs,
    newFields,
    envTemplate: mergedEnvTemplate(ctx, suite, body.headerRow),
    rootSectionId,
    rootPath: tree && rootSectionId !== null ? tree.pathOf(rootSectionId) : [],
    sections: planSections(tree, rootSectionId, parsed),
    cases,
    warnings,
    mapped,
    createStatus: createStatus('ready', policy),
    enforceReview: reviewEnforced(policy),
  };
}

/** What the preview shows: counts, new fields, warnings and the first 100 rows. */
export function previewOf(plan: ImportPlan): ImportPreviewDTO {
  const count = (a: CaseAction) => plan.cases.filter((c) => c.action === a).length;
  return {
    counts: {
      cases: plan.cases.length,
      create: count('create'),
      update: count('update'),
      skip: count('skip'),
      sections: plan.sections.length,
      newSections: plan.sections.filter((s) => s.existingId === null).length,
      newFields: plan.newFields.length,
    },
    newFields: plan.newFields.map((f) => ({ key: f.key, label: f.label })),
    warnings: plan.warnings,
    sample: plan.cases.slice(0, SAMPLE_SIZE).map((c): ImportPreviewCaseDTO => ({
      row: c.parsed.row,
      sectionPath: [...plan.rootPath, ...c.parsed.sectionPath],
      code: c.code,
      title: c.parsed.title,
      caseType: c.parsed.caseType,
      priority: c.parsed.priority,
      tags: c.parsed.tags,
      estimateMinutes: c.parsed.estimateMinutes,
      references: normalizeReferences(c.parsed.references),
      precondition: c.parsed.precondition,
      procedure: c.parsed.procedure,
      expected: c.parsed.expected,
      remark: c.parsed.remark,
      summaryGroup: c.parsed.summaryGroup,
      custom: c.parsed.custom,
      action: c.action,
    })),
  };
}

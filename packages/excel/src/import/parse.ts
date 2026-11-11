import {
  normalizeLine,
  normalizeText,
  slugKey,
  uniqueKey,
  type CasePriority,
  type CaseType,
  type ColumnMapping,
  type FieldDef,
  type ImportTarget,
  type ImportWarningDTO,
} from '@tmt/shared';
import { tableShape } from './detect';
import { columnLetter, type Grid, type MergeRange } from './grid';
import { canon } from './synonyms';
import { parseEstimate, parsePriority, parseTags } from './values';
import type { SourceWorkbook } from './workbook';
import { MAX_IMPORT_COLS, MAX_IMPORT_ROWS } from './workbook';

export interface ParseOptions {
  sheet: string;
  /** 1-based header row. */
  headerRow: number;
  columns: ColumnMapping[];
  /** Custom fields that already exist in the target suite. */
  fieldDefs: FieldDef[];
  onDuplicateInFile: 'renumber' | 'keep_first';
  /** Split section column values into levels (TMT's library export writes "A > B"). */
  sectionSeparator?: string;
}

export interface ParsedCase {
  /** Sheet row the case came from (1-based). */
  row: number;
  sectionPath: string[];
  code: string | null;
  title: string;
  caseType: CaseType;
  /** `medium` when the column is not mapped, empty or unknown (warning). */
  priority: CasePriority;
  tags: string[];
  estimateMinutes: number | null;
  references: string | null;
  precondition: string | null;
  procedure: string | null;
  expected: string | null;
  remark: string | null;
  summaryGroup: string | null;
  /** Values by field key — existing fields and the ones in `newFields`. */
  custom: Record<string, string>;
}

export interface ParsedSectionPath {
  path: string[];
  /** Section code per path level (null when none), e.g. `GRP_01_002`. */
  codes: (string | null)[];
}

export interface NewFieldSpec {
  key: string;
  label: string;
  /** Source column (1-based). */
  col: number;
}

export interface ParsedImport {
  sheet: string;
  headerRow: number;
  dataStart: number;
  lastDataRow: number;
  /** Every section path used (ancestors included), in first-seen order. */
  sectionPaths: ParsedSectionPath[];
  cases: ParsedCase[];
  newFields: NewFieldSpec[];
  /** Every custom-field column of the mapping with the field key it writes (existing or new). */
  customColumns: NewFieldSpec[];
  warnings: ImportWarningDTO[];
}

export const IMPORT_LIMITS = {
  title: 500,
  code: 100,
  section: 300,
  summaryGroup: 200,
  text: 20_000,
  references: 500,
  /** Characters per tag and tags per case (same as the case schema). */
  tag: 50,
  tags: 30,
} as const;

const WARNING_ROWS_CAP = 50;

class WarningCollector {
  private readonly items = new Map<string, ImportWarningDTO>();

  add(kind: ImportWarningDTO['kind'], message: string, row?: number): void {
    const k = `${kind}\u0001${message}`;
    let w = this.items.get(k);
    if (!w) {
      w = { kind, message, count: 0, rows: [] };
      this.items.set(k, w);
    }
    w.count++;
    if (row !== undefined && w.rows.length < WARNING_ROWS_CAP) w.rows.push(row);
  }

  push(w: ImportWarningDTO): void {
    this.items.set(`${w.kind}\u0001${w.message}`, w);
  }

  list(): ImportWarningDTO[] {
    return [...this.items.values()];
  }
}

interface RowSection {
  name: string;
  code: string | null;
}

/**
 * Turns one sheet into test cases according to the column mapping (spec §7.6–§7.8). Pure: no I/O,
 * no database — the import service decides what to create/update.
 */
export function parseImport(wb: SourceWorkbook, opts: ParseOptions): ParsedImport {
  const grid = wb.grid(opts.sheet);
  return parseGrid(grid, opts);
}

/** Same as {@link parseImport} on an already built grid. */
export function parseGrid(grid: Grid, opts: ParseOptions): ParsedImport {
  const warnings = new WarningCollector();
  const shape = tableShape(grid, opts.headerRow);
  if (grid.truncated) {
    warnings.add(
      'truncated',
      `The sheet is larger than ${MAX_IMPORT_ROWS.toLocaleString('en-US')} rows or ${MAX_IMPORT_COLS} columns — only that part was read`,
    );
  }

  const mapped = opts.columns.filter((c) => c.target !== 'ignore');
  const colsFor = (t: ImportTarget) =>
    mapped
      .filter((c) => c.target === t)
      .map((c) => c.col)
      .sort((a, b) => a - b);

  const sectionCols = colsFor('section');
  const sectionCodeCol = colsFor('section_code')[0] ?? null;
  const codeCols = colsFor('code');
  const titleCols = colsFor('title');
  const typeCols = colsFor('type');
  const preCols = colsFor('precondition');
  const procCols = colsFor('procedure');
  const expCols = colsFor('expected');
  const remarkCols = colsFor('remark');
  const summaryCols = colsFor('summary_group');
  const priorityCols = colsFor('priority');
  const tagCols = colsFor('tags');
  const estimateCols = colsFor('estimate');
  const referenceCols = colsFor('references');

  // Custom fields: existing ones by key, new ones created from the header text.
  const headerOf = (col: number) =>
    shape.columns.find((c) => c.col === col)?.header ??
    normalizeLine(grid.text(opts.headerRow, col)) ??
    '';
  const existingKeys = new Set(opts.fieldDefs.map((f) => f.key));
  const newFields: NewFieldSpec[] = [];
  const customCols: { col: number; key: string; label: string }[] = [];
  for (const m of mapped) {
    if (m.target !== 'custom' && m.target !== 'new_custom') continue;
    if (m.target === 'custom' && m.customKey && existingKeys.has(m.customKey)) {
      const def = opts.fieldDefs.find((f) => f.key === m.customKey)!;
      customCols.push({ col: m.col, key: def.key, label: def.label });
      continue;
    }
    const label = (
      m.newFieldLabel?.trim() ||
      headerOf(m.col) ||
      `Column ${columnLetter(m.col)}`
    ).slice(0, 100);
    const same = opts.fieldDefs.find((f) => canon(f.label) === canon(label));
    if (same) {
      customCols.push({ col: m.col, key: same.key, label: same.label });
      continue;
    }
    const key = uniqueKey(slugKey(label), [...existingKeys, ...newFields.map((f) => f.key)]);
    newFields.push({ key, label, col: m.col });
    customCols.push({ col: m.col, key, label });
  }

  // Table extent for detecting full-width section rows.
  const spanOf = (col: number) => {
    const m = grid.merge(opts.headerRow, col);
    return m && m.left === col ? m.right - m.left + 1 : 1;
  };
  const allCols = opts.columns.map((c) => c.col);
  const tableLeft = allCols.length ? Math.min(...allCols) : shape.firstCol;
  const tableRight = allCols.length
    ? Math.max(...opts.columns.map((c) => c.col + spanOf(c.col) - 1))
    : shape.lastCol;
  const tableWidth = tableRight - tableLeft + 1;
  const wideMin = Math.max(2, Math.ceil(tableWidth * 0.5));

  const textOf = (r: number, cols: number[], joiner = '\n'): string | null => {
    const parts: string[] = [];
    for (const c of cols) {
      const t = normalizeText(grid.text(r, c));
      if (t) parts.push(t);
    }
    return parts.length ? parts.join(joiner) : null;
  };
  const lineOf = (r: number, cols: number[], joiner = ' '): string | null => {
    const parts: string[] = [];
    for (const c of cols) {
      const t = normalizeLine(grid.text(r, c));
      if (t) parts.push(t);
    }
    return parts.length ? parts.join(joiner) : null;
  };
  /** First non-empty value of the columns (single-value targets mapped more than once). */
  const firstOf = (r: number, cols: number[]): string | null => {
    for (const c of cols) {
      const t = normalizeLine(grid.text(r, c));
      if (t) return t;
    }
    return null;
  };
  const clip = (value: string | null, limit: number, field: string, r: number): string | null => {
    if (value !== null && value.length > limit) {
      warnings.add(
        'truncated',
        `${field} longer than ${limit.toLocaleString('en-US')} characters was cut`,
        r,
      );
      return value.slice(0, limit);
    }
    return value;
  };

  const wideMergeAt = (r: number): MergeRange | null => {
    let best: MergeRange | null = null;
    for (let c = tableLeft; c <= tableRight; c++) {
      const m = grid.merge(r, c);
      if (!m || m.left !== c || m.right - m.left + 1 < wideMin) continue;
      if (!best || m.right - m.left > best.right - best.left) best = m;
    }
    return best;
  };

  const sectionMap = new Map<string, ParsedSectionPath>();
  const registerPath = (path: string[], codes: (string | null)[]) => {
    for (let i = 1; i <= path.length; i++) {
      const sub = path.slice(0, i);
      const k = sub.join('\u0001');
      const existing = sectionMap.get(k);
      if (!existing) {
        sectionMap.set(k, { path: sub, codes: codes.slice(0, i).map((c) => c ?? null) });
      } else if (codes[i - 1] && !existing.codes[i - 1]) {
        existing.codes[i - 1] = codes[i - 1]!;
      }
    }
  };

  let rowSections: RowSection[] = [];
  const prevColSection = new Map<number, string>();
  const cases: ParsedCase[] = [];
  const seenCodes = new Set<string>();
  const renamed: { from: string; to: string; row: number }[] = [];
  const skippedDuplicates: { code: string; row: number }[] = [];
  let last: ParsedCase | null = null;

  for (let r = shape.dataStart; r <= shape.lastDataRow; r++) {
    // 1) Full-width section rows ("Normal Case", then "GRP_01_001 | <group name>").
    const wide = wideMergeAt(r);
    if (wide && wide.top < r) continue; // second line of a multi-row section header
    if (wide) {
      const name = clip(
        normalizeLine(grid.text(wide.top, wide.left)),
        IMPORT_LIMITS.section,
        'Section name',
        r,
      );
      if (name) {
        const code =
          sectionCodeCol !== null && (sectionCodeCol < wide.left || sectionCodeCol > wide.right)
            ? normalizeLine(grid.text(r, sectionCodeCol))
            : null;
        const section = { name, code: code ? code.slice(0, IMPORT_LIMITS.code) : null };
        rowSections =
          wide.left <= tableLeft || rowSections.length === 0
            ? [section]
            : [rowSections[0]!, section];
        registerPath(
          rowSections.map((s) => s.name),
          rowSections.map((s) => s.code),
        );
      }
      continue;
    }

    const title = lineOf(r, titleCols);
    const code = lineOf(r, codeCols);
    const precondition = textOf(r, preCols);
    const procedure = textOf(r, procCols);
    const expected = textOf(r, expCols);
    const remark = textOf(r, remarkCols);
    const summaryGroup = lineOf(r, summaryCols);
    const typeRaw = lineOf(r, typeCols);
    const priorityRaw = firstOf(r, priorityCols);
    const tagsRaw = textOf(r, tagCols);
    const estimateRaw = firstOf(r, estimateCols);
    const referencesRaw = lineOf(r, referenceCols, ', ');
    const customValues: Record<string, string> = {};
    for (const cc of customCols) {
      const v = normalizeText(grid.text(r, cc.col));
      if (v) customValues[cc.key] = v;
    }
    const hasCustom = Object.keys(customValues).length > 0;
    const hasCaseValues = Boolean(priorityRaw || tagsRaw || estimateRaw || referencesRaw);

    // 2) Rows without title/code.
    if (!title && !code) {
      if (precondition || procedure || expected || remark) {
        if (last) {
          last.precondition = appendText(last.precondition, precondition);
          last.procedure = appendText(last.procedure, procedure);
          last.expected = appendText(last.expected, expected);
          last.remark = appendText(last.remark, remark);
          warnings.add(
            'continuation_row',
            'Row has no title or code — its text was added to the case above',
            r,
          );
        } else {
          warnings.add(
            'continuation_row',
            'Row has no title or code and there is no case above — skipped',
            r,
          );
        }
        continue;
      }
      // A row holding only a section value acts as a section header for the rows below it.
      if (!summaryGroup && !typeRaw && !hasCustom && !hasCaseValues) {
        for (const c of sectionCols) {
          const v = normalizeLine(grid.text(r, c));
          if (v) prevColSection.set(c, v.slice(0, IMPORT_LIMITS.section));
        }
      }
      continue;
    }

    // 3) Case row: section path from section rows + section columns.
    const colSections: string[] = [];
    for (const c of sectionCols) {
      let v = normalizeLine(grid.text(r, c));
      if (!v) {
        const m = grid.merge(r, c);
        if (m && m.bottom > m.top && !normalizeLine(grid.text(m.top, m.left))) {
          v = `Unnamed section (row ${m.top})`;
          warnings.add(
            'section_filled_down',
            `Merged section cell is empty — cases were put in “${v}”; rename it after the import`,
            r,
          );
        } else if (prevColSection.has(c)) {
          v = prevColSection.get(c)!;
          warnings.add(
            'section_filled_down',
            'Empty section cell — the case was put in the section above',
            r,
          );
        }
      }
      if (v) {
        prevColSection.set(c, v);
        const levels = opts.sectionSeparator
          ? v
              .split(opts.sectionSeparator)
              .map((s) => s.trim())
              .filter(Boolean)
          : [v];
        for (const level of levels) colSections.push(level.slice(0, IMPORT_LIMITS.section));
      }
    }
    const colSectionCode =
      sectionCodeCol !== null && colSections.length > 0
        ? normalizeLine(grid.text(r, sectionCodeCol))
        : null;
    const sectionPath = [...rowSections.map((s) => s.name), ...colSections];
    const sectionCodes = [
      ...rowSections.map((s) => s.code),
      ...colSections.map((_, i) => (i === colSections.length - 1 ? colSectionCode : null)),
    ];
    if (sectionPath.length) registerPath(sectionPath, sectionCodes);

    // Title / code.
    let caseTitle = title;
    let caseCode = code ? code.slice(0, IMPORT_LIMITS.code) : null;
    if (!caseTitle) {
      caseTitle = caseCode!;
      warnings.add('empty_title', 'Title is empty — the case code was used as the title', r);
    }
    caseTitle = clip(caseTitle, IMPORT_LIMITS.title, 'Title', r)!;

    if (caseCode) {
      const k = caseCode.toLowerCase();
      if (seenCodes.has(k)) {
        if (opts.onDuplicateInFile === 'keep_first') {
          skippedDuplicates.push({ code: caseCode, row: r });
          continue;
        }
        let n = 2;
        let candidate = `${caseCode}-${n}`;
        while (seenCodes.has(candidate.toLowerCase())) candidate = `${caseCode}-${++n}`;
        renamed.push({ from: caseCode, to: candidate, row: r });
        caseCode = candidate;
      }
      seenCodes.add(caseCode.toLowerCase());
    }

    // Type.
    let caseType: CaseType = 'Normal';
    if (typeCols.length > 0) {
      if (!typeRaw) warnings.add('type_defaulted', 'Type is empty — set to Normal', r);
      else if (/^abnormal/i.test(typeRaw)) caseType = 'Abnormal';
      else if (!/^normal/i.test(typeRaw)) {
        warnings.add('unknown_type', `Unknown type “${typeRaw.slice(0, 40)}” — set to Normal`, r);
      }
    }

    for (const key of Object.keys(customValues)) {
      customValues[key] = clip(customValues[key]!, IMPORT_LIMITS.text, 'Custom field', r)!;
    }

    // v1.1 values.
    let priority: CasePriority = 'medium';
    if (priorityRaw) {
      const p = parsePriority(priorityRaw);
      if (p) priority = p;
      else {
        warnings.add(
          'unknown_priority',
          `Unknown priority “${priorityRaw.slice(0, 40)}” — set to Medium`,
          r,
        );
      }
    }
    let tags = parseTags(tagsRaw);
    if (tags.some((tag) => tag.length > IMPORT_LIMITS.tag)) {
      warnings.add('truncated', `Tags longer than ${IMPORT_LIMITS.tag} characters were cut`, r);
      tags = parseTags(tags.map((tag) => tag.slice(0, IMPORT_LIMITS.tag).trim()).join('\n'));
    }
    if (tags.length > IMPORT_LIMITS.tags) {
      warnings.add('truncated', `Only the first ${IMPORT_LIMITS.tags} tags of a case are kept`, r);
      tags = tags.slice(0, IMPORT_LIMITS.tags);
    }
    let estimateMinutes: number | null = null;
    if (estimateRaw) {
      estimateMinutes = parseEstimate(estimateRaw);
      if (estimateMinutes === null) {
        warnings.add(
          'unknown_estimate',
          `Unknown estimate “${estimateRaw.slice(0, 40)}” — left empty (use minutes, 1h 30m or 1:30)`,
          r,
        );
      }
    }

    const parsed: ParsedCase = {
      row: r,
      sectionPath,
      code: caseCode,
      title: caseTitle,
      caseType,
      priority,
      tags,
      estimateMinutes,
      references: clip(referencesRaw, IMPORT_LIMITS.references, 'References', r),
      precondition: clip(precondition, IMPORT_LIMITS.text, 'Precondition', r),
      procedure: clip(procedure, IMPORT_LIMITS.text, 'Procedure', r),
      expected: clip(expected, IMPORT_LIMITS.text, 'Expected result', r),
      remark: clip(remark, IMPORT_LIMITS.text, 'Remark', r),
      summaryGroup: clip(summaryGroup, IMPORT_LIMITS.summaryGroup, 'Summary group', r),
      custom: customValues,
    };
    cases.push(parsed);
    last = parsed;
  }

  if (renamed.length > 0) {
    warnings.push({
      kind: 'duplicate_code_in_file',
      message: `Duplicate case codes in the file were renamed: ${examples(renamed.map((x) => `${x.from} → ${x.to}`))}`,
      count: renamed.length,
      rows: renamed.slice(0, WARNING_ROWS_CAP).map((x) => x.row),
    });
  }
  if (skippedDuplicates.length > 0) {
    warnings.push({
      kind: 'duplicate_code_in_file',
      message: `Rows repeating an earlier case code were skipped: ${examples(skippedDuplicates.map((x) => x.code))}`,
      count: skippedDuplicates.length,
      rows: skippedDuplicates.slice(0, WARNING_ROWS_CAP).map((x) => x.row),
    });
  }

  return {
    sheet: opts.sheet,
    headerRow: opts.headerRow,
    dataStart: shape.dataStart,
    lastDataRow: shape.lastDataRow,
    sectionPaths: [...sectionMap.values()],
    cases,
    newFields,
    customColumns: customCols.map((c) => ({ key: c.key, label: c.label, col: c.col })),
    warnings: warnings.list(),
  };
}

function appendText(base: string | null, extra: string | null): string | null {
  if (!extra) return base;
  if (!base) return extra;
  return `${base}\n${extra}`;
}

function examples(items: string[], max = 5): string {
  const shown = items.slice(0, max).join(', ');
  return items.length > max ? `${shown} and ${items.length - max} more` : shown;
}

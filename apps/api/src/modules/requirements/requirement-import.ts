/**
 * Excel / CSV import of requirements: header suggestions and a row-by-row plan of what the import
 * would create, update or skip. Pure — the service reads the grid and writes the result.
 */
import type { Grid } from '@tmt/excel';
import {
  normalizeReference,
  type RequirementField,
  type RequirementImportRowDTO,
  type RequirementImportInput,
} from '@tmt/shared';

const HEADER_HINTS: Record<RequirementField, RegExp> = {
  key: /^(req|req(uirement)?s?[\s._-]*(id|no\.?|number|#|key|code)|id|key|no\.?|#|ref(erence)?[\s._-]*(id|no\.?)|jira([\s._-]*(key|id))?|issue[\s._-]*(key|id)|item)$/i,
  title:
    /^(title|summary|name|requirements?|requirement[\s._-]*(title|name|summary)|subject|feature)$/i,
  description:
    /^(description|detail(s)?|text|specification|spec|content|requirement[\s._-]*(text|description|detail(s)?))$/i,
  sourceRef:
    /^(source([\s._-]*(doc(ument)?s?|ref(erence)?))?|documents?|docs?|reference|ref|spec[\s._-]*(ref|section)|origin|section|page)$/i,
};

/** The field a column header looks like (first matching field in priority order), or null. */
export function suggestField(header: string): RequirementField | null {
  const text = header.trim();
  if (!text) return null;
  for (const field of ['key', 'title', 'description', 'sourceRef'] as const) {
    if (HEADER_HINTS[field].test(text)) return field;
  }
  return null;
}

/** One field per column: when two headers look alike the first column keeps the suggestion. */
export function suggestFields<T extends { header: string }>(
  columns: readonly T[],
): (RequirementField | null)[] {
  const taken = new Set<RequirementField>();
  return columns.map((c) => {
    const f = suggestField(c.header);
    if (!f || taken.has(f)) return null;
    taken.add(f);
    return f;
  });
}

export const MAX_KEY = 100;
export const MAX_TITLE = 500;
export const MAX_DESCRIPTION = 8000;
export const MAX_SOURCE_REF = 500;
/** Rows listed in the preview. */
export const PREVIEW_ROWS = 25;

export interface PlannedRequirement extends RequirementImportRowDTO {
  description: string | null;
  sourceRef: string | null;
}

export interface RequirementImportPlan {
  rows: PlannedRequirement[];
  truncated: boolean;
}

/**
 * Plans every data row under the header row. Blank rows are ignored; a row without a key or a
 * title is invalid; a key repeated in the file is skipped after its first row; an existing key is
 * updated or skipped as `onExisting` says. `existing` holds lower-case keys.
 */
export function planRequirementImport(
  grid: Pick<Grid, 'text' | 'rowCount' | 'truncated'>,
  input: Pick<RequirementImportInput, 'headerRow' | 'mapping' | 'onExisting'>,
  existing: ReadonlySet<string>,
  /** Existing keys whose text comes from Jira: never overwritten by an import. */
  locked: ReadonlySet<string> = new Set(),
): RequirementImportPlan {
  const { mapping } = input;
  const cell = (r: number, col: number | null | undefined) =>
    col ? grid.text(r, col).replace(/\r\n?/g, '\n').trim() : '';
  const seen = new Map<string, number>();
  const rows: PlannedRequirement[] = [];
  for (let r = input.headerRow + 1; r <= grid.rowCount; r++) {
    const rawKey = cell(r, mapping.key).replace(/\s+/g, ' ');
    const title = cell(r, mapping.title).replace(/\s+/g, ' ');
    if (!rawKey && !title) continue;
    const key = rawKey ? normalizeReference(rawKey) : '';
    const description = cell(r, mapping.description) || null;
    const sourceRef = cell(r, mapping.sourceRef).replace(/\s+/g, ' ') || null;
    const base = { row: r, key, title, description, sourceRef };
    const invalid = (reason: string): PlannedRequirement => ({
      ...base,
      action: 'invalid',
      reason,
    });
    if (!key) rows.push(invalid('No requirement ID'));
    else if (key.length > MAX_KEY) rows.push(invalid(`ID is longer than ${MAX_KEY} characters`));
    else if (!title) rows.push(invalid('No title'));
    else if (title.length > MAX_TITLE)
      rows.push(invalid(`Title is longer than ${MAX_TITLE} characters`));
    else if ((description?.length ?? 0) > MAX_DESCRIPTION)
      rows.push(invalid(`Description is longer than ${MAX_DESCRIPTION} characters`));
    else if ((sourceRef?.length ?? 0) > MAX_SOURCE_REF)
      rows.push(invalid(`Source is longer than ${MAX_SOURCE_REF} characters`));
    else {
      const k = key.toLowerCase();
      const first = seen.get(k);
      if (first !== undefined) {
        rows.push({ ...base, action: 'skip', reason: `Same ID as row ${first}` });
      } else {
        seen.set(k, r);
        if (!existing.has(k)) rows.push({ ...base, action: 'create', reason: null });
        else if (locked.has(k))
          rows.push({ ...base, action: 'skip', reason: 'Comes from Jira — refresh it there' });
        else if (input.onExisting === 'update')
          rows.push({ ...base, action: 'update', reason: 'ID exists — text is updated' });
        else rows.push({ ...base, action: 'skip', reason: 'ID exists — left as it is' });
      }
    }
  }
  return { rows, truncated: grid.truncated };
}

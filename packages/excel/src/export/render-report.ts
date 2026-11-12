import { TemplateError } from './errors';
import { fillSheetXml, type FillContext, type FillEnv } from './fill-sheet';
import { OoxmlPackage, resolveTarget, WorkbookModel, type SheetEntry } from './package';
import { RowMap, shiftFormula } from './refs';
import {
  caseTableItem,
  runContext,
  runTableItem,
  workbookContext,
  workbookTables,
  type ReportData,
  type ReportRun,
  type TableItem,
} from './report-data';
import { cloneSheet, refersToSheet, removeSheet, shiftSheetParts } from './sheet-parts';
import { sanitizeSheetName } from './sheet-name';
import { StyleBook } from './styles';
import {
  escapeXml,
  findElement,
  getAttr,
  openTagAttrs,
  setAttr,
  stringItemText,
  unescapeXml,
  withOpenTagAttrs,
} from './xml';

export interface RenderOptions {
  /** Sheet cloned once per run (renamed to the run code); null/empty → no per-run sheets. */
  runSheet?: string | null;
}

/**
 * Fills a report template (the team's controlled form with `${…}` placeholders) — spec §8.
 *
 * In-house OOXML engine (ADR-002 fallback, see `.10x/reviews/2026-10-23-export-spike.md`): the
 * template package is edited in place, so styles, merges, column widths, pictures, print setup,
 * data validations, conditional formats, hidden sheets and everything else that is not a
 * placeholder stay exactly as in the template. The run sheet is copied per run right where it
 * stands, then removed.
 */
export async function renderReport(
  template: Buffer,
  opts: RenderOptions,
  data: ReportData,
): Promise<Buffer> {
  const pkg = await OoxmlPackage.load(template);
  const book = await WorkbookModel.read(pkg);
  const env: FillEnv = {
    sst: await readSharedStrings(pkg, book),
    styles: StyleBook.parse(await partText(pkg, book, 'styles')),
    date1904: /<workbookPr\b[^>]*\bdate1904="(1|true)"/.test(await pkg.requireText(book.path)),
  };

  const runName = opts.runSheet?.trim() || null;
  const runTemplate = runName ? book.sheetByName(runName) : undefined;
  if (runName && !runTemplate) {
    throw new TemplateError('RUN_SHEET_NOT_FOUND', `The template has no sheet named "${runName}"`);
  }
  const activeBefore = book.activeSheet();
  const runsTable = data.runs.map(runTableItem);
  const shared = { ...workbookTables(data), runs: runsTable };

  // 1) Copy the pristine run sheet once per run, in run order, right after the template sheet.
  const runSheets: { entry: SheetEntry; run: ReportRun }[] = [];
  if (runTemplate && data.runs.length > 0) {
    const taken = book.sheets.map((s) => s.name);
    let after = runTemplate;
    for (const run of data.runs) {
      const name = sanitizeSheetName(run.code, taken);
      taken.push(name);
      after = await cloneSheet(pkg, book, runTemplate, name, after);
      runSheets.push({ entry: after, run });
    }
  }

  // 2) Fill every sheet with its values.
  // Iterate a snapshot: filling may add or remove sheets.
  for (const sheet of book.sheets.slice()) {
    if (sheet === runTemplate && runSheets.length > 0) continue;
    const runSheet = runSheets.find((r) => r.entry === sheet);
    let ctx: FillContext;
    if (runSheet) ctx = runFill(data, runSheet.run, shared);
    else if (sheet === runTemplate) ctx = emptyRunFill(data, shared);
    else ctx = { scalars: workbookContext(data), tables: shared };
    const xml = await pkg.requireText(sheet.part);
    const res = fillSheetXml(xml, ctx, env);
    if (res.xml !== xml) pkg.setText(sheet.part, res.xml);
    await shiftSheetParts(pkg, sheet, res.rowMap);
    shiftNames(book, sheet, res.rowMap);
  }

  // 3) The template run sheet is not part of the report.
  if (runTemplate && runSheets.length > 0) await removeSheet(pkg, book, runTemplate);

  // 4) One selected tab, recalculation on open, no stale calc chain.
  let active =
    activeBefore && book.sheets.includes(activeBefore)
      ? activeBefore
      : (runSheets[0]?.entry ?? book.sheets[0]!);
  if (active.state !== 'visible') active = book.sheets.find((s) => s.state === 'visible') ?? active;
  for (const sheet of book.sheets) await setTabSelected(pkg, sheet, sheet === active);
  await removeCalcChain(pkg, book);
  book.write(pkg, { activeSheet: active, fullCalcOnLoad: true });
  return pkg.generate();
}

function runFill(
  data: ReportData,
  run: ReportRun,
  shared: Record<string, TableItem[]>,
): FillContext {
  return {
    scalars: runContext(data, run),
    tables: {
      ...shared,
      cases: run.cases.map(caseTableItem),
      envList: run.envList.map((e) => ({ label: e.label, value: e.value })),
    },
  };
}

function emptyRunFill(data: ReportData, shared: Record<string, TableItem[]>): FillContext {
  return {
    scalars: { ...workbookContext(data), run: {}, env: {} },
    tables: { ...shared, cases: [], envList: [] },
  };
}

/** Defined names (print areas, print titles, named ranges) follow the rows of the sheet they point to. */
function shiftNames(book: WorkbookModel, sheet: SheetEntry, map: RowMap): void {
  if (map.isIdentity) return;
  for (const n of book.names) {
    const formula = unescapeXml(n.text);
    if (!refersToSheet(formula, sheet.name)) continue;
    const shifted = shiftFormula(formula, map, { sheets: [sheet.name] });
    if (shifted !== formula) n.text = escapeXml(shifted);
  }
}

async function partText(
  pkg: OoxmlPackage,
  book: WorkbookModel,
  kind: string,
): Promise<string | null> {
  const rel = book.rels.find((r) => r.kind === kind && !r.external);
  return rel ? pkg.text(resolveTarget(book.path, rel.target)) : null;
}

/** Shared strings as plain text (rich text runs joined, phonetic runs skipped). */
export async function readSharedStrings(pkg: OoxmlPackage, book: WorkbookModel): Promise<string[]> {
  const xml = await partText(pkg, book, 'sharedStrings');
  if (!xml) return [];
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>|<si\/>/g)].map((m) =>
    m[1] ? stringItemText(m[1]) : '',
  );
}

async function setTabSelected(
  pkg: OoxmlPackage,
  sheet: SheetEntry,
  selected: boolean,
): Promise<void> {
  const xml = await pkg.text(sheet.part);
  if (xml === null) return;
  const view = findElement(xml, 'sheetView');
  if (!view) return;
  const attrs = openTagAttrs(view.text);
  const isSelected = getAttr(attrs, 'tabSelected') === '1';
  if (isSelected === selected) return;
  const next = withOpenTagAttrs(view.text, setAttr(attrs, 'tabSelected', selected ? '1' : null));
  pkg.setText(sheet.part, xml.slice(0, view.start) + next + xml.slice(view.end));
}

async function removeCalcChain(pkg: OoxmlPackage, book: WorkbookModel): Promise<void> {
  const rel = book.rels.find((r) => r.kind === 'calcChain');
  if (!rel) return;
  const path = resolveTarget(book.path, rel.target);
  pkg.remove(path);
  await pkg.removeOverride(path);
  book.rels = book.rels.filter((r) => r !== rel);
}

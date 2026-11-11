import type { FieldDef, TemplateCheckDTO } from '@tmt/shared';
import { OoxmlPackage, WorkbookModel } from './package';
import { findPlaceholders, isKnownPlaceholder, placeholderReference } from './placeholders';
import { readSharedStrings } from './render-report';
import { getAttr, stringItemText, unescapeXml } from './xml';

export interface TemplateInfo {
  /** Placeholders found in cells, as written inside `${…}` (e.g. `plan.title`, `table:cases.no`), first-seen order. */
  placeholders: string[];
  /** Sheet names in workbook order. */
  sheets: string[];
}

/** Lists the sheets and the placeholders used in a template. */
export async function inspectTemplate(buffer: Buffer): Promise<TemplateInfo> {
  const pkg = await OoxmlPackage.load(buffer);
  const book = await WorkbookModel.read(pkg);
  const sst = await readSharedStrings(pkg, book);
  const found = new Set<string>();
  for (const sheet of book.sheets) {
    const xml = (await pkg.text(sheet.part)) ?? '';
    for (const m of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      if (m[2] === undefined) continue;
      const t = getAttr(m[1]!, 't');
      let text: string | null = null;
      if (t === 's') text = sst[Number(/<v>\s*(\d+)\s*<\/v>/.exec(m[2]!)?.[1] ?? -1)] ?? null;
      else if (t === 'inlineStr')
        text = stringItemText(/<is>([\s\S]*?)<\/is>/.exec(m[2]!)?.[1] ?? '');
      if (!text?.includes('${')) continue;
      for (const p of findPlaceholders(text)) found.add(p.inner);
    }
    for (const m of xml.matchAll(
      /<(?:odd|even|first)(?:Header|Footer)>([\s\S]*?)<\/(?:odd|even|first)(?:Header|Footer)>/g,
    )) {
      for (const p of findPlaceholders(unescapeXml(m[1]!))) found.add(p.inner);
    }
  }
  return { placeholders: [...found], sheets: book.sheets.map((s) => s.name) };
}

/** Template upload check for the API (`TemplateCheckDTO`): placeholders, unknown ones, sheets, run sheet. */
export async function checkTemplate(
  buffer: Buffer,
  opts: {
    runSheet?: string | null;
    fieldDefs?: Pick<FieldDef, 'key'>[];
    envLabels?: string[];
    groups?: string[];
  } = {},
): Promise<TemplateCheckDTO> {
  const info = await inspectTemplate(buffer);
  const reference = placeholderReference(
    opts.fieldDefs ?? [],
    opts.envLabels ?? [],
    opts.groups ?? [],
  );
  const runSheet = opts.runSheet?.trim();
  return {
    placeholders: info.placeholders,
    unknown: info.placeholders.filter((p) => !isKnownPlaceholder(p, reference)),
    sheets: info.sheets,
    runSheetFound: runSheet
      ? info.sheets.some((s) => s.toLowerCase() === runSheet.toLowerCase())
      : false,
  };
}

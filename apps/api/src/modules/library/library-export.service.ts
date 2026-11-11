import { Injectable } from '@nestjs/common';
import type { TestCase } from '@tmt/database';
import { ExcelJS } from '@tmt/excel';
import {
  CASE_PRIORITY_LABELS,
  CASE_STATUS_LABELS,
  flattenSteps,
  safeFileName,
  stepsToText,
} from '@tmt/shared';
import { PrismaService } from '../../prisma/prisma.service.js';
import { caseFilterSql, orderedCases } from './cases.queries.js';
import { expandCaseSteps, fieldDefsOf, type SharedStepLookup } from './library.mapper.js';
import { getSuite, loadSharedStepLookup } from './library.queries.js';
import { loadSectionTree } from './section-tree.js';

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Header of the library export (custom field labels follow). Every header is an import synonym. */
export const LIBRARY_EXPORT_HEADERS = [
  'Section',
  'Case code',
  'Title',
  'Type',
  'Status',
  'Precondition',
  'Procedure',
  'Expected result',
  'Remark',
  'Summary group',
  'Priority',
  'Tags',
  'Estimate (min)',
  'References',
] as const;

const WIDE = new Set(['Precondition', 'Procedure', 'Expected result', 'Remark']);

/** Excel sheet names: max 31 characters, none of []:*?/\ */
export function sheetName(name: string): string {
  const cleaned = name
    .replace(/[[\]:*?/\\]/g, ' ')
    .trim()
    .slice(0, 31);
  return cleaned || 'Sheet1';
}

function columnWidth(header: string): number {
  if (WIDE.has(header)) return 45;
  if (header === 'Title') return 36;
  if (header === 'Section') return 30;
  return header === 'References' || header === 'Tags' ? 24 : 16;
}

/**
 * Procedure / expected result of a case as text: step-by-step cases are written as numbered lines
 * (`stepsToText`, shared steps expanded) so templates and re-imports work without steps support.
 */
export function caseTexts(
  c: Pick<TestCase, 'template' | 'steps' | 'procedure' | 'expected'>,
  shared: SharedStepLookup,
): { procedure: string | null; expected: string | null } {
  if (c.template !== 'steps') return { procedure: c.procedure, expected: c.expected };
  const text = stepsToText(flattenSteps(expandCaseSteps(c.steps, shared)));
  return { procedure: text.procedure || null, expected: text.expected || null };
}

/** Excel export of a suite's live cases in library order (round-trips through the import). */
@Injectable()
export class LibraryExportService {
  constructor(private readonly prisma: PrismaService) {}

  async suiteWorkbook(
    projectId: number,
    suiteId: number,
  ): Promise<{ fileName: string; buffer: Buffer }> {
    const db = this.prisma.db;
    const suite = await getSuite(db, projectId, suiteId);
    const tree = await loadSectionTree(db, suite.id);
    const defs = fieldDefsOf(suite);
    const rows = await orderedCases(db, caseFilterSql(suite.id), tree);
    const shared = await loadSharedStepLookup(db, rows);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Test Management Tool';
    wb.created = new Date();
    const ws = wb.addWorksheet(sheetName(suite.name), { views: [{ state: 'frozen', ySplit: 1 }] });
    const headers: string[] = [...LIBRARY_EXPORT_HEADERS, ...defs.map((d) => d.label)];
    ws.columns = headers.map((h, i) => ({ header: h, key: `c${i}`, width: columnWidth(h) }));
    const header = ws.getRow(1);
    header.font = { bold: true };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7F5FF' } };
    header.alignment = { vertical: 'middle', wrapText: true };
    for (const c of rows) {
      const custom = (c.custom ?? {}) as Record<string, string>;
      const texts = caseTexts(c, shared);
      const row = ws.addRow([
        tree.pathOf(c.sectionId).join(' > '),
        c.code ?? '',
        c.title,
        c.caseType,
        CASE_STATUS_LABELS[c.status] ?? c.status,
        c.precondition ?? '',
        texts.procedure ?? '',
        texts.expected ?? '',
        c.remark ?? '',
        c.summaryGroup ?? '',
        CASE_PRIORITY_LABELS[c.priority] ?? c.priority,
        c.tags.join(', '),
        c.estimateMinutes ?? '',
        c.references ?? '',
        ...defs.map((d) => custom[d.key] ?? ''),
      ]);
      row.alignment = { vertical: 'top', wrapText: true };
    }
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    return { fileName: `${safeFileName(`${suite.name} test cases`)}.xlsx`, buffer };
  }
}

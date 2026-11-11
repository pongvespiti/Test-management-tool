/** Reads of report templates (with their workbook attachment) and template file checks. */
import fs from 'node:fs';
import type { ReportTemplate } from '@tmt/database';
import { defaultTemplatePath } from '@tmt/excel';
import JSZip from 'jszip';
import { notFound, unprocessable } from '../../common/errors/app.exception.js';
import type { Db } from '../../prisma/prisma.service.js';

/** A template row with the file name and storage key of its workbook. */
export interface TemplateRow {
  t: ReportTemplate;
  fileName: string;
  storageKey: string;
}

const withFile = { attachment: { select: { fileName: true, storageKey: true } } } as const;

function toRow({
  attachment,
  ...t
}: ReportTemplate & { attachment: { fileName: string; storageKey: string } }): TemplateRow {
  return { t, fileName: attachment.fileName, storageKey: attachment.storageKey };
}

/** Project templates by name. */
export async function listProjectTemplates(db: Db, projectId: number): Promise<TemplateRow[]> {
  const rows = await db.reportTemplate.findMany({
    where: { projectId },
    include: withFile,
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  });
  return rows.map(toRow);
}

/** A template of the project (404 TEMPLATE_NOT_FOUND otherwise). */
export async function getTemplateInProject(
  db: Db,
  projectId: number,
  templateId: number,
): Promise<TemplateRow> {
  const row = await db.reportTemplate.findFirst({
    where: { id: templateId, projectId },
    include: withFile,
  });
  if (!row) throw notFound('Report template', 'TEMPLATE_NOT_FOUND');
  return toRow(row);
}

/** A suite reference of a template must belong to the project (422 BAD_SUITE). */
export async function assertSuiteInProject(
  db: Db,
  projectId: number,
  suiteId: number | null | undefined,
): Promise<void> {
  if (suiteId === null || suiteId === undefined) return;
  const found = await db.suite.count({ where: { id: suiteId, projectId } });
  if (!found) throw unprocessable('BAD_SUITE', 'The suite does not belong to this project');
}

/** Absolute path of the built-in template file, or null when it is not installed. */
export function builtInTemplatePath(): string | null {
  const file = defaultTemplatePath();
  return fs.existsSync(file) ? file : null;
}

/** Light structural check that an upload is an .xlsx workbook (a zip with xl/workbook.xml). */
export async function looksLikeXlsx(buf: Buffer): Promise<boolean> {
  try {
    const zip = await JSZip.loadAsync(buf);
    return zip.file('xl/workbook.xml') !== null;
  } catch {
    return false;
  }
}

/**
 * Report export engine (spec §8, ADR-002): fills the team's controlled Excel form.
 * DB-free — the report service builds {@link ReportData} and stores/serves the result.
 */
export { renderReport } from './render-report';
export type { RenderOptions } from './render-report';
export { inspectTemplate, checkTemplate } from './inspect';
export type { TemplateInfo } from './inspect';
export {
  placeholderReference,
  isKnownPlaceholder,
  findPlaceholders,
  PLACEHOLDER_RE,
} from './placeholders';
export type { Placeholder, PlaceholderReference } from './placeholders';
export { sanitizeSheetName, quoteSheetName, MAX_SHEET_NAME } from './sheet-name';
export { TemplateError } from './errors';
export { runTableItem, caseTableItem, workbookContext, runContext } from './report-data';
export type { ReportData, ReportRun, ReportCase, CellScalar, TableItem } from './report-data';

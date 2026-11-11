/**
 * @tmt/excel — Excel engines of TMT, free of any database or HTTP framework:
 * - import: read team workbooks/CSV, detect layouts and parse test cases (ADR-005)
 * - export: fill the controlled report template (ADR-002)
 */
export * from './import/index';
export * from './export/index';
export { ExcelJS, interopDefault } from './cjs';
export type { Cell, CellValue, Workbook, Worksheet } from './cjs';
export { defaultTemplatePath, DEFAULT_TEMPLATE_RUN_SHEET } from './assets';

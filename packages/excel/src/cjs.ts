import * as ExcelJSNamespace from 'exceljs';

/**
 * CommonJS interop: under Node ESM (tsx, vitest) a namespace import of a CJS package exposes the
 * real exports on `.default`; under esbuild/TS they are on the namespace itself. This returns
 * whichever object actually carries the exports.
 */
export function interopDefault<T>(mod: T): T {
  const candidate = (mod as unknown as { default?: T }).default;
  if (candidate && (typeof candidate === 'object' || typeof candidate === 'function')) {
    return candidate;
  }
  return mod;
}

/** ExcelJS module object (Workbook, ValueType, …) that works in every runtime we use. */
export const ExcelJS = interopDefault(ExcelJSNamespace);
export type { Cell, CellValue, Workbook, Worksheet } from 'exceljs';

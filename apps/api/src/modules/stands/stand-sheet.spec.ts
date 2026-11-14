import { describe, expect, it } from '@jest/globals';
import { ExcelJS } from '@tmt/excel';
import { readStandSheet, readStandWorkbook } from './stand-sheet.js';

/**
 * A sheet laid out like the lab's: a "Zone …" heading, then a block with labels in one column and
 * two stands to the right, each in two merged columns.
 */
function labSheet() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Stand');
  const block = (row: number, labelCol: number, zone: string | null, stands: string[][]) => {
    if (zone) ws.getCell(row - 1, labelCol + 1).value = zone;
    ['Stand No.', 'Model Name', 'In charge', 'Request', 'Replace', 'Target'].forEach((l, i) => {
      ws.getCell(row + i, labelCol).value = l;
    });
    stands.forEach((values, s) => {
      const col = labelCol + 1 + s * 2;
      values.forEach((v, i) => {
        ws.mergeCells(row + i, col, row + i, col + 1);
        if (v !== '') ws.getCell(row + i, col).value = v;
      });
    });
  };
  block(4, 2, 'Zone North', [
    ['L1/N-1', 'ACU-35', 'Ann', 'Uninstall', 'ACU-50', '16/11/2026'],
    ['L1/N-2', 'ACU-60', 'Tom', '-', '-', '-'],
  ]);
  block(4, 9, 'Zone South', [
    ['L1/S-1', 'IoT', '', '', '', ''],
    ['', '', '', '', '', ''],
  ]);
  block(11, 2, null, [['L2/N-1', '', '', '', '', '']]);
  // An empty block of a planned zone: skipped.
  block(20, 2, 'Zone Spare', [['', '', '', '', '', '']]);
  return { wb, ws };
}

describe('readStandSheet', () => {
  it('reads stands with their zone, model and person; Request/Replace/Target become the note', () => {
    const { ws } = labSheet();
    const { stands, warnings } = readStandSheet(ws);
    expect(stands).toEqual([
      {
        zone: 'Zone North',
        code: 'L1/N-1',
        model: 'ACU-35',
        inCharge: 'Ann',
        note: 'Request: Uninstall; Replace: ACU-50; Target: 16/11/2026',
      },
      { zone: 'Zone North', code: 'L1/N-2', model: 'ACU-60', inCharge: 'Tom', note: null },
      { zone: 'Zone South', code: 'L1/S-1', model: 'IoT', inCharge: null, note: null },
      // The heading above the first block of the column counts for the blocks below it.
      { zone: 'Zone North', code: 'L2/N-1', model: null, inCharge: null, note: null },
    ]);
    expect(warnings).toEqual([]);
  });

  it('reads date cells as day/month/year and reports duplicate codes', async () => {
    const { wb, ws } = labSheet();
    ws.getCell(9, 3).value = new Date(Date.UTC(2026, 10, 16));
    ws.getCell(11, 3).value = 'L1/N-1';
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const { stands, warnings } = await readStandWorkbook(buffer);
    expect(stands[0]!.note).toContain('Target: 16/11/2026');
    expect(stands.map((s) => s.code)).toEqual(['L1/N-1', 'L1/N-2', 'L1/S-1']);
    expect(warnings).toEqual(['Stand L1/N-1 appears more than once; the first one is used']);
  });
});

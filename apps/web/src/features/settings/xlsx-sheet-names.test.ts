import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { DecompressionStream as NodeDecompressionStream } from 'node:stream/web';
import { deflateRawSync } from 'node:zlib';
import { readXlsxSheetNames } from './xlsx-sheet-names';

interface Entry {
  name: string;
  text: string;
  /** 0 = stored, 8 = deflate (others are written as given). */
  method?: number;
  flags?: number;
}

/** Minimal zip writer: local headers, central directory and end record (no CRC checks needed). */
function zip(entries: Entry[], { centralSig = 0x02014b50, localSig = 0x04034b50 } = {}) {
  const enc = new TextEncoder();
  const locals: Uint8Array<ArrayBuffer>[] = [];
  const centrals: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;
  for (const e of entries) {
    const method = e.method ?? 8;
    const raw = enc.encode(e.text);
    const data: Uint8Array<ArrayBuffer> = method === 8 ? Uint8Array.from(deflateRawSync(raw)) : raw;
    const name = enc.encode(e.name);
    const local = new Uint8Array(30 + name.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, localSig, true);
    lv.setUint16(8, method, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, raw.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(data, 30 + name.length);
    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, centralSig, true);
    cv.setUint16(8, e.flags ?? 0, true);
    cv.setUint16(10, method, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, raw.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const cdSize = centrals.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  return new File([...locals, ...centrals, end], 'form.xlsx');
}

const WORKBOOK = `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheets><sheet name="Summary" sheetId="1"/><sheet name="RUN" sheetId="2"/></sheets>
</workbook>`;

const workbook = (overrides: Partial<Entry> = {}): Entry => ({
  name: 'xl/workbook.xml',
  text: WORKBOOK,
  ...overrides,
});

describe('readXlsxSheetNames', () => {
  const g = globalThis as { DecompressionStream?: unknown };
  const original = g.DecompressionStream;
  beforeAll(() => {
    g.DecompressionStream = NodeDecompressionStream;
  });
  afterAll(() => {
    g.DecompressionStream = original;
  });

  it('reads the sheet names of a deflated or stored workbook part', async () => {
    const other = { name: 'xl/styles.xml', text: '<styleSheet/>' };
    expect(await readXlsxSheetNames(zip([other, workbook()]))).toEqual(['Summary', 'RUN']);
    expect(await readXlsxSheetNames(zip([workbook({ method: 0 })]))).toEqual(['Summary', 'RUN']);
  });

  it('uses Blob.arrayBuffer where the browser has it', async () => {
    const file = zip([workbook()]);
    const reader = new FileReader();
    const buffer = await new Promise<ArrayBuffer>((resolve) => {
      reader.addEventListener('load', () => resolve(reader.result as ArrayBuffer));
      reader.readAsArrayBuffer(file);
    });
    Object.defineProperty(file, 'arrayBuffer', { value: async () => buffer });
    expect(await readXlsxSheetNames(file)).toEqual(['Summary', 'RUN']);
  });

  it('gives up on anything unusual', async () => {
    const big = zip([workbook()]);
    Object.defineProperty(big, 'size', { value: 60 * 1024 * 1024 });
    const cases: File[] = [
      big,
      new File(['not a zip at all'], 'x.xlsx'),
      zip([{ name: 'xl/other.xml', text: '<x/>' }]),
      zip([workbook({ flags: 1 })]),
      zip([workbook({ method: 12 })]),
      zip([workbook()], { localSig: 0x01020304 }),
      zip([workbook()], { centralSig: 0x01020304 }),
      zip([workbook({ text: '<workbook><sheets>' })]),
      zip([workbook({ text: '<workbook><sheets/></workbook>' })]),
    ];
    for (const file of cases) expect(await readXlsxSheetNames(file)).toBeNull();
  });

  it('needs DecompressionStream', async () => {
    g.DecompressionStream = undefined;
    try {
      expect(await readXlsxSheetNames(zip([workbook()]))).toBeNull();
    } finally {
      g.DecompressionStream = NodeDecompressionStream;
    }
  });
});

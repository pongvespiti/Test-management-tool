/**
 * Reads the sheet names of an .xlsx file in the browser, to suggest the run sheet before upload.
 * An .xlsx is a zip: find `xl/workbook.xml` through the central directory and inflate it with the
 * native `DecompressionStream` (no library). Best effort — returns null whenever anything is
 * unusual (zip64, encryption, old browser); the server check stays the authority.
 */
const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;
const MAX_FILE_BYTES = 50 * 1024 * 1024;

interface ZipEntry {
  method: number;
  compressedSize: number;
  localOffset: number;
}

function findEntry(bytes: Uint8Array, view: DataView, name: string): ZipEntry | null {
  // End of central directory: 22 bytes + up to 64 KiB comment, searched from the end.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  for (let n = 0; n < count && p + 46 <= bytes.length; n++) {
    if (view.getUint32(p, true) !== CENTRAL_SIG) return null;
    const flags = view.getUint16(p + 8, true);
    const method = view.getUint16(p + 10, true);
    const compressedSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const entryName = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    if (entryName === name) {
      if (flags & 0x1 || compressedSize === 0xffffffff || localOffset === 0xffffffff) return null;
      return { method, compressedSize, localOffset };
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

async function inflateRaw(data: Uint8Array<ArrayBuffer>): Promise<string> {
  const stream = new DecompressionStream('deflate-raw');
  const writer = stream.writable.getWriter();
  void writer.write(data).catch(() => undefined);
  void writer.close().catch(() => undefined);
  return new Response(stream.readable).text();
}

async function entryText(
  bytes: Uint8Array<ArrayBuffer>,
  view: DataView,
  entry: ZipEntry,
): Promise<string> {
  const p = entry.localOffset;
  if (view.getUint32(p, true) !== LOCAL_SIG) throw new Error('bad local header');
  const start = p + 30 + view.getUint16(p + 26, true) + view.getUint16(p + 28, true);
  const data = bytes.slice(start, start + entry.compressedSize);
  if (entry.method === 0) return new TextDecoder().decode(data);
  if (entry.method !== 8) throw new Error('unsupported compression');
  return inflateRaw(data);
}

/** File contents (FileReader where `Blob.arrayBuffer` is missing). */
function readBytes(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(reader.result as ArrayBuffer));
    reader.addEventListener('error', () => reject(reader.error ?? new Error('read failed')));
    reader.readAsArrayBuffer(file);
  });
}

/** Sheet names in workbook order, or null when they cannot be read. */
export async function readXlsxSheetNames(file: File): Promise<string[] | null> {
  try {
    if (typeof DecompressionStream === 'undefined' || file.size > MAX_FILE_BYTES) return null;
    const bytes = new Uint8Array(await readBytes(file));
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const entry = findEntry(bytes, view, 'xl/workbook.xml');
    if (!entry) return null;
    const xml = await entryText(bytes, view, entry);
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length > 0) return null;
    const names = Array.from(doc.getElementsByTagNameNS('*', 'sheet'))
      .map((s) => s.getAttribute('name') ?? '')
      .filter(Boolean);
    return names.length > 0 ? names : null;
  } catch {
    return null;
  }
}

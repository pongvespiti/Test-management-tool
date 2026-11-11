import { ImportFormatError } from './errors';

export interface ZipLimits {
  /** Maximum sum of uncompressed entry sizes in bytes. */
  maxTotalUncompressed: number;
  maxEntries: number;
}

export const DEFAULT_ZIP_LIMITS: ZipLimits = {
  maxTotalUncompressed: 400 * 1024 * 1024,
  maxEntries: 10_000,
};

/** True when the buffer starts with a ZIP local file header (`PK\x03\x04`). */
export function looksLikeZip(buf: Buffer): boolean {
  return (
    buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04
  );
}

/**
 * Defence against decompression bombs: reads the ZIP central directory and rejects archives whose
 * declared uncompressed size or entry count exceeds the limits, before any decompression happens.
 * Returns the entry names.
 */
export function assertSafeZip(buf: Buffer, limits: ZipLimits = DEFAULT_ZIP_LIMITS): string[] {
  const eocd = findEndOfCentralDirectory(buf);
  if (eocd < 0)
    throw new ImportFormatError('CORRUPT_FILE', 'The file is not a valid .xlsx workbook');
  const entries = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (entries === 0xffff || cdOffset === 0xffffffff || cdSize === 0xffffffff) {
    throw new ImportFormatError('FILE_TOO_LARGE', 'The workbook is too large to import');
  }
  if (entries > limits.maxEntries) {
    throw new ImportFormatError('FILE_TOO_LARGE', 'The workbook contains too many parts to import');
  }
  let p = cdOffset;
  let total = 0;
  const names: string[] = [];
  for (let i = 0; i < entries; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) {
      throw new ImportFormatError('CORRUPT_FILE', 'The file is not a valid .xlsx workbook');
    }
    const uncompressed = buf.readUInt32LE(p + 24);
    if (uncompressed === 0xffffffff) {
      throw new ImportFormatError('FILE_TOO_LARGE', 'The workbook is too large to import');
    }
    total += uncompressed;
    if (total > limits.maxTotalUncompressed) {
      throw new ImportFormatError('FILE_TOO_LARGE', 'The workbook is too large to import');
    }
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    names.push(buf.toString('utf8', p + 46, Math.min(buf.length, p + 46 + nameLen)));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return names;
}

function findEndOfCentralDirectory(buf: Buffer): number {
  const min = Math.max(0, buf.length - 65_557);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) return i;
  }
  return -1;
}

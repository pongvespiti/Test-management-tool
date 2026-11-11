import path from 'node:path';

/** Extension → MIME type for accepted uploads. The client-sent type is never trusted. */
const TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  m4v: 'video/mp4',
  txt: 'text/plain',
  log: 'text/plain',
  csv: 'text/csv',
  json: 'application/json',
  xml: 'application/xml',
  md: 'text/markdown',
  zip: 'application/zip',
  '7z': 'application/x-7z-compressed',
  gz: 'application/gzip',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  pcap: 'application/vnd.tcpdump.pcap',
  pcapng: 'application/octet-stream',
  bin: 'application/octet-stream',
  hex: 'text/plain',
  dat: 'application/octet-stream',
  mot: 'text/plain',
};

/** Never accepted: executable or browser-active content. */
const BLOCKED = new Set([
  'html',
  'htm',
  'xhtml',
  'js',
  'mjs',
  'cjs',
  'exe',
  'msi',
  'bat',
  'cmd',
  'com',
  'scr',
  'ps1',
  'vbs',
  'wsf',
  'sh',
  'jar',
  'dll',
  'hta',
  'lnk',
  'reg',
  'php',
  'jsp',
  'asp',
  'aspx',
]);

/** Served inline (preview in the browser); everything else is a download. */
const INLINE = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/bmp',
  'application/pdf',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'text/plain',
]);

export function extensionOf(fileName: string): string {
  return path.extname(fileName).slice(1).toLowerCase();
}

/** Returns the MIME type for an upload, or null when the type is blocked. */
export function mimeForUpload(fileName: string): string | null {
  const ext = extensionOf(fileName);
  if (BLOCKED.has(ext)) return null;
  return TYPES[ext] ?? 'application/octet-stream';
}

export function isInlineType(mime: string): boolean {
  return INLINE.has(mime);
}

/** RFC 6266 / 5987 Content-Disposition with a UTF-8 file name. */
export function contentDisposition(kind: 'inline' | 'attachment', fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

/** Strips any path from a client-supplied file name. */
export function cleanFileName(name: string | undefined, fallback = 'file'): string {
  const base = (name ?? '').split(/[\\/]/).pop() ?? '';
  const cleaned = base
    // Control characters are never valid in file names, so matching them is intended.
    // oxlint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f<>:"|?*]/g, '_')
    .trim()
    .slice(0, 200);
  return cleaned || fallback;
}

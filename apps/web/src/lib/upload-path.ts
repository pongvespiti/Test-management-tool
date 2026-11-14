/**
 * First path segment of streamed evidence uploads (`src/app/upload/...`). `src/proxy.ts` skips
 * it, so the body is never held in memory by the Next.js proxy.
 */
export const STREAM_UPLOAD_PREFIX = '/upload';

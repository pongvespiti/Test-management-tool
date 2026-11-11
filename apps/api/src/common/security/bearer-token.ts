import type { Request } from 'express';

/**
 * The token of an `Authorization: Bearer …` header: '' for an empty one (rejected later as an
 * invalid token — never a silent fallback to the session cookie), null when there is no Bearer header.
 */
export function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const match = /^\s*Bearer(?:\s+(.*?))?\s*$/i.exec(header);
  return match ? (match[1] ?? '') : null;
}

import type { FieldPath, FieldValues, UseFormSetError } from 'react-hook-form';
import { ApiError } from '@/lib/api/client';

/**
 * Field errors from a server `400 VALIDATION_ERROR` (`details.issues[]: { path, message }`), keyed
 * by the dotted field path — or null when the error is something else.
 */
export function validationIssues(err: unknown): Record<string, string> | null {
  if (!(err instanceof ApiError) || err.code !== 'VALIDATION_ERROR') return null;
  const issues = (err.details as { issues?: unknown } | undefined)?.issues;
  if (!Array.isArray(issues)) return null;
  const out: Record<string, string> = {};
  for (const issue of issues as { path?: unknown; message?: unknown }[]) {
    if (typeof issue.path !== 'string' || typeof issue.message !== 'string') continue;
    if (issue.path && !(issue.path in out)) out[issue.path] = issue.message;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Error code of an API error, null for anything else. */
export function errorCode(err: unknown): string | null {
  return err instanceof ApiError ? err.code : null;
}

/** Shows server validation issues next to their fields; false when `err` carries none. */
export function applyValidationIssues<V extends FieldValues>(
  err: unknown,
  setError: UseFormSetError<V>,
): boolean {
  const issues = validationIssues(err);
  if (!issues) return false;
  for (const [path, message] of Object.entries(issues))
    setError(path as FieldPath<V>, { type: 'server', message });
  return true;
}

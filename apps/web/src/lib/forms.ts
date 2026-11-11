import { zodResolver } from '@hookform/resolvers/zod';
import type { FieldValues, Resolver } from 'react-hook-form';
import type { z } from 'zod';

type RawIssue = z.core.$ZodRawIssue;

const isBlank = (value: unknown) => value === undefined || value === null || value === '';

/**
 * Zod's default English messages ("Too small: expected string to have >=1 characters") are meant for
 * developers; this error map turns them into short form messages. Messages set in the schemas take
 * precedence (Zod applies a per-parse error map only when the schema has none).
 */
export function friendlyIssueMessage(issue: RawIssue): string | undefined {
  switch (issue.code) {
    case 'too_small': {
      const min = Number(issue.minimum);
      if (issue.origin === 'string')
        return min <= 1 ? 'Required' : `Use at least ${min} characters`;
      if (issue.origin === 'array' || issue.origin === 'set')
        return min <= 1 ? 'Add at least one item' : `Add at least ${min} items`;
      return `Must be at least ${min}`;
    }
    case 'too_big': {
      const max = Number(issue.maximum);
      if (issue.origin === 'string') return `Use at most ${max} characters`;
      if (issue.origin === 'array' || issue.origin === 'set') return `Use at most ${max} items`;
      return `Must be at most ${max}`;
    }
    case 'invalid_format':
      if (issue.format === 'email') return 'Enter a valid email address';
      if (issue.format === 'date') return 'Enter a valid date';
      if (issue.format === 'url') return 'Enter a valid URL';
      return 'Invalid format';
    case 'invalid_type':
      return isBlank(issue.input) ? 'Required' : 'Invalid value';
    case 'invalid_value':
      return 'Choose one of the options';
    case 'invalid_union':
      return isBlank(issue.input) ? 'Required' : 'Invalid value';
    default:
      return undefined;
  }
}

/** Zod error map for forms (see {@link friendlyIssueMessage}). */
export const formErrorMap = (issue: RawIssue) => friendlyIssueMessage(issue);

/**
 * react-hook-form resolver for a shared Zod schema with friendly messages. Form values are the
 * schema input, the submit handler receives the parsed output.
 */
export function formResolver<Input extends FieldValues, Output>(
  schema: z.ZodType<Output, Input>,
): Resolver<Input, unknown, Output> {
  return zodResolver(schema, { error: formErrorMap }) as Resolver<Input, unknown, Output>;
}

/** Selects use string values; convert to a positive id or null. */
export function toId(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function fromId(id: number | null | undefined): string {
  return id === null || id === undefined ? '' : String(id);
}

const PASSWORD_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

/** Random readable password for "generate" buttons (not security-critical: the user must change it). */
export function generatePassword(length = 12): string {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => PASSWORD_CHARS[b % PASSWORD_CHARS.length]).join('');
}

/** Only in-app paths are allowed as redirect targets (no open redirects). */
export function safeNextPath(next: string | null | undefined, fallback = '/'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\'))
    return fallback;
  return next;
}

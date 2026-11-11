import { get, type FieldErrors, type FieldValues, type Resolver } from 'react-hook-form';
import type { z } from 'zod';
import { formErrorMap } from '@/lib/forms';

/** Form errors by dotted path (`title`, `steps.0.action`, `custom.test_id`), first message per path. */
export type FlatErrors = Record<string, string>;

/**
 * Validates a request body with a shared schema (friendly messages). `mapPath` moves an error to
 * the form field that shows it (e.g. `estimateMinutes` → `estimate`).
 */
export function schemaErrors(
  schema: z.ZodType,
  body: unknown,
  mapPath: (path: string) => string = (path) => path,
): FlatErrors {
  const result = schema.safeParse(body, { error: formErrorMap });
  if (result.success) return {};
  const errors: FlatErrors = {};
  for (const issue of result.error.issues) {
    const key = mapPath(issue.path.map(String).join('.')) || 'root';
    errors[key] ??= issue.message;
  }
  return errors;
}

/**
 * Nested react-hook-form errors from flat paths. A list-level message (`steps`) and item messages
 * (`steps.0.action`) live side by side: `errors.steps.message` next to `errors.steps[0].action`.
 */
export function toFieldErrors<V extends FieldValues>(flat: FlatErrors): FieldErrors<V> {
  const root: Record<string, unknown> = {};
  for (const [path, message] of Object.entries(flat)) {
    const keys = path.split('.');
    const last = keys.pop()!;
    let node = root;
    for (const key of keys) {
      const child = node[key];
      if (typeof child !== 'object' || child === null) node[key] = {};
      node = node[key] as Record<string, unknown>;
    }
    const existing = node[last];
    node[last] = {
      ...(typeof existing === 'object' && existing !== null ? existing : {}),
      type: 'validate',
      message,
    };
  }
  return root as FieldErrors<V>;
}

/** Resolver for forms whose values are not the request body: `validate` maps and checks them. */
export function flatResolver<V extends FieldValues>(
  validate: (values: V) => FlatErrors,
): Resolver<V> {
  return (values) => {
    const flat = validate(values);
    return Object.keys(flat).length === 0
      ? { values, errors: {} }
      : { values: {}, errors: toFieldErrors<V>(flat) };
  };
}

/** Message of the error at `path`, if any. */
export function errorAt(errors: FieldErrors, path: string): string | undefined {
  const error = get(errors, path) as { message?: unknown } | undefined;
  return typeof error?.message === 'string' && error.message !== '' ? error.message : undefined;
}

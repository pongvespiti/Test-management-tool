import { StandardSchemaValidationPipe } from '@nestjs/common';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { AppException } from '../errors/app.exception.js';

function issuePath(issue: StandardSchemaV1.Issue): string {
  return (issue.path ?? [])
    .map((p) => (typeof p === 'object' && p !== null && 'key' in p ? String(p.key) : String(p)))
    .join('.');
}

/**
 * Global validation: every `@Body/@Query/@Param({ schema })` is validated with the shared Zod
 * schema (Standard Schema). Failures become 400 VALIDATION_ERROR with `details.issues`.
 */
export function createValidationPipe(): StandardSchemaValidationPipe {
  return new StandardSchemaValidationPipe({
    transform: true,
    exceptionFactory: (issues) => {
      const list = issues.map((i) => ({ path: issuePath(i), message: i.message }));
      const first = list[0];
      return new AppException(
        400,
        'VALIDATION_ERROR',
        first ? `${first.path ? `${first.path}: ` : ''}${first.message}` : 'Invalid input',
        { issues: list },
      );
    },
  });
}

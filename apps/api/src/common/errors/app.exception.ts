import { HttpException } from '@nestjs/common';

/**
 * Error with an HTTP status and a stable machine-readable `code` (see the error envelope in
 * docs/api.md). Throw it — or one of the helpers below — from services and guards.
 */
export class AppException extends HttpException {
  constructor(
    status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super({ code, message, details }, status);
    this.name = 'AppException';
  }
}

export const badRequest = (code: string, message: string, details?: unknown) =>
  new AppException(400, code, message, details);
export const unauthorized = (message = 'Please sign in', code = 'UNAUTHENTICATED') =>
  new AppException(401, code, message);
export const forbidden = (message = 'You do not have permission to do this', code = 'FORBIDDEN') =>
  new AppException(403, code, message);
export const notFound = (what = 'Resource', code = 'NOT_FOUND') =>
  new AppException(404, code, `${what} not found`);
export const conflict = (code: string, message: string, details?: unknown) =>
  new AppException(409, code, message, details);
export const unprocessable = (code: string, message: string, details?: unknown) =>
  new AppException(422, code, message, details);

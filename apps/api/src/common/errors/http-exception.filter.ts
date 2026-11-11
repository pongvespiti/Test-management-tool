import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { ApiErrorBody } from '@tmt/shared';
import type { Response } from 'express';
import { AppException } from './app.exception.js';
import { isDbUnavailable, isRecordNotFound, isUniqueViolation } from './prisma-errors.js';

const STATUS_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  409: 'CONFLICT',
  413: 'FILE_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  422: 'UNPROCESSABLE',
  429: 'RATE_LIMITED',
};

/**
 * Turns every error into the API envelope `{ error: { code, message, details? } }`.
 * 5xx errors are logged with the request id and never leak internals to the client.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const { status, body } = this.toEnvelope(exception);
    if (status >= 500) this.logger.error(exception instanceof Error ? exception.stack : exception);
    if (!res.headersSent) res.status(status).json(body);
  }

  private toEnvelope(e: unknown): { status: number; body: ApiErrorBody } {
    if (e instanceof AppException) {
      return this.make(e.getStatus(), e.code, e.message, e.details);
    }
    if (isUniqueViolation(e)) return this.make(409, 'CONFLICT', 'This value is already in use');
    if (isRecordNotFound(e)) return this.make(404, 'NOT_FOUND', 'Resource not found');
    if (isDbUnavailable(e)) {
      return this.make(
        503,
        'DB_UNAVAILABLE',
        'The database is not reachable — please try again shortly',
      );
    }
    if (e instanceof HttpException) {
      const status = e.getStatus();
      const response = e.getResponse();
      const message =
        typeof response === 'object' && response && 'message' in response
          ? String(Array.isArray(response.message) ? response.message[0] : response.message)
          : e.message;
      if (status >= 500) return this.internal();
      return this.make(status, STATUS_CODES[status] ?? `HTTP_${status}`, message);
    }
    return this.internal();
  }

  private internal() {
    return this.make(
      HttpStatus.INTERNAL_SERVER_ERROR,
      'INTERNAL_ERROR',
      'Something went wrong — please try again',
    );
  }

  private make(status: number, code: string, message: string, details?: unknown) {
    const body: ApiErrorBody = { error: { code, message } };
    if (details !== undefined) body.error.details = details;
    return { status, body };
  }
}

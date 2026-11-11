import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { BadRequestException, HttpException, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@tmt/database';
import { fakeRequest, fakeResponse, argumentsHost } from '../../../test/unit/http-context.js';
import { AppException, conflict } from './app.exception.js';
import { HttpExceptionFilter } from './http-exception.filter.js';

function envelope(exception: unknown) {
  const res = fakeResponse();
  new HttpExceptionFilter().catch(exception, argumentsHost(fakeRequest(), res));
  return { status: res.statusCode, body: res.body as { error: Record<string, unknown> } };
}

const prismaError = (code: string, meta?: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError('db error', { code, clientVersion: 'test', meta });

describe('HttpExceptionFilter', () => {
  let logError: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    logError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it('renders AppException with its code, message and details', () => {
    const { status, body } = envelope(conflict('PROJECT_KEY_TAKEN', 'Key used', { key: 'ACS' }));
    expect(status).toBe(409);
    expect(body).toEqual({
      error: { code: 'PROJECT_KEY_TAKEN', message: 'Key used', details: { key: 'ACS' } },
    });
  });

  it('omits details when there are none', () => {
    expect(envelope(new AppException(422, 'X', 'msg')).body.error).not.toHaveProperty('details');
  });

  it('maps Prisma unique violations to 409 and missing records to 404', () => {
    expect(envelope(prismaError('P2002')).status).toBe(409);
    expect(envelope(prismaError('P2002')).body.error.code).toBe('CONFLICT');
    expect(envelope(prismaError('P2025')).status).toBe(404);
  });

  it('maps an unreachable database to 503', () => {
    const err = Object.assign(new Error('connect failed'), { code: 'ECONNREFUSED' });
    const { status, body } = envelope(err);
    expect(status).toBe(503);
    expect(body.error.code).toBe('DB_UNAVAILABLE');
  });

  it('maps Nest HTTP exceptions to stable codes', () => {
    expect(envelope(new NotFoundException('Cannot GET /x')).body.error).toEqual({
      code: 'NOT_FOUND',
      message: 'Cannot GET /x',
    });
    expect(envelope(new BadRequestException(['first', 'second'])).body.error.message).toBe('first');
    expect(envelope(new HttpException('Too many', 429)).body.error.code).toBe('RATE_LIMITED');
    expect(envelope(new HttpException('Teapot', 418)).body.error.code).toBe('HTTP_418');
  });

  it('hides internals of unexpected errors and logs them', () => {
    const { status, body } = envelope(new Error('SELECT secret FROM users'));
    expect(status).toBe(500);
    expect(body.error).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong — please try again',
    });
    expect(logError).toHaveBeenCalled();
    expect(envelope(new HttpException('boom', 502)).body.error.code).toBe('INTERNAL_ERROR');
  });

  it('does not write when the response was already sent', () => {
    const res = fakeResponse();
    res.headersSent = true;
    new HttpExceptionFilter().catch(
      new AppException(400, 'X', 'y'),
      argumentsHost(fakeRequest(), res),
    );
    expect(res.body).toBeUndefined();
  });
});

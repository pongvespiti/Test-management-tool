import type { ArgumentsHost, ExecutionContext } from '@nestjs/common';
import { jest } from '@jest/globals';
import type { Request, Response } from 'express';

export interface FakeResponse {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
  headersSent: boolean;
  status: (code: number) => FakeResponse;
  json: (body: unknown) => FakeResponse;
  setHeader: (name: string, value: string) => void;
}

/** Minimal Express-like request for guards, middleware and filters. */
export function fakeRequest(overrides: Partial<Request> & Record<string, unknown> = {}): Request {
  return {
    method: 'GET',
    headers: {},
    cookies: {},
    params: {},
    query: {},
    ip: '127.0.0.1',
    ...overrides,
  } as unknown as Request;
}

export function fakeResponse(): FakeResponse {
  const res: FakeResponse = {
    statusCode: 200,
    body: undefined,
    headers: {},
    headersSent: false,
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(body) {
      res.body = body;
      return res;
    },
    setHeader(name, value) {
      res.headers[name.toLowerCase()] = value;
    },
  };
  return res;
}

/** ExecutionContext of an HTTP request handled by `handler` of `controller`. */
export function httpContext(
  req: Request,
  res: FakeResponse = fakeResponse(),
  handler: () => unknown = function handler() {},
  controller: abstract new (...args: never[]) => unknown = class Controller {},
): ExecutionContext {
  const http = {
    getRequest: () => req,
    getResponse: () => res as unknown as Response,
    getNext: () => jest.fn(),
  };
  return {
    switchToHttp: () => http,
    getHandler: () => handler,
    getClass: () => controller,
    getType: () => 'http',
    getArgs: () => [req, res],
    getArgByIndex: (i: number) => [req, res][i],
    switchToRpc: () => {
      throw new Error('not rpc');
    },
    switchToWs: () => {
      throw new Error('not ws');
    },
  } as unknown as ExecutionContext;
}

export const argumentsHost = (req: Request, res: FakeResponse): ArgumentsHost =>
  httpContext(req, res);

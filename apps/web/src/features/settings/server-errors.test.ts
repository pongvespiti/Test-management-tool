import { describe, expect, it, jest } from '@jest/globals';
import { ApiError } from '@/lib/api/client';
import { applyValidationIssues, errorCode, validationIssues } from './server-errors';

const validation = (details: unknown) => new ApiError(400, 'VALIDATION_ERROR', 'invalid', details);

describe('validationIssues', () => {
  it('maps the issues of a validation error by field path (first message wins)', () => {
    expect(
      validationIssues(
        validation({
          issues: [
            { path: 'name', message: 'Too long' },
            { path: 'name', message: 'Second' },
            { path: 'options.onExisting', message: 'Invalid' },
            { path: '', message: 'Whole body' },
            { path: 3, message: 'Not a path' },
            { path: 'x' },
          ],
        }),
      ),
    ).toEqual({ name: 'Too long', 'options.onExisting': 'Invalid' });
  });

  it('ignores other errors and validation errors without field issues', () => {
    expect(validationIssues(new Error('x'))).toBeNull();
    expect(validationIssues(new ApiError(409, 'CONFLICT', 'x'))).toBeNull();
    expect(validationIssues(validation(undefined))).toBeNull();
    expect(validationIssues(validation({ issues: 'none' }))).toBeNull();
    expect(validationIssues(validation({ issues: [{ path: '', message: 'Body' }] }))).toBeNull();
  });
});

describe('errorCode', () => {
  it('returns the code of API errors only', () => {
    expect(errorCode(new ApiError(422, 'BAD_SUITE', 'x'))).toBe('BAD_SUITE');
    expect(errorCode(new Error('x'))).toBeNull();
  });
});

describe('applyValidationIssues', () => {
  it('sets one form error per issue', () => {
    const setError = jest.fn();
    expect(
      applyValidationIssues(validation({ issues: [{ path: 'name', message: 'Taken' }] }), setError),
    ).toBe(true);
    expect(setError).toHaveBeenCalledWith('name', { type: 'server', message: 'Taken' });
    expect(applyValidationIssues(new Error('x'), setError)).toBe(false);
    expect(setError).toHaveBeenCalledTimes(1);
  });
});

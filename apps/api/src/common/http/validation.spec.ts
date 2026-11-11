import { describe, expect, it } from '@jest/globals';
import { z } from 'zod';
import { AppException } from '../errors/app.exception.js';
import { createValidationPipe } from './validation.js';

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  items: z.array(z.object({ qty: z.number().int().positive('Quantity must be positive') })),
  count: z.coerce.number().int().default(1),
});

async function validate(value: unknown) {
  return createValidationPipe().transform(value, { type: 'body', schema });
}

describe('createValidationPipe', () => {
  it('returns the parsed (transformed) value', async () => {
    await expect(validate({ name: 'x', items: [], count: '3' })).resolves.toEqual({
      name: 'x',
      items: [],
      count: 3,
    });
  });

  it('throws 400 VALIDATION_ERROR listing every issue with its path', async () => {
    let error: AppException | undefined;
    try {
      await validate({ name: '', items: [{ qty: 0 }] });
    } catch (e) {
      error = e as AppException;
    }
    expect(error).toBeInstanceOf(AppException);
    expect(error!.getStatus()).toBe(400);
    expect(error!.code).toBe('VALIDATION_ERROR');
    expect(error!.message).toBe('name: Name is required');
    expect(error!.details).toEqual({
      issues: [
        { path: 'name', message: 'Name is required' },
        { path: 'items.0.qty', message: 'Quantity must be positive' },
      ],
    });
  });

  it('skips parameters without a schema', async () => {
    const pipe = createValidationPipe();
    await expect(pipe.transform('raw', { type: 'query' })).resolves.toBe('raw');
  });
});

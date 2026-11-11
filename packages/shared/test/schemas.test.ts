import { describe, expect, it } from '@jest/globals';
import {
  buildSchema,
  bulkCasesSchema,
  createCaseSchema,
  createProjectSchema,
  createRunSchema,
  createSuiteSchema,
  createUserSchema,
  importRunSchema,
  listDefectsQuerySchema,
  setResultSchema,
  updateBuildSchema,
  updateCaseSchema,
} from '../src';

describe('schemas', () => {
  it('validates builds and lets a patch leave fields out', () => {
    expect(
      buildSchema.parse({ name: ' 1.1.7(2.0.0) ', notes: '', builtDate: '2026-11-08' }),
    ).toEqual({
      name: '1.1.7(2.0.0)',
      notes: null,
      builtDate: '2026-11-08',
    });
    expect(buildSchema.safeParse({ name: '  ' }).success).toBe(false);
    expect(buildSchema.safeParse({ name: 'x', builtDate: '08/11/2026' }).success).toBe(false);
    expect(updateBuildSchema.parse({ notes: null })).toEqual({ notes: null });
    expect(updateBuildSchema.parse({})).toEqual({});
  });

  it('accepts a build on runs and as a defect filter', () => {
    expect(createRunSchema.parse({ suiteId: 1, code: 'R1', buildId: 8 }).buildId).toBe(8);
    expect(createRunSchema.parse({ suiteId: 1, code: 'R1', buildId: null }).buildId).toBeNull();
    expect(listDefectsQuerySchema.parse({ buildId: '8' }).buildId).toBe(8);
  });

  it('normalises project keys and rejects bad ones', () => {
    expect(createProjectSchema.parse({ key: 'acs', name: 'ACS Smart control system' }).key).toBe(
      'ACS',
    );
    expect(createProjectSchema.safeParse({ key: '1A', name: 'x' }).success).toBe(false);
  });

  it('applies case defaults and turns empty text into null', () => {
    const c = createCaseSchema.parse({ title: '  Power (Unit) ', precondition: '' });
    expect(c.title).toBe('Power (Unit)');
    expect(c.caseType).toBe('Normal');
    expect(c.status).toBe('ready');
    expect(c.precondition).toBeNull();
    expect(c.custom).toEqual({});
    expect(updateCaseSchema.parse({ remark: '' }).remark).toBeNull();
  });

  it('validates suite field definitions', () => {
    const ok = createSuiteSchema.parse({
      name: 'Modbus system test',
      prefix: 'mbs',
      fieldDefs: [{ key: 'register', label: 'Register' }],
    });
    expect(ok.prefix).toBe('MBS');
    expect(ok.fieldDefs[0]?.type).toBe('text');
    const dup = createSuiteSchema.safeParse({
      name: 'x',
      prefix: 'X',
      fieldDefs: [
        { key: 'a', label: 'A' },
        { key: 'a', label: 'B' },
      ],
    });
    expect(dup.success).toBe(false);
  });

  it('validates bulk actions by discriminator', () => {
    expect(bulkCasesSchema.safeParse({ action: 'move', ids: [1], sectionId: null }).success).toBe(
      true,
    );
    expect(bulkCasesSchema.safeParse({ action: 'setStatus', ids: [1] }).success).toBe(false);
  });

  it('defaults run creation to ready cases', () => {
    const r = createRunSchema.parse({ suiteId: 3, code: 'KR_01' });
    expect(r.caseStatuses).toEqual(['ready']);
    expect(r.environment).toEqual([]);
  });

  it('validates results and users', () => {
    expect(setResultSchema.safeParse({ status: 'ok_cond' }).success).toBe(true);
    expect(setResultSchema.safeParse({ status: 'pass' }).success).toBe(false);
    expect(
      createUserSchema.safeParse({ username: 'ab', displayName: 'x', password: '12345678' })
        .success,
    ).toBe(false);
    expect(
      createUserSchema.parse({
        username: 'natthakan',
        displayName: 'Natthakan',
        email: '',
        password: '12345678',
      }).email,
    ).toBeNull();
  });

  it('parses csv lists in queries', () => {
    const q = listDefectsQuerySchema.parse({ status: 'new,open', page: '2' });
    expect(q.status).toEqual(['new', 'open']);
    expect(q.page).toBe(2);
    expect(listDefectsQuerySchema.safeParse({ status: 'new,bogus' }).success).toBe(false);
  });

  it('requires exactly one import target suite and a title/code column', () => {
    const base = {
      uploadId: '3f8a7c1e-2b4d-4c6e-9f10-1a2b3c4d5e6f',
      sheet: 'S',
      headerRow: 30,
      columns: [{ col: 5, target: 'title' }],
    };
    expect(importRunSchema.safeParse({ ...base, suiteId: 1 }).success).toBe(true);
    expect(importRunSchema.safeParse(base).success).toBe(false);
    expect(
      importRunSchema.safeParse({ ...base, suiteId: 1, newSuite: { name: 'x', prefix: 'X' } })
        .success,
    ).toBe(false);
    expect(
      importRunSchema.safeParse({ ...base, suiteId: 1, columns: [{ col: 1, target: 'remark' }] })
        .success,
    ).toBe(false);
  });
});

import { describe, expect, it } from '@jest/globals';
import type { FieldDef } from '@tmt/shared';
import { caseRow, sectionRow, suiteRow } from '../../../test/unit/fixtures.js';
import {
  caseUserIds,
  cleanCustom,
  envTemplateOf,
  expandCaseSteps,
  fieldDefsOf,
  toCaseDTO,
  toSuiteDTO,
  versionData,
} from './library.mapper.js';
import { buildSectionTree } from './section-tree.js';

const defs: FieldDef[] = [
  { key: 'reg', label: 'Register', type: 'text', showInTable: true },
  { key: 'notes', label: 'Notes', type: 'longtext', showInTable: false },
  { key: 'mode', label: 'Mode', type: 'select', options: ['RTU', 'TCP'], showInTable: true },
];

describe('suite mapping', () => {
  it('reads JSON columns defensively', () => {
    expect(fieldDefsOf({ fieldDefs: defs as never })).toEqual(defs);
    expect(fieldDefsOf({ fieldDefs: 'broken' as never })).toEqual([]);
    expect(envTemplateOf({ envTemplate: ['Device', 'FW'] as never })).toEqual(['Device', 'FW']);
    expect(envTemplateOf({ envTemplate: null as never })).toEqual([]);
  });

  it('maps a suite with its case count', () => {
    expect(toSuiteDTO(suiteRow({ fieldDefs: defs as never }), 12)).toMatchObject({
      id: 2,
      prefix: 'MBS',
      caseCount: 12,
      fieldDefs: defs,
      createdAt: '2026-01-15T08:00:00.000Z',
    });
  });
});

describe('case steps', () => {
  it('expands shared steps and marks missing ones', () => {
    const shared = new Map([[7, { name: 'Login', steps: [{ action: 'Sign in', expected: '' }] }]]);
    expect(
      expandCaseSteps(
        [
          { kind: 'step', action: 'Open app' },
          { kind: 'shared', sharedStepId: 7 },
          { kind: 'shared', sharedStepId: 8 },
        ],
        shared,
      ),
    ).toEqual([
      { kind: 'step', action: 'Open app', expected: '' },
      {
        kind: 'shared',
        sharedStepId: 7,
        name: 'Login',
        steps: [{ action: 'Sign in', expected: '' }],
      },
      { kind: 'shared', sharedStepId: 8, name: '', steps: [], missing: true },
    ]);
    expect(expandCaseSteps('not steps', new Map())).toEqual([]);
  });
});

describe('toCaseDTO', () => {
  it('maps a case with display id, section path, review refs and steps', () => {
    const tree = buildSectionTree([sectionRow({ id: 1, name: 'Power' })]);
    const users = new Map([[1, { id: 1, username: 'alice', displayName: 'Alice' }]]);
    const dto = toCaseDTO(
      caseRow({ sectionId: 1, reviewerId: 1, reviewRequestedAt: new Date('2026-02-01T00:00:00Z') }),
      'MBS',
      tree,
      users,
    );
    expect(dto).toMatchObject({
      displayId: 'MBS-036',
      sectionPath: ['Power'],
      createdBy: { id: 1, username: 'alice', displayName: 'Alice' },
      review: { reviewer: { id: 1 }, requestedAt: '2026-02-01T00:00:00.000Z', reviewedBy: null },
      steps: [],
      source: null,
    });
    expect(caseUserIds(caseRow({ reviewedById: 5 }))).toEqual([1, 1, null, null, 5]);
  });

  it('stores every editable field in the version snapshot', () => {
    const data = versionData(caseRow({ title: 'x', custom: { reg: '40001' } as never }));
    expect(data).toMatchObject({ title: 'x', custom: { reg: '40001' }, status: 'ready' });
    expect(data).not.toHaveProperty('id');
  });
});

describe('cleanCustom', () => {
  it('trims values, normalises long texts and drops empty ones', () => {
    expect(cleanCustom(defs, { reg: ' 40001 ', notes: 'line 1\r\nline 2  ', mode: 'RTU' })).toEqual(
      {
        reg: '40001',
        notes: 'line 1\nline 2',
        mode: 'RTU',
      },
    );
    expect(cleanCustom(defs, { reg: '   ', notes: '\n' })).toEqual({});
  });

  it('rejects unknown fields and invalid options', () => {
    expect(() => cleanCustom(defs, { color: 'red' })).toThrow('Unknown field "color"');
    expect(() => cleanCustom(defs, { mode: 'UDP' })).toThrow('"UDP" is not an option of Mode');
  });
});

import { describe, expect, it } from '@jest/globals';
import { createDefectSchema, type ListDefectsQuery } from '@tmt/shared';
import { planRow, runCaseRow, runRow } from '../../../test/unit/fixtures.js';
import {
  defectListWhere,
  newDefectData,
  runEnvironmentText,
  transitionPatch,
} from './defect-rules.js';

const query = (over: Partial<ListDefectsQuery> = {}): ListDefectsQuery => ({
  page: 1,
  pageSize: 50,
  ...over,
});

/** The OR of the text search for `q`. */
const searchOr = (q: string) =>
  (defectListWhere(10, query({ q })).AND as { OR: unknown[] }[])[0]!.OR;

describe('defectListWhere', () => {
  it('scopes to the project and ignores empty filters', () => {
    expect(defectListWhere(10, query())).toEqual({ projectId: 10 });
    expect(defectListWhere(10, query({ status: [], severity: [], q: '' }))).toEqual({
      projectId: 10,
    });
  });

  it('filters by status, severity, release, assignee, run and plan', () => {
    expect(
      defectListWhere(
        10,
        query({
          status: ['new', 'open'],
          severity: ['critical'],
          releaseId: 3,
          assigneeId: 4,
          runId: 5,
          planId: 6,
        }),
      ),
    ).toEqual({
      projectId: 10,
      status: { in: ['new', 'open'] },
      severity: { in: ['critical'] },
      releaseId: 3,
      assigneeId: 4,
      AND: [
        { links: { some: { runCase: { runId: 5 } } } },
        { links: { some: { runCase: { run: { planId: 6 } } } } },
      ],
    });
  });

  it('searches title and Jira key, and the defect number for key-like terms', () => {
    expect(searchOr('typo')).toEqual([
      { title: { contains: 'typo', mode: 'insensitive' } },
      { externalKey: { contains: 'typo', mode: 'insensitive' } },
    ]);
    for (const term of ['bug-2', 'BUG2', '2']) {
      expect(searchOr(term)).toContainEqual({ seq: 2 });
    }
    expect(searchOr('bug-x')).toHaveLength(2);
    expect(searchOr('1234567890')).toHaveLength(2); // more than 9 digits is not a defect number
  });

  it('escapes LIKE wildcards so they match literally', () => {
    expect(searchOr('100%_\\')[0]).toEqual({
      title: { contains: '100\\%\\_\\\\', mode: 'insensitive' },
    });
  });
});

describe('transitionPatch', () => {
  const now = new Date('2026-10-01T00:00:00Z');

  it('stamps resolved and closed dates along the workflow', () => {
    expect(transitionPatch('resolved', now)).toEqual({ resolvedAt: now, closedAt: null });
    expect(transitionPatch('closed', now)).toEqual({ closedAt: now });
    expect(transitionPatch('rejected', now)).toEqual({ closedAt: now });
    expect(transitionPatch('reopened', now)).toEqual({ resolvedAt: null, closedAt: null });
    expect(transitionPatch('open', now)).toEqual({ closedAt: null });
    expect(transitionPatch('in_progress', now)).toEqual({ closedAt: null });
  });
});

describe('defect prefill from a run case', () => {
  const source = {
    rc: runCaseRow({
      procedure: 'Do Power ON',
      expected: 'Power ON works',
      actualResult: 'Nothing happens',
    }),
    run: runRow({
      environment: [
        { label: 'FW', value: '1.1.6' },
        { label: 'Unit', value: ' ' },
        { label: 'App', value: '2.0' },
      ],
    }),
    plan: planRow({ releaseId: 4 }),
  };

  it('lists the filled environment entries', () => {
    expect(runEnvironmentText(source.run)).toBe('FW: 1.1.6\nApp: 2.0');
    expect(runEnvironmentText(runRow({ environment: [{ label: 'FW', value: '' }] }))).toBeNull();
    expect(runEnvironmentText(runRow({ environment: [] }))).toBeNull();
  });

  it('prefills steps, results, environment and release from the run case', () => {
    const body = createDefectSchema.parse({ title: 'Unit ignores Power ON', assigneeId: 2 });
    expect(newDefectData(10, 7, 1, body, source)).toEqual({
      projectId: 10,
      seq: 7,
      title: 'Unit ignores Power ON',
      description: null,
      steps: 'Do Power ON',
      expected: 'Power ON works',
      actual: 'Nothing happens',
      severity: 'major',
      priority: 'medium',
      assigneeId: 2,
      reporterId: 1,
      releaseId: 4,
      foundIn: null,
      fixedIn: null,
      foundInBuildId: null,
      fixedInBuildId: null,
      environment: 'FW: 1.1.6\nApp: 2.0',
      externalKey: null,
    });
  });

  it('finds the defect in the build the run was tested on unless another is sent', () => {
    const onBuild = { ...source, run: runRow({ ...source.run, buildId: 8 }) };
    const plain = createDefectSchema.parse({ title: 'x' });
    expect(newDefectData(10, 7, 1, plain, onBuild).foundInBuildId).toBe(8);
    const own = createDefectSchema.parse({ title: 'x', foundInBuildId: 9, fixedInBuildId: 10 });
    expect(newDefectData(10, 7, 1, own, onBuild)).toMatchObject({
      foundInBuildId: 9,
      fixedInBuildId: 10,
    });
    const cleared = createDefectSchema.parse({ title: 'x', foundInBuildId: null });
    expect(newDefectData(10, 7, 1, cleared, onBuild).foundInBuildId).toBeNull();
  });

  it('keeps explicit values, also cleared ones, over the prefill', () => {
    const body = createDefectSchema.parse({
      title: 'x',
      steps: '',
      expected: 'Mine',
      actual: null,
      releaseId: null,
      environment: 'Lab',
      severity: 'trivial',
    });
    expect(newDefectData(10, 1, 1, body, source)).toMatchObject({
      steps: null,
      expected: 'Mine',
      actual: null,
      releaseId: null,
      environment: 'Lab',
      severity: 'trivial',
    });
  });

  it('leaves everything empty without a source', () => {
    const body = createDefectSchema.parse({ title: 'Typo', foundIn: '1.0', externalKey: 'X-1' });
    expect(newDefectData(10, 2, 3, body, null)).toMatchObject({
      steps: null,
      expected: null,
      actual: null,
      releaseId: null,
      environment: null,
      foundIn: '1.0',
      externalKey: 'X-1',
      reporterId: 3,
    });
  });
});

import { describe, expect, it } from '@jest/globals';
import {
  addRunCasesSchema,
  bulkCasesSchema,
  createCaseSchema,
  createRunSchema,
  createSharedStepSchema,
  createTokenSchema,
  flattenSteps,
  formatMinutes,
  jiraConfigSchema,
  jiraLinkSchema,
  junitImportQuerySchema,
  listCasesQuerySchema,
  rerunSchema,
  setResultSchema,
  stepsToText,
  suggestStatusFromSteps,
  worstStatus,
  type CaseStepDTO,
} from '../src';

describe('v1.1 library schemas', () => {
  it('defaults the new case fields', () => {
    const c = createCaseSchema.parse({ title: 'Power ON' });
    expect(c).toMatchObject({ priority: 'medium', tags: [], template: 'text', steps: [] });
  });

  it('dedupes tags case-insensitively and trims them', () => {
    const c = createCaseSchema.parse({
      title: 'x',
      tags: [' Smoke ', 'smoke', 'Regression', ''].filter(Boolean),
    });
    expect(c.tags).toEqual(['Smoke', 'Regression']);
  });

  it('accepts inline and shared steps, rejects unknown kinds', () => {
    const c = createCaseSchema.parse({
      title: 'x',
      template: 'steps',
      steps: [
        { kind: 'step', action: 'Open app' },
        { kind: 'shared', sharedStepId: '7' },
      ],
    });
    expect(c.steps).toEqual([
      { kind: 'step', action: 'Open app', expected: '' },
      { kind: 'shared', sharedStepId: 7 },
    ]);
    expect(createCaseSchema.safeParse({ title: 'x', steps: [{ kind: 'other' }] }).success).toBe(
      false,
    );
  });

  it('parses priority lists and review filters from the query string', () => {
    const q = listCasesQuerySchema.parse({
      priority: 'critical,high',
      tag: 'smoke',
      unsectioned: 'true',
    });
    expect(q.priority).toEqual(['critical', 'high']);
    expect(q.unsectioned).toBe(true);
    expect(listCasesQuerySchema.safeParse({ priority: 'urgent' }).success).toBe(false);
  });

  it('supports review bulk actions', () => {
    expect(bulkCasesSchema.parse({ action: 'submitReview', ids: [1, 2] })).toMatchObject({
      action: 'submitReview',
    });
    expect(bulkCasesSchema.parse({ action: 'approve', ids: [1] }).action).toBe('approve');
  });

  it('requires at least one step in a shared step', () => {
    expect(createSharedStepSchema.safeParse({ name: 'Login', steps: [] }).success).toBe(false);
    expect(
      createSharedStepSchema.parse({ name: 'Login', steps: [{ action: 'Sign in' }] }).steps,
    ).toEqual([{ action: 'Sign in', expected: '' }]);
  });
});

describe('v1.1 execution schemas', () => {
  it('adds case filters to run creation', () => {
    const r = createRunSchema.parse({
      suiteId: 1,
      code: 'Test ID 1',
      priorities: ['high'],
      tags: ['smoke'],
    });
    expect(r.caseStatuses).toEqual(['ready']);
    expect(r.priorities).toEqual(['high']);
    expect(addRunCasesSchema.parse({ caseIds: [3] }).caseIds).toEqual([3]);
  });

  it('defaults a re-run to NG + Blocked with the source environment', () => {
    expect(rerunSchema.parse({ code: 'Test ID 1 (rerun)' })).toMatchObject({
      statuses: ['ng', 'blocked'],
      copyEnvironment: true,
      keepAssignees: true,
      refreshFromLibrary: false,
    });
  });

  it('accepts step results and null to clear them', () => {
    const r = setResultSchema.parse({
      status: 'ng',
      stepResults: [{ status: 'ok' }, { status: 'ng', actual: 'No response' }],
    });
    expect(r.stepResults).toEqual([
      { status: 'ok', actual: '' },
      { status: 'ng', actual: 'No response' },
    ]);
    expect(setResultSchema.parse({ status: 'ok', stepResults: null }).stepResults).toBeNull();
  });

  it('parses JUnit import options from the query string', () => {
    expect(junitImportQuerySchema.parse({ dryRun: '1' })).toEqual({
      matchBy: 'auto',
      dryRun: true,
      createMissing: false,
      skippedAs: 'nt',
    });
  });
});

describe('v1.1 integration schemas', () => {
  it('normalises the Jira URL and keys', () => {
    const c = jiraConfigSchema.parse({
      baseUrl: 'https://jira.example.local/',
      projectKey: 'team',
    });
    expect(c).toMatchObject({
      baseUrl: 'https://jira.example.local',
      projectKey: 'TEAM',
      issueType: 'Bug',
      authType: 'pat',
    });
    expect(jiraConfigSchema.safeParse({ baseUrl: 'ftp://x', projectKey: 'A' }).success).toBe(false);
    expect(
      jiraConfigSchema.safeParse({
        baseUrl: 'https://x.atlassian.net',
        projectKey: 'A',
        authType: 'basic',
      }).success,
    ).toBe(false);
    expect(jiraLinkSchema.parse({ key: ' team-12 ' }).key).toBe('TEAM-12');
    expect(jiraLinkSchema.safeParse({ key: 'TEAM' }).success).toBe(false);
  });

  it('validates token creation', () => {
    expect(createTokenSchema.parse({ name: 'CI' })).toEqual({ name: 'CI' });
    expect(createTokenSchema.safeParse({ name: 'CI', expiresInDays: 0 }).success).toBe(false);
  });
});

describe('step helpers', () => {
  const steps: CaseStepDTO[] = [
    { kind: 'step', action: 'Open the app', expected: 'Home screen shows' },
    {
      kind: 'shared',
      sharedStepId: 1,
      name: 'Login',
      steps: [{ action: 'Sign in', expected: '' }],
    },
    { kind: 'shared', sharedStepId: 2, name: 'Gone', steps: [], missing: true },
  ];

  it('flattens shared steps in place', () => {
    expect(flattenSteps(steps)).toEqual([
      { action: 'Open the app', expected: 'Home screen shows', sharedStepName: null },
      { action: 'Sign in', expected: '', sharedStepName: 'Login' },
    ]);
  });

  it('renders steps as numbered text', () => {
    expect(stepsToText(flattenSteps(steps))).toEqual({
      procedure: '1. Open the app\n2. Sign in',
      expected: '1. Home screen shows',
    });
  });

  it('combines statuses worst-first', () => {
    expect(worstStatus(['ok', 'na', 'ok_cond'])).toBe('ok_cond');
    expect(worstStatus(['ok', 'nt'])).toBe('nt');
    expect(worstStatus(['blocked', 'ng'])).toBe('ng');
    expect(worstStatus([])).toBeNull();
    expect(suggestStatusFromSteps(['ok', 'untested'])).toBeNull();
    expect(suggestStatusFromSteps(['na', 'na'])).toBe('na');
    expect(suggestStatusFromSteps(['ok', 'na'])).toBe('ok');
  });

  it('formats minutes', () => {
    expect(formatMinutes(90)).toBe('1h 30m');
    expect(formatMinutes(45)).toBe('45m');
    expect(formatMinutes(120)).toBe('2h');
    expect(formatMinutes(null)).toBe('');
  });
});

describe('update schemas never inject defaults', () => {
  it('keeps unspecified release and defect fields undefined', async () => {
    const { updateReleaseSchema, updateDefectSchema, suggestDocNo } = await import('../src');
    expect(updateReleaseSchema.parse({ name: 'R2' })).toEqual({ name: 'R2' });
    expect(updateDefectSchema.parse({ title: 'x' })).toEqual({ title: 'x' });
    expect(suggestDocNo([], new Date(2026, 9, 1), '')).toBe('26TR-TEAM-10-1');
  });
});

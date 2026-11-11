import { describe, expect, it } from '@jest/globals';
import { RESULT_LABELS } from '@tmt/shared';
import { member } from '../cases/test-utils';
import {
  assignableMembers,
  countsOf,
  effectiveAssignee,
  groupBySection,
  hasFilters,
  makeMatcher,
  NO_FILTERS,
  pathKey,
  sectionOptions,
  statusLabelOf,
  suggestRerunCode,
  tagOptions,
  type RunFilters,
} from './run-cases';
import { alice, bob, makeRunCase } from './test-fixtures';

const a = makeRunCase({ id: 1, sectionPath: ['Power'], status: 'ok', tags: ['Smoke'] });
const b = makeRunCase({
  id: 2,
  displayId: 'UOT-002',
  code: null,
  title: 'Wi-Fi pairing',
  references: null,
  sectionPath: ['Network', 'Wi-Fi'],
  priority: 'low',
  tags: ['wifi', 'smoke'],
  assignee: bob,
  status: 'ng',
});
const c = makeRunCase({ id: 3, sectionPath: [], tags: [], status: 'untested' });
const d = makeRunCase({ id: 4, sectionPath: ['Network'], status: 'untested', tags: ['APP'] });

const match = (f: Partial<RunFilters>, tester = alice, meId: number | null = 1) =>
  [a, b, c, d].filter(makeMatcher({ ...NO_FILTERS, ...f }, { tester }, meId)).map((x) => x.id);

describe('filters', () => {
  it('detects active filters', () => {
    expect(hasFilters(NO_FILTERS)).toBe(false);
    expect(hasFilters({ ...NO_FILTERS, q: 'x' })).toBe(true);
    expect(hasFilters({ ...NO_FILTERS, status: ['ng'] })).toBe(true);
    expect(hasFilters({ ...NO_FILTERS, assignee: 'none' })).toBe(true);
    expect(hasFilters({ ...NO_FILTERS, priority: ['low'] })).toBe(true);
    expect(hasFilters({ ...NO_FILTERS, tag: 'x' })).toBe(true);
    expect(hasFilters({ ...NO_FILTERS, section: 'Power' })).toBe(true);
  });

  it('matches status, priority, tag (case-insensitive) and section prefixes', () => {
    expect(match({})).toEqual([1, 2, 3, 4]);
    expect(match({ status: ['ng', 'untested'] })).toEqual([2, 3, 4]);
    expect(match({ priority: ['low'] })).toEqual([2]);
    expect(match({ tag: 'SMOKE' })).toEqual([1, 2]);
    expect(match({ section: 'Network' })).toEqual([2, 4]);
    expect(match({ section: 'Network › Wi-Fi' })).toEqual([2]);
    expect(match({ section: 'Net' })).toEqual([]);
  });

  it('matches the effective assignee', () => {
    expect(match({ assignee: 'me' })).toEqual([1, 3, 4]);
    expect(match({ assignee: 'me' }, alice, null)).toEqual([]);
    expect(match({ assignee: 2 })).toEqual([2]);
    expect(match({ assignee: 'none' })).toEqual([]);
    expect(match({ assignee: 'none' }, null as never)).toEqual([1, 3, 4]);
  });

  it('needs every search word in id, code, title or references', () => {
    expect(match({ q: 'uot-002 wi-fi' })).toEqual([2]);
    expect(match({ q: '  REQ-1 ' })).toEqual([1, 3, 4]);
    expect(match({ q: '1-1 power' })).toEqual([1, 3, 4]);
    expect(match({ q: 'nothing' })).toEqual([]);
  });
});

describe('grouping and options', () => {
  it('groups by full section path in first-appearance order with counts', () => {
    const groups = groupBySection([a, b, c, d, makeRunCase({ id: 5, sectionPath: ['Power'] })]);
    expect(groups.map((g) => [g.key, g.cases.map((x) => x.id)])).toEqual([
      ['Power', [1, 5]],
      ['Network › Wi-Fi', [2]],
      ['', [3]],
      ['Network', [4]],
    ]);
    expect(groups[0]!.counts).toMatchObject({ ok: 1, untested: 1 });
    expect(pathKey(['A', 'B'])).toBe('A › B');
  });

  it('lists every section prefix with depth and counts', () => {
    expect(sectionOptions([a, b, c, d])).toEqual([
      { value: 'Power', label: 'Power', depth: 0, count: 1 },
      { value: 'Network', label: 'Network', depth: 0, count: 2 },
      { value: 'Network › Wi-Fi', label: 'Wi-Fi', depth: 1, count: 1 },
    ]);
  });

  it('lists distinct tags alphabetically, first spelling wins', () => {
    expect(tagOptions([a, b, c, d])).toEqual(['APP', 'Smoke', 'wifi']);
  });

  it('counts statuses and labels them', () => {
    expect(countsOf([a, b, c])).toMatchObject({ ok: 1, ng: 1, untested: 1, na: 0 });
    expect(statusLabelOf('untested', RESULT_LABELS)).toBe('Untested');
    expect(statusLabelOf('ok_cond', RESULT_LABELS)).toBe('OK w/ cond.');
  });

  it('resolves the effective assignee', () => {
    expect(effectiveAssignee(b, { tester: alice })).toEqual({ user: bob, inherited: false });
    expect(effectiveAssignee(a, { tester: alice })).toEqual({ user: alice, inherited: true });
    expect(effectiveAssignee(a, { tester: null })).toEqual({ user: null, inherited: false });
  });

  it('suggests re-run codes', () => {
    expect(suggestRerunCode('KR_01')).toBe('KR_01_R2');
    expect(suggestRerunCode('KR_01_R2')).toBe('KR_01_R3');
    expect(suggestRerunCode('x'.repeat(60))).toHaveLength(60);
  });

  it('offers testers and leads as assignees', () => {
    expect(
      assignableMembers([
        member(3, 'Zoe Tester', 'tester'),
        member(4, 'Vic Viewer', 'viewer'),
        member(2, 'Bob Lead', 'lead'),
      ]),
    ).toEqual([
      { value: '2', label: 'Bob Lead' },
      { value: '3', label: 'Zoe Tester' },
    ]);
  });
});

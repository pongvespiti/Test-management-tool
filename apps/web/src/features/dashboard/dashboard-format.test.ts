import { describe, expect, it } from '@jest/globals';
import { userRef } from '@/features/cases/test-utils';
import { makeDashboard } from '@/features/reports/test-fixtures';
import {
  attentionDetail,
  attentionMeta,
  defectMeta,
  periodOf,
  planStatusParts,
  releaseLabel,
} from './dashboard-format';

const [ng, okCond] = makeDashboard().attention as [
  ReturnType<typeof makeDashboard>['attention'][number],
  ReturnType<typeof makeDashboard>['attention'][number],
];
const defect = makeDashboard().openDefects[0]!;

describe('dashboard formatting', () => {
  it('labels the active release', () => {
    expect(releaseLabel({ name: 'FW 2.4', status: 'active' })).toBe('FW 2.4 (active)');
    expect(releaseLabel({ name: 'FW 3.0', status: 'planned' })).toBe('FW 3.0');
  });

  it('describes the test period', () => {
    expect(periodOf({ startDate: '2026-10-01', endDate: '2026-10-31' })).toBe(
      'Test period Oct 1, 2026 – Oct 31, 2026',
    );
    expect(periodOf({ startDate: '2026-10-01', endDate: null })).toBe('Started Oct 1, 2026');
    expect(periodOf({ startDate: null, endDate: '2026-10-31' })).toBe('Ends Oct 31, 2026');
    expect(periodOf({ startDate: null, endDate: null })).toBe('No test period set');
  });

  it('lists the plan statuses that have plans', () => {
    expect(planStatusParts({ draft: 2, in_progress: 0, completed: 1 })).toEqual([
      '2 draft',
      '1 completed',
    ]);
    expect(planStatusParts({ draft: 0, in_progress: 0, completed: 0 })).toEqual([]);
  });

  it('explains a result with the actual result or the remark', () => {
    expect(attentionDetail(ng)).toBe('Unit does not start');
    expect(attentionDetail({ ...ng, actualResult: null, resultRemark: 'See log' })).toBe('See log');
    expect(attentionDetail(okCond)).toBe('Within tolerance');
    expect(attentionDetail({ ...okCond, resultRemark: null })).toBe('Stops after 61 s');
    expect(attentionDetail({ ...ng, actualResult: null, resultRemark: null })).toBeNull();
  });

  it('builds the meta line of a result and a defect', () => {
    expect(attentionMeta(ng)).toBe('Run KR_01 · 26TR-TEAM-10-001 · Alice Tester · Oct 20, 2026');
    expect(attentionMeta(okCond)).toBe('Run KR_01 · 26TR-TEAM-10-001');
    expect(defectMeta(defect)).toBe('BUG-12 · Major · Unassigned · ACS-77');
    expect(defectMeta({ ...defect, assignee: userRef(1, 'Alice'), externalKey: null })).toBe(
      'BUG-12 · Major · Alice',
    );
  });
});

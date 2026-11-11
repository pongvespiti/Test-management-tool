import { describe, expect, it } from '@jest/globals';
import type { FieldDef } from '@tmt/shared';
import { diffCaseVersions } from './case-diff';

const defs: FieldDef[] = [{ key: 'test_id', label: 'Test ID', type: 'text', showInTable: true }];
const sectionName = (id: number) => (id === 11 ? 'Power' : null);

describe('diffCaseVersions', () => {
  it('lists changed fields with readable before/after values', () => {
    const prev = {
      title: 'Power on',
      sectionId: 11,
      status: 'draft',
      priority: 'medium',
      tags: [],
      estimateMinutes: 0,
      template: 'text',
      steps: [],
      code: null,
    };
    const curr = {
      title: 'Power on twice',
      sectionId: 12,
      status: 'ready',
      priority: 'critical',
      tags: ['smoke', 'wifi'],
      estimateMinutes: 90,
      template: 'steps',
      steps: [
        { kind: 'step', action: 'Press ON', expected: 'Starts' },
        { kind: 'step', action: 'Wait', expected: '' },
        { kind: 'shared', sharedStepId: 5 },
        null,
      ],
      code: '1-1',
    };
    expect(diffCaseVersions(curr, prev, defs, sectionName)).toEqual([
      { label: 'Title', before: 'Power on', after: 'Power on twice' },
      { label: 'Case code', before: '—', after: '1-1' },
      { label: 'Section', before: 'Power', after: '#12' },
      { label: 'Status', before: 'Draft', after: 'Ready' },
      { label: 'Priority', before: 'Medium', after: 'Critical' },
      { label: 'Tags', before: '—', after: 'smoke, wifi' },
      { label: 'Estimate', before: '—', after: '1h 30m' },
      { label: 'Template', before: 'Text', after: 'Steps' },
      {
        label: 'Steps',
        before: '—',
        after: '1. Press ON → Starts\n2. Wait\n3. [Shared steps #5]\n4. ',
      },
    ]);
  });

  it('shows unknown values as they are', () => {
    const changes = diffCaseVersions(
      { status: 'archived', priority: 'urgent', template: 'table', remark: { a: 1 }, steps: 'x' },
      { status: 3, priority: null, template: null, remark: 'old', steps: [] },
      defs,
    );
    expect(changes).toEqual([
      { label: 'Status', before: '3', after: 'archived' },
      { label: 'Priority', before: '—', after: 'urgent' },
      { label: 'Template', before: '—', after: 'table' },
      { label: 'Remark', before: 'old', after: '{"a":1}' },
    ]);
  });

  it('skips fields absent from both and default values of pre-v1.1 snapshots', () => {
    expect(
      diffCaseVersions(
        { title: 'A', priority: 'medium', tags: [], template: 'text', estimateMinutes: null },
        { title: 'A' },
        defs,
      ),
    ).toEqual([]);
    expect(diffCaseVersions({ title: 'A', priority: 'high' }, { title: 'A' }, defs)).toEqual([
      { label: 'Priority', before: '—', after: 'High' },
    ]);
  });

  it('compares custom fields by their label (or key)', () => {
    expect(
      diffCaseVersions(
        { custom: { test_id: 'T-2', other: 'x', same: 'y' } },
        { custom: { test_id: 'T-1', same: 'y' } },
        defs,
      ),
    ).toEqual([
      { label: 'Test ID', before: 'T-1', after: 'T-2' },
      { label: 'other', before: '—', after: 'x' },
    ]);
    expect(diffCaseVersions({ custom: ['bad'] }, { custom: null }, defs)).toEqual([]);
  });
});

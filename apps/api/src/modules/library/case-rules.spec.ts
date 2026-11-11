import { describe, expect, it } from '@jest/globals';
import { caseRow } from '../../../test/unit/fixtures.js';
import { createPrismaMock } from '../../../test/unit/prisma-mock.js';
import {
  assertReviewer,
  assertSharedSteps,
  assertStatusChange,
  createStatus,
  loadReviewPolicy,
  normalizeSteps,
  reviewableChanged,
  reviewEnforced,
} from './case-rules.js';

const enforced = { required: true, isLead: false };
const lead = { required: true, isLead: true };
const open = { required: false, isLead: false };

describe('review policy', () => {
  it('loads the project setting and the caller role', async () => {
    const { db } = createPrismaMock();
    db.project.findUnique.mockResolvedValue({ requireCaseReview: true } as never);
    await expect(loadReviewPolicy(db, 10, 'tester')).resolves.toEqual(enforced);
    await expect(loadReviewPolicy(db, 10, 'lead')).resolves.toEqual(lead);
    expect(reviewEnforced(enforced)).toBe(true);
    expect(reviewEnforced(lead)).toBe(false);
  });

  it('turns ready into draft for new cases when a review is required', () => {
    expect(createStatus('ready', enforced)).toBe('draft');
    expect(createStatus('ready', lead)).toBe('ready');
    expect(createStatus('deprecated', enforced)).toBe('deprecated');
    expect(() => createStatus('in_review', open)).toThrow(
      expect.objectContaining({ code: 'USE_REVIEW_ENDPOINT' }),
    );
  });

  it('guards explicit status changes', () => {
    expect(() => assertStatusChange('draft', 'ready', enforced)).toThrow(
      expect.objectContaining({ code: 'REVIEW_REQUIRED' }),
    );
    expect(() => assertStatusChange('draft', 'in_review', lead)).toThrow(
      expect.objectContaining({ code: 'USE_REVIEW_ENDPOINT' }),
    );
    expect(() => assertStatusChange('ready', 'ready', enforced)).not.toThrow();
    expect(() => assertStatusChange(null, 'deprecated', enforced)).not.toThrow();
  });
});

describe('steps', () => {
  it('keeps known keys only and normalises texts (indentation is kept)', () => {
    expect(
      normalizeSteps([
        { kind: 'step', action: '  Open app  ', expected: 'Home\r\nscreen ' },
        { kind: 'shared', sharedStepId: 3, extra: 1 } as never,
      ]),
    ).toEqual([
      { kind: 'step', action: '  Open app', expected: 'Home\nscreen' },
      { kind: 'shared', sharedStepId: 3 },
    ]);
  });

  it('requires shared steps of the same project', async () => {
    const { db } = createPrismaMock();
    db.sharedStep.findMany.mockResolvedValue([{ id: 3 }] as never);
    await expect(
      assertSharedSteps(db, 10, [
        { kind: 'shared', sharedStepId: 3 },
        { kind: 'shared', sharedStepId: 4 },
      ]),
    ).rejects.toMatchObject({ code: 'BAD_SHARED_STEP', details: { sharedStepIds: [4] } });
    expect(db.sharedStep.findMany.mock.calls[0]![0]!.where).toEqual({
      projectId: 10,
      id: { in: [3, 4] },
    });
    await expect(
      assertSharedSteps(db, 10, [{ kind: 'step', action: 'x', expected: '' }]),
    ).resolves.toBeUndefined();
  });
});

describe('reviewableChanged', () => {
  const c = caseRow({
    title: 'A',
    custom: { reg: '1' } as never,
    steps: [{ kind: 'step', action: 'x', expected: '' }] as never,
  });

  it('ignores unchanged values', () => {
    expect(reviewableChanged(c, { title: 'A', custom: { reg: '1' } })).toBe(false);
    expect(reviewableChanged(c, { steps: [{ kind: 'step', action: 'x', expected: '' }] })).toBe(
      false,
    );
  });

  it('detects real changes of reviewable fields', () => {
    expect(reviewableChanged(c, { title: 'B' })).toBe(true);
    expect(reviewableChanged(c, { expected: 'new' })).toBe(true);
    expect(reviewableChanged(c, { custom: { reg: '2' } })).toBe(true);
    expect(reviewableChanged(c, { steps: [] })).toBe(true);
  });
});

describe('assertReviewer', () => {
  it('accepts active leads and administrators only', async () => {
    const { db } = createPrismaMock();
    db.user.findUnique.mockResolvedValueOnce({
      isAdmin: false,
      isActive: true,
      memberships: [{ role: 'lead' }],
    } as never);
    await expect(assertReviewer(db, 10, 5)).resolves.toBeUndefined();
    db.user.findUnique.mockResolvedValueOnce({
      isAdmin: true,
      isActive: true,
      memberships: [],
    } as never);
    await expect(assertReviewer(db, 10, 6)).resolves.toBeUndefined();
    db.user.findUnique.mockResolvedValueOnce({
      isAdmin: false,
      isActive: true,
      memberships: [{ role: 'tester' }],
    } as never);
    await expect(assertReviewer(db, 10, 7)).rejects.toMatchObject({ code: 'BAD_REVIEWER' });
    db.user.findUnique.mockResolvedValueOnce({
      isAdmin: true,
      isActive: false,
      memberships: [],
    } as never);
    await expect(assertReviewer(db, 10, 8)).rejects.toMatchObject({ code: 'BAD_REVIEWER' });
    await expect(assertReviewer(db, 10, null)).resolves.toBeUndefined();
  });
});

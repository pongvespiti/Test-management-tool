import { describe, expect, it } from '@jest/globals';
import {
  caseRow,
  defectRow,
  planRow,
  runCaseRow,
  runRow,
  suiteRow,
} from '../../../test/unit/fixtures.js';
import { createPrismaMock } from '../../../test/unit/prisma-mock.js';
import { evidenceLocked, isLockedByPlan, resolveEntity } from './entities.queries.js';

describe('resolveEntity', () => {
  it('labels run cases and plans and returns their plan', async () => {
    const { db } = createPrismaMock();
    const plan = planRow({ docNo: 'D-1', status: 'completed' });
    db.runCase.findFirst.mockResolvedValue({
      ...runCaseRow({ displayId: 'MBS-036' }),
      run: { ...runRow(), plan },
    } as never);
    await expect(resolveEntity(db, 10, 'run_case', 50)).resolves.toEqual({
      label: 'MBS-036',
      plan,
    });
    expect(db.runCase.findFirst.mock.calls[0]![0]!.where).toEqual({
      id: 50,
      run: { plan: { projectId: 10 } },
    });
    db.testPlan.findFirst.mockResolvedValue(plan);
    await expect(resolveEntity(db, 10, 'plan', 7)).resolves.toEqual({ label: 'D-1', plan });
  });

  it('labels defects, test cases and comments without a plan', async () => {
    const { db } = createPrismaMock();
    db.defect.findFirst.mockResolvedValue(defectRow({ seq: 4 }));
    await expect(resolveEntity(db, 10, 'defect', 30)).resolves.toEqual({
      label: 'BUG-4',
      plan: null,
    });
    db.testCase.findFirst.mockResolvedValue({
      ...caseRow({ seq: 36 }),
      suite: suiteRow({ prefix: 'MBS' }),
    } as never);
    await expect(resolveEntity(db, 10, 'test_case', 100)).resolves.toEqual({
      label: 'MBS-036',
      plan: null,
    });
    db.comment.findFirst.mockResolvedValue({ id: 8 } as never);
    await expect(resolveEntity(db, 10, 'comment', 8)).resolves.toEqual({
      label: 'comment #8',
      plan: null,
    });
    expect(db.comment.findFirst.mock.calls[0]![0]!.where).toEqual({ id: 8, projectId: 10 });
  });

  it('answers with the not-found code of each type and refuses other types', async () => {
    const { db } = createPrismaMock();
    db.runCase.findFirst.mockResolvedValue(null);
    db.testPlan.findFirst.mockResolvedValue(null);
    db.defect.findFirst.mockResolvedValue(null);
    db.testCase.findFirst.mockResolvedValue(null);
    db.comment.findFirst.mockResolvedValue(null);
    const codes = await Promise.all(
      (['run_case', 'plan', 'defect', 'test_case', 'comment', 'template'] as const).map((type) =>
        resolveEntity(db, 10, type, 1).catch((e: { code: string; getStatus(): number }) => [
          e.code,
          e.getStatus(),
        ]),
      ),
    );
    expect(codes).toEqual([
      ['RUN_CASE_NOT_FOUND', 404],
      ['PLAN_NOT_FOUND', 404],
      ['DEFECT_NOT_FOUND', 404],
      ['CASE_NOT_FOUND', 404],
      ['COMMENT_NOT_FOUND', 404],
      ['BAD_ENTITY', 422],
    ]);
  });
});

describe('evidence lock', () => {
  it('locks run case and plan evidence of completed plans only', () => {
    const completed = { label: 'x', plan: planRow({ status: 'completed' }) };
    const open = { label: 'x', plan: planRow({ status: 'in_progress' }) };
    expect(isLockedByPlan('run_case', completed)).toBe(true);
    expect(isLockedByPlan('plan', completed)).toBe(true);
    expect(isLockedByPlan('defect', completed)).toBe(false);
    expect(isLockedByPlan('run_case', open)).toBe(false);
    expect(isLockedByPlan('plan', { label: 'x', plan: null })).toBe(false);
  });

  it('explains the lock with the plan number', () => {
    const e = evidenceLocked('D-1');
    expect(e.getStatus()).toBe(409);
    expect(e.code).toBe('PLAN_LOCKED');
    expect(e.message).toBe('Test plan D-1 is completed — reopen it to change its evidence');
  });
});

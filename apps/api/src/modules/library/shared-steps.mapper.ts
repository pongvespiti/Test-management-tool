import type { SharedStep } from '@tmt/database';
import {
  normalizeText,
  type CaseStepInput,
  type PlainStepDTO,
  type SharedStepDTO,
  type UserRef,
} from '@tmt/shared';
import { refOf } from '../../common/users/user-refs.js';

/** Steps stored in `shared_steps.steps`, read defensively. */
export function plainStepsOf(v: unknown): PlainStepDTO[] {
  return Array.isArray(v)
    ? (v as Partial<PlainStepDTO>[]).map((s) => ({
        action: s.action ?? '',
        expected: s.expected ?? '',
      }))
    : [];
}

/** Canonical stored form of shared steps: texts normalised like case texts. */
export function normalizePlainSteps(
  steps: readonly { action: string; expected?: string }[],
): PlainStepDTO[] {
  return steps.map((s) => ({
    action: normalizeText(s.action) ?? '',
    expected: normalizeText(s.expected ?? '') ?? '',
  }));
}

export function toSharedStepDTO(
  row: SharedStep,
  usageCount: number,
  users: Map<number, UserRef>,
): SharedStepDTO {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    description: row.description,
    steps: plainStepsOf(row.steps),
    version: row.version,
    usageCount,
    createdBy: refOf(users, row.createdById),
    updatedBy: refOf(users, row.updatedById),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Replaces references to shared step `id` with its steps as plain steps. */
export function inlineSharedStep(
  steps: readonly CaseStepInput[],
  id: number,
  plain: readonly PlainStepDTO[],
): CaseStepInput[] {
  return steps.flatMap((s): CaseStepInput[] =>
    s.kind === 'shared' && s.sharedStepId === id
      ? plain.map((p) => ({ kind: 'step', action: p.action, expected: p.expected }))
      : [s],
  );
}

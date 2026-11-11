import { createSharedStepSchema, type SharedStepDTO } from '@tmt/shared';
import { isBlankStep, plainStep, type EditorStep } from '@/features/cases/case-form-model';
import { schemaErrors, type FlatErrors } from '@/lib/form-errors';

/** Shared step sets hold plain steps only (`createSharedStepSchema`: 1–100 steps). */
export const MAX_SHARED_STEPS = 100;

export interface SharedStepFormValues {
  name: string;
  description: string;
  steps: EditorStep[];
}

/** Form values of a set (a new set starts with one empty step). */
export function toSharedStepValues(s: SharedStepDTO | null): SharedStepFormValues {
  return {
    name: s?.name ?? '',
    description: s?.description ?? '',
    steps:
      s && s.steps.length > 0 ? s.steps.map((p) => plainStep(p.action, p.expected)) : [plainStep()],
  };
}

/** Request body; `keepBlank` keeps row indexes aligned for validation messages. */
export function toSharedStepBody(v: SharedStepFormValues, keepBlank = false) {
  return {
    name: v.name,
    description: v.description,
    steps: (keepBlank ? v.steps : v.steps.filter((s) => !isBlankStep(s))).flatMap((s) =>
      s.kind === 'step' ? [{ action: s.action, expected: s.expected }] : [],
    ),
  };
}

/** Errors by form field (`name`, `steps`, `steps.<row>.action` …); at least one step is required. */
export function validateSharedStepForm(v: SharedStepFormValues): FlatErrors {
  const errors = schemaErrors(createSharedStepSchema, toSharedStepBody(v, true));
  if (v.steps.every(isBlankStep)) errors.steps = 'Add at least one step';
  return errors;
}

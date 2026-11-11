import { RESULT_LABELS, stepsToText, type RunCaseDTO, type RunDTO } from '@tmt/shared';
import type { DefectPrefill } from '../defects/defect-model';
import type { ResultDraft } from './drafts';

/** Environment labels whose values name the build a defect was found in. */
const FOUND_IN_LABEL = /(\bfw\b|firmware|version|build)/i;

/** Defect fields from a run case result (steps, expectation, actual incl. failed steps, env). */
export function defectPrefill(
  rc: RunCaseDTO,
  run: Pick<RunDTO, 'environment'>,
  draft: ResultDraft | null,
): DefectPrefill {
  const text =
    rc.steps.length > 0
      ? stepsToText(rc.steps)
      : { procedure: rc.procedure ?? '', expected: rc.expected ?? '' };
  const steps = [rc.precondition ? `Precondition:\n${rc.precondition.trim()}` : '', text.procedure]
    .filter((s) => s.trim() !== '')
    .join('\n\n');
  const actual: string[] = [];
  const caseActual = (draft ? draft.actualResult : rc.actualResult) ?? '';
  if (caseActual.trim()) actual.push(caseActual.trim());
  const stepResults = draft ? draft.stepResults : (rc.stepResults ?? []);
  stepResults.forEach((s, i) => {
    if (s.status === 'ng' || s.status === 'blocked')
      actual.push(`Step ${i + 1} (${RESULT_LABELS[s.status]}): ${s.actual.trim() || '—'}`);
  });
  const filled = run.environment.filter((e) => e.value.trim() !== '');
  return {
    title: `[${rc.displayId}] ${rc.title}`.slice(0, 300),
    steps: steps.slice(0, 20000),
    expected: text.expected.slice(0, 20000),
    actual: actual.join('\n').slice(0, 20000),
    environment: filled
      .map((e) => `${e.label}: ${e.value}`)
      .join('\n')
      .slice(0, 2000),
    foundIn: filled
      .filter((e) => FOUND_IN_LABEL.test(e.label))
      .map((e) => `${e.label} ${e.value}`)
      .join(' · ')
      .slice(0, 300),
  };
}

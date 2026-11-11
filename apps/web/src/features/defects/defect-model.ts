/** Pure helpers of the defect pages: form values, workflow wording, Jira links and errors. */
import {
  createDefectSchema,
  DEFECT_STATUS_LABELS,
  type DefectDTO,
  type DefectPriority,
  type DefectSeverity,
  type DefectStatus,
} from '@tmt/shared';
import type { z } from 'zod';
import { ApiError } from '@/lib/api/client';

/** Prefill for a new defect (e.g. from an NG result). */
export interface DefectPrefill {
  title?: string;
  description?: string;
  steps?: string;
  expected?: string;
  actual?: string;
  severity?: DefectSeverity;
  priority?: DefectPriority;
  assigneeId?: number | null;
  releaseId?: number | null;
  foundIn?: string;
  foundInBuildId?: number | null;
  environment?: string;
}

/** Fields of the defect form (the run case link is added when a result creates the defect). */
export const defectFormSchema = createDefectSchema.omit({ runCaseId: true });
export type DefectFormValues = z.input<typeof defectFormSchema>;

/**
 * Form values of an existing defect, or of a new one from the prefill. The external key is part of
 * the form (and of the request) only when it is shown, i.e. without the Jira integration.
 */
export function defectFormValues(
  defect: DefectDTO | null,
  prefill: DefectPrefill | undefined,
  withExternalKey: boolean,
): DefectFormValues {
  const values: DefectFormValues = defect
    ? {
        title: defect.title,
        description: defect.description ?? '',
        steps: defect.steps ?? '',
        expected: defect.expected ?? '',
        actual: defect.actual ?? '',
        severity: defect.severity,
        priority: defect.priority,
        assigneeId: defect.assignee?.id ?? null,
        releaseId: defect.release?.id ?? null,
        foundIn: defect.foundIn ?? '',
        fixedIn: defect.fixedIn ?? '',
        foundInBuildId: defect.foundInBuild?.id ?? null,
        fixedInBuildId: defect.fixedInBuild?.id ?? null,
        environment: defect.environment ?? '',
      }
    : {
        title: prefill?.title ?? '',
        description: prefill?.description ?? '',
        steps: prefill?.steps ?? '',
        expected: prefill?.expected ?? '',
        actual: prefill?.actual ?? '',
        severity: prefill?.severity ?? 'major',
        priority: prefill?.priority ?? 'medium',
        assigneeId: prefill?.assigneeId ?? null,
        releaseId: prefill?.releaseId ?? null,
        foundIn: prefill?.foundIn ?? '',
        fixedIn: '',
        foundInBuildId: prefill?.foundInBuildId ?? null,
        fixedInBuildId: null,
        environment: prefill?.environment ?? '',
      };
  if (withExternalKey) values.externalKey = defect?.externalKey ?? '';
  return values;
}

/** Main path of the defect workflow (rejected and reopened are side states). */
export const WORKFLOW_PATH: readonly DefectStatus[] = [
  'new',
  'open',
  'in_progress',
  'resolved',
  'closed',
];

/** Button text of a transition (the target alone reads ambiguous: "Open" from In progress). */
export function transitionLabel(from: DefectStatus, to: DefectStatus): string {
  switch (to) {
    case 'open':
      return from === 'new' ? 'Confirm' : 'Back to open';
    case 'in_progress':
      return 'Start progress';
    case 'resolved':
      return 'Mark resolved';
    case 'closed':
      return 'Verify & close';
    case 'reopened':
      return 'Reopen';
    case 'rejected':
      return 'Reject';
    default:
      return DEFECT_STATUS_LABELS[to];
  }
}

/** Forward transitions are primary; going back or rejecting is secondary. */
export function isForward(from: DefectStatus, to: DefectStatus): boolean {
  if (to === 'rejected') return false;
  return !(to === 'open' && from !== 'new');
}

/** Allowed transitions with the forward ones first (stable otherwise). */
export function orderTransitions(
  from: DefectStatus,
  allowed: readonly DefectStatus[],
): DefectStatus[] {
  return allowed.toSorted((a, b) => Number(isForward(from, b)) - Number(isForward(from, a)));
}

/** Step of the main path a status sits on (reopened counts as Open; rejected is off the path). */
export function workflowIndex(status: DefectStatus): number {
  if (status === 'reopened') return WORKFLOW_PATH.indexOf('open');
  return WORKFLOW_PATH.indexOf(status);
}

/** Browser URL of a Jira issue (`<base>/browse/<KEY>`), or null without a base URL. */
export function jiraIssueUrl(baseUrl: string | null | undefined, key: string): string | null {
  if (!baseUrl) return null;
  return `${baseUrl.replace(/\/+$/, '')}/browse/${encodeURIComponent(key)}`;
}

/** Messages Jira sent back (502 JIRA_ERROR `details.messages`) that the main message lacks. */
export function jiraMessages(err: unknown): string[] {
  if (!(err instanceof ApiError) || err.code !== 'JIRA_ERROR') return [];
  const details = err.details as { messages?: unknown } | undefined;
  const list: unknown[] = Array.isArray(details?.messages) ? details.messages : [];
  return list.filter((m): m is string => typeof m === 'string' && !err.message.includes(m));
}

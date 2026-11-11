import {
  DEFECT_SEVERITY_LABELS,
  PLAN_STATUS_LABELS,
  PLAN_STATUSES,
  RELEASE_STATUS_LABELS,
  type AttentionItemDTO,
  type DefectListItem,
  type PlanStatus,
  type ReleaseDTO,
} from '@tmt/shared';
import { formatDate } from '@/lib/format';

/** Release in the picker: `FW 2.4.0 (active)` for the active one. */
export function releaseLabel(r: Pick<ReleaseDTO, 'name' | 'status'>): string {
  return r.status === 'active'
    ? `${r.name} (${RELEASE_STATUS_LABELS.active.toLowerCase()})`
    : r.name;
}

/** Test period of a release for the page subtitle. */
export function periodOf(r: Pick<ReleaseDTO, 'startDate' | 'endDate'>): string {
  if (r.startDate && r.endDate)
    return `Test period ${formatDate(r.startDate)} – ${formatDate(r.endDate)}`;
  if (r.startDate) return `Started ${formatDate(r.startDate)}`;
  if (r.endDate) return `Ends ${formatDate(r.endDate)}`;
  return 'No test period set';
}

/** `2 in progress · 1 completed` parts (statuses without plans are left out). */
export function planStatusParts(byStatus: Record<PlanStatus, number>): string[] {
  return PLAN_STATUSES.filter((s) => byStatus[s] > 0).map(
    (s) => `${byStatus[s]} ${PLAN_STATUS_LABELS[s].toLowerCase()}`,
  );
}

/** What went wrong: the remark first for "OK with condition", the actual result first for NG. */
export function attentionDetail(item: AttentionItemDTO): string | null {
  return item.status === 'ok_cond'
    ? (item.resultRemark ?? item.actualResult)
    : (item.actualResult ?? item.resultRemark);
}

/** `Run KR_01 · 26TR-… · Alice · Oct 2, 2026` (missing parts left out). */
export function attentionMeta(item: AttentionItemDTO): string {
  return [
    `Run ${item.runCode}`,
    item.planDocNo,
    item.executedBy?.displayName,
    item.executedAt ? formatDate(item.executedAt) : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** `BUG-12 · Major · Alice · ACS-77` */
export function defectMeta(d: DefectListItem): string {
  return [
    d.key,
    DEFECT_SEVERITY_LABELS[d.severity],
    d.assignee?.displayName ?? 'Unassigned',
    d.externalKey,
  ]
    .filter(Boolean)
    .join(' · ');
}

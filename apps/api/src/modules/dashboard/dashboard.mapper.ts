import type { AttentionItemDTO, DefectRef, ResultStatus, UserRef } from '@tmt/shared';
import { iso, refOf } from '../../common/users/user-refs.js';

/** An NG / OK-with-condition run case with its run and plan (dashboard "needs attention"). */
export interface AttentionRow {
  id: number;
  status: ResultStatus;
  displayId: string;
  code: string | null;
  title: string;
  actualResult: string | null;
  resultRemark: string | null;
  executedById: number | null;
  executedAt: Date | null;
  run: { id: number; code: string; plan: { id: number; docNo: string } };
}

export function toAttentionItem(
  r: AttentionRow,
  users: Map<number, UserRef>,
  defect: DefectRef | null,
): AttentionItemDTO {
  return {
    runCaseId: r.id,
    status: r.status as AttentionItemDTO['status'],
    displayId: r.displayId,
    code: r.code,
    title: r.title,
    actualResult: r.actualResult,
    resultRemark: r.resultRemark,
    runId: r.run.id,
    runCode: r.run.code,
    planId: r.run.plan.id,
    planDocNo: r.run.plan.docNo,
    executedBy: refOf(users, r.executedById),
    executedAt: iso(r.executedAt),
    defect,
  };
}

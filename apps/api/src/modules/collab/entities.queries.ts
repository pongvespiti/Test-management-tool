import type { AttachmentEntityType, TestPlan } from '@tmt/database';
import { defectKey, displayId } from '@tmt/shared';
import { conflict, notFound, unprocessable } from '../../common/errors/app.exception.js';
import type { Db } from '../../prisma/prisma.service.js';
import { getDefectInProject } from '../defects/defects.queries.js';
import { getPlanInProject, getRunCaseInProject } from '../execution/execution.queries.js';
import { getCaseInProject } from '../library/library.queries.js';

/** What comment/attachment handling needs to know about the entity they belong to. */
export interface EntityInfo {
  /** Human label for activity entries, e.g. `MBS-036` or `BUG-12`. */
  label: string;
  /** The test plan that owns the entity (run cases and plans) — used for the PLAN_LOCKED guard. */
  plan: TestPlan | null;
}

/**
 * Confirms that a comment/attachment target belongs to the project (404 with the entity's own
 * code otherwise, 422 BAD_ENTITY for types that take no files) and describes it.
 */
export async function resolveEntity(
  db: Db,
  projectId: number,
  entityType: AttachmentEntityType,
  entityId: number,
): Promise<EntityInfo> {
  switch (entityType) {
    case 'run_case': {
      const { rc, plan } = await getRunCaseInProject(db, projectId, entityId);
      return { label: rc.displayId, plan };
    }
    case 'plan': {
      const plan = await getPlanInProject(db, projectId, entityId);
      return { label: plan.docNo, plan };
    }
    case 'defect': {
      const d = await getDefectInProject(db, projectId, entityId);
      return { label: defectKey(d.seq), plan: null };
    }
    case 'test_case': {
      const { c, suite } = await getCaseInProject(db, projectId, entityId);
      return { label: displayId(suite.prefix, c.seq), plan: null };
    }
    case 'comment': {
      const c = await db.comment.findFirst({
        where: { id: entityId, projectId },
        select: { id: true },
      });
      if (!c) throw notFound('Comment', 'COMMENT_NOT_FOUND');
      return { label: `comment #${c.id}`, plan: null };
    }
    default:
      throw unprocessable('BAD_ENTITY', `Files cannot be attached to ${entityType}`);
  }
}

/** Evidence on run cases and plans is part of the locked record of a completed plan. */
export function isLockedByPlan(entityType: string, info: EntityInfo): boolean {
  return (entityType === 'run_case' || entityType === 'plan') && info.plan?.status === 'completed';
}

/** 409 PLAN_LOCKED for evidence changes on a completed plan. */
export function evidenceLocked(docNo: string | undefined) {
  return conflict(
    'PLAN_LOCKED',
    `Test plan ${docNo ?? ''} is completed — reopen it to change its evidence`,
  );
}

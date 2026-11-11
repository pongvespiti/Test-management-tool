/**
 * Read helpers of defects shared by the defects, execution (run case defect refs), dashboard,
 * collaboration and integrations modules.
 */
import type { Defect } from '@tmt/database';
import {
  DEFECT_TRANSITIONS,
  defectKey,
  type DefectDTO,
  type DefectLinkDTO,
  type DefectListItem,
  type DefectRef,
  type NamedRef,
  type UserRef,
} from '@tmt/shared';
import { notFound } from '../../common/errors/app.exception.js';
import { iso, loadUserRefs, refOf } from '../../common/users/user-refs.js';
import type { Db } from '../../prisma/prisma.service.js';
import { toAttachmentDTO } from '../collab/attachments.mapper.js';

export function toDefectRef(
  d: Pick<Defect, 'id' | 'seq' | 'title' | 'status' | 'severity'>,
): DefectRef {
  return {
    id: d.id,
    key: defectKey(d.seq),
    title: d.title,
    status: d.status,
    severity: d.severity,
  };
}

/** A defect of the project (404 DEFECT_NOT_FOUND otherwise). */
export async function getDefectInProject(
  db: Db,
  projectId: number,
  defectId: number,
): Promise<Defect> {
  const defect = await db.defect.findFirst({ where: { id: defectId, projectId } });
  if (!defect) throw notFound('Defect', 'DEFECT_NOT_FOUND');
  return defect;
}

/** Defects linked to each run case (newest defect first). */
export async function defectRefsByRunCase(
  db: Db,
  runCaseIds: number[],
): Promise<Map<number, DefectRef[]>> {
  const map = new Map<number, DefectRef[]>();
  if (runCaseIds.length === 0) return map;
  const links = await db.defectLink.findMany({
    where: { runCaseId: { in: runCaseIds } },
    select: {
      runCaseId: true,
      defect: { select: { id: true, seq: true, title: true, status: true, severity: true } },
    },
    orderBy: { defectId: 'desc' },
  });
  for (const l of links) {
    if (l.runCaseId === null) continue;
    const list = map.get(l.runCaseId) ?? [];
    list.push(toDefectRef(l.defect));
    map.set(l.runCaseId, list);
  }
  return map;
}

/** Link details (run, plan, case snapshot) per defect, oldest link first. */
export async function loadDefectLinks(
  db: Db,
  defectIds: number[],
): Promise<Map<number, DefectLinkDTO[]>> {
  const map = new Map<number, DefectLinkDTO[]>();
  if (defectIds.length === 0) return map;
  const links = await db.defectLink.findMany({
    where: { defectId: { in: defectIds } },
    orderBy: { id: 'asc' },
    select: {
      id: true,
      defectId: true,
      runCaseId: true,
      testCaseId: true,
      runCase: {
        select: {
          displayId: true,
          code: true,
          title: true,
          status: true,
          run: { select: { id: true, code: true, plan: { select: { id: true, docNo: true } } } },
        },
      },
    },
  });
  for (const l of links) {
    const rc = l.runCase;
    const list = map.get(l.defectId) ?? [];
    list.push({
      id: l.id,
      runCaseId: l.runCaseId,
      testCaseId: l.testCaseId,
      runId: rc?.run.id ?? null,
      runCode: rc?.run.code ?? null,
      planId: rc?.run.plan.id ?? null,
      planDocNo: rc?.run.plan.docNo ?? null,
      caseDisplayId: rc?.displayId ?? null,
      caseCode: rc?.code ?? null,
      caseTitle: rc?.title ?? null,
      resultStatus: rc?.status ?? null,
    });
    map.set(l.defectId, list);
  }
  return map;
}

/** "MBS-036 · RUN-1 · 25TR-TEAM-10-001 (+2)" — where the defect was found. */
export function linkSummaryOf(links: readonly DefectLinkDTO[]): string | null {
  const first = links[0];
  if (!first) return null;
  const parts = [first.caseDisplayId, first.runCode, first.planDocNo].filter(Boolean);
  const head = parts.length ? parts.join(' · ') : 'Linked result';
  return links.length > 1 ? `${head} (+${links.length - 1})` : head;
}

async function releaseRefs(db: Db, ids: (number | null)[]): Promise<Map<number, NamedRef>> {
  const unique = [...new Set(ids.filter((v): v is number => v !== null))];
  if (unique.length === 0) return new Map();
  const rows = await db.release.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true },
  });
  return new Map(rows.map((r) => [r.id, r]));
}

function toListItem(
  d: Defect,
  users: Map<number, UserRef>,
  releases: Map<number, NamedRef>,
  links: DefectLinkDTO[],
): DefectListItem {
  return {
    id: d.id,
    key: defectKey(d.seq),
    title: d.title,
    severity: d.severity,
    priority: d.priority,
    status: d.status,
    assignee: refOf(users, d.assigneeId),
    release: d.releaseId !== null ? (releases.get(d.releaseId) ?? null) : null,
    linkSummary: linkSummaryOf(links),
    externalKey: d.externalKey,
    externalStatus: d.externalStatus,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}

/** List items for the given defect rows (order preserved). */
export async function buildDefectListItems(db: Db, rows: Defect[]): Promise<DefectListItem[]> {
  if (rows.length === 0) return [];
  const users = await loadUserRefs(
    db,
    rows.map((r) => r.assigneeId),
  );
  const releases = await releaseRefs(
    db,
    rows.map((r) => r.releaseId),
  );
  const links = await loadDefectLinks(
    db,
    rows.map((r) => r.id),
  );
  return rows.map((r) => toListItem(r, users, releases, links.get(r.id) ?? []));
}

/** Full defect with links, attachments and the workflow transitions allowed from its status. */
export async function buildDefectDTO(db: Db, d: Defect): Promise<DefectDTO> {
  const links = (await loadDefectLinks(db, [d.id])).get(d.id) ?? [];
  const attachments = await db.attachment.findMany({
    where: { projectId: d.projectId, entityType: 'defect', entityId: d.id },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  const users = await loadUserRefs(db, [
    d.assigneeId,
    d.reporterId,
    ...attachments.map((a) => a.createdById),
  ]);
  const releases = await releaseRefs(db, [d.releaseId]);
  return {
    ...toListItem(d, users, releases, links),
    projectId: d.projectId,
    description: d.description,
    steps: d.steps,
    expected: d.expected,
    actual: d.actual,
    reporter: refOf(users, d.reporterId),
    foundIn: d.foundIn,
    fixedIn: d.fixedIn,
    environment: d.environment,
    externalUrl: d.externalUrl,
    externalSyncedAt: iso(d.externalSyncedAt),
    resolvedAt: iso(d.resolvedAt),
    closedAt: iso(d.closedAt),
    links,
    attachments: attachments.map((a) => toAttachmentDTO(a, users)),
    allowedTransitions: [...DEFECT_TRANSITIONS[d.status]],
  };
}

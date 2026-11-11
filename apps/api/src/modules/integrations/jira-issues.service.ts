import { Injectable } from '@nestjs/common';
import type { Defect } from '@tmt/database';
import { defectKey, type DefectDTO } from '@tmt/shared';
import { AppException, conflict, unprocessable } from '../../common/errors/app.exception.js';
import type { AuthUser, ProjectContext } from '../../common/types/auth.js';
import { AppConfig } from '../../config/app-config.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ActivityService } from '../activity/activity.service.js';
import { buildDefectDTO, getDefectInProject } from '../defects/defects.queries.js';
import { browseUrl, JiraError } from './jira-client.js';
import { issueDescription, issueSummary, TMT_LABEL } from './jira-issue.js';
import { JiraSettingsService } from './jira-settings.service.js';

/** 502 JIRA_ERROR with the Jira status and messages (api.md § Jira). */
export function jiraFailure(e: JiraError): AppException {
  const detail = e.messages.find((m) => m !== e.message);
  return new AppException(502, 'JIRA_ERROR', detail ? `${e.message}: ${detail}` : e.message, {
    status: e.status,
    messages: e.messages,
  });
}

function rethrowJira(e: unknown): never {
  if (e instanceof JiraError) throw jiraFailure(e);
  throw e;
}

function alreadyLinked(d: Defect) {
  return conflict('ALREADY_LINKED', `${defectKey(d.seq)} is already linked to ${d.externalKey}`, {
    externalKey: d.externalKey,
  });
}

/** Defect ↔ Jira issue actions: create, link, refresh the status, unlink (ADR-008). */
@Injectable()
export class JiraIssuesService {
  /** Jira writes per defect run one after another in this process (double clicks → one issue). */
  private readonly locks = new Map<number, Promise<void>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly activity: ActivityService,
    private readonly settings: JiraSettingsService,
  ) {}

  /** Creates a Jira issue from the defect and links it (409 ALREADY_LINKED when linked). */
  async create(ctx: ProjectContext, me: AuthUser, defectId: number): Promise<DefectDTO> {
    const db = this.prisma.db;
    const first = await getDefectInProject(db, ctx.id, defectId);
    if (first.externalKey) throw alreadyLinked(first);
    const { config, client } = await this.settings.usable(ctx.id);
    await this.withDefectLock(defectId, async () => {
      const d = await getDefectInProject(db, ctx.id, defectId);
      if (d.externalKey) throw alreadyLinked(d);
      const dto = await buildDefectDTO(db, d);
      const created = await client
        .createIssue({
          project: { key: config.projectKey },
          issuetype: { name: config.issueType },
          summary: issueSummary(dto),
          description: issueDescription(dto, {
            projectKey: ctx.key,
            projectName: ctx.name,
            publicUrl: this.config.publicUrl,
          }),
          labels: [TMT_LABEL],
        })
        .catch(rethrowJira);
      // The issue exists now: a failing status lookup must not lose the link.
      const issue = await client.getIssue(created.key).catch(() => null);
      const key = issue?.key ?? created.key;
      await db.$transaction(async (tx) => {
        const now = new Date();
        const { count } = await tx.defect.updateMany({
          where: { id: d.id, externalKey: null },
          data: {
            externalKey: key,
            externalUrl: browseUrl(config.baseUrl, key),
            externalStatus: issue?.statusName ?? null,
            externalSyncedAt: now,
            updatedAt: now,
          },
        });
        if (count === 0) {
          throw conflict(
            'ALREADY_LINKED',
            `${defectKey(d.seq)} was linked meanwhile — ${key} was created in Jira`,
            { createdKey: key },
          );
        }
        await this.activity.log(tx, {
          projectId: ctx.id,
          userId: me.id,
          entityType: 'defect',
          entityId: d.id,
          action: 'jira_created',
          summary: `Created Jira issue ${key} for ${defectKey(d.seq)}`,
          data: { key, baseUrl: config.baseUrl },
        });
      });
    });
    return this.defectDTO(ctx.id, defectId);
  }

  /** Links the defect to an existing issue after checking it in Jira. */
  async link(ctx: ProjectContext, me: AuthUser, defectId: number, key: string): Promise<DefectDTO> {
    const db = this.prisma.db;
    const d = await getDefectInProject(db, ctx.id, defectId);
    if (d.externalKey && d.externalKey.toUpperCase() !== key) {
      throw conflict(
        'ALREADY_LINKED',
        `${defectKey(d.seq)} is already linked to ${d.externalKey} — unlink it first`,
        { externalKey: d.externalKey },
      );
    }
    const { config, client } = await this.settings.usable(ctx.id);
    const issue = await client.getIssue(key).catch(rethrowJira);
    if (!issue) {
      throw unprocessable(
        'JIRA_ISSUE_NOT_FOUND',
        `Jira issue ${key} was not found (or is not visible to the integration account)`,
      );
    }
    await db.$transaction(async (tx) => {
      const now = new Date();
      await tx.defect.update({
        where: { id: d.id },
        data: {
          externalKey: issue.key,
          externalUrl: browseUrl(config.baseUrl, issue.key),
          externalStatus: issue.statusName,
          externalSyncedAt: now,
          updatedAt: now,
        },
      });
      await this.activity.log(tx, {
        projectId: ctx.id,
        userId: me.id,
        entityType: 'defect',
        entityId: d.id,
        action: 'jira_linked',
        summary: `Linked ${defectKey(d.seq)} to Jira issue ${issue.key}`,
        data: { key: issue.key, status: issue.statusName },
      });
    });
    return this.defectDTO(ctx.id, d.id);
  }

  /** Refreshes key (moved issues), URL and status from Jira; logs only real changes. */
  async sync(ctx: ProjectContext, me: AuthUser, defectId: number): Promise<DefectDTO> {
    const db = this.prisma.db;
    const d = await getDefectInProject(db, ctx.id, defectId);
    const linkedKey = d.externalKey;
    if (!linkedKey) {
      throw unprocessable('NOT_LINKED', `${defectKey(d.seq)} is not linked to a Jira issue`);
    }
    const { config, client } = await this.settings.usable(ctx.id);
    const issue = await client.getIssue(linkedKey).catch(rethrowJira);
    if (!issue) {
      throw unprocessable(
        'JIRA_ISSUE_NOT_FOUND',
        `Jira issue ${linkedKey} was not found (deleted, or not visible to the integration account)`,
      );
    }
    await db.$transaction(async (tx) => {
      await tx.defect.update({
        where: { id: d.id },
        data: {
          externalKey: issue.key,
          externalUrl: browseUrl(config.baseUrl, issue.key),
          externalStatus: issue.statusName,
          externalSyncedAt: new Date(),
          // A status refresh is not an edit of the defect (API v1 kept updated_at).
          updatedAt: d.updatedAt,
        },
      });
      if (issue.statusName !== d.externalStatus || issue.key !== linkedKey) {
        await this.activity.log(tx, {
          projectId: ctx.id,
          userId: me.id,
          entityType: 'defect',
          entityId: d.id,
          action: 'jira_synced',
          summary: `${defectKey(d.seq)}: Jira ${issue.key} status ${d.externalStatus ?? '—'} → ${issue.statusName ?? '—'}`,
          data: { key: issue.key, from: d.externalStatus, to: issue.statusName },
        });
      }
    });
    return this.defectDTO(ctx.id, d.id);
  }

  /** Clears the Jira link without calling Jira (the issue itself is kept); idempotent. */
  async unlink(ctx: ProjectContext, me: AuthUser, defectId: number): Promise<DefectDTO> {
    const db = this.prisma.db;
    const d = await getDefectInProject(db, ctx.id, defectId);
    if (d.externalKey || d.externalUrl || d.externalStatus || d.externalSyncedAt) {
      await db.$transaction(async (tx) => {
        await tx.defect.update({
          where: { id: d.id },
          data: {
            externalKey: null,
            externalUrl: null,
            externalStatus: null,
            externalSyncedAt: null,
            updatedAt: new Date(),
          },
        });
        await this.activity.log(tx, {
          projectId: ctx.id,
          userId: me.id,
          entityType: 'defect',
          entityId: d.id,
          action: 'jira_unlinked',
          summary: `Unlinked ${defectKey(d.seq)} from Jira issue ${d.externalKey ?? '—'}`,
          data: { key: d.externalKey },
        });
      });
    }
    return this.defectDTO(ctx.id, d.id);
  }

  private async defectDTO(projectId: number, defectId: number): Promise<DefectDTO> {
    const db = this.prisma.db;
    return buildDefectDTO(db, await getDefectInProject(db, projectId, defectId));
  }

  /** Runs `fn` after every earlier call for the same defect has finished. */
  private async withDefectLock<T>(defectId: number, fn: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(defectId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((r) => (release = r));
    const chained = previous.then(() => current);
    this.locks.set(defectId, chained);
    await previous;
    try {
      return await fn();
    } finally {
      release();
      if (this.locks.get(defectId) === chained) this.locks.delete(defectId);
    }
  }
}

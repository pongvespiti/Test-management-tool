import { Injectable } from '@nestjs/common';
import type { ProjectIntegration } from '@tmt/database';
import type {
  IntegrationsStatusDTO,
  JiraConfigDTO,
  JiraConfigInput,
  JiraTestResultDTO,
} from '@tmt/shared';
import { AppException, unprocessable } from '../../common/errors/app.exception.js';
import type { AuthUser, ProjectContext } from '../../common/types/auth.js';
import { loadUserRefs, refOf } from '../../common/users/user-refs.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ActivityService } from '../activity/activity.service.js';
import {
  JiraClientFactory,
  JiraError,
  type JiraClient,
  type JiraConnection,
} from './jira-client.js';
import {
  hasUrlCredentials,
  jiraSecretContext,
  loadJiraRow,
  originOf,
  storedConfigOf,
  toJiraConfigDTO,
  toStatusDTO,
  type StoredJiraConfig,
} from './jira-settings.js';
import { SecretBox, SecretBoxError } from './secret-box.js';

const notConfigured = (message: string) => unprocessable('JIRA_NOT_CONFIGURED', message);

function failed(message: string, serverTitle: string | null = null): JiraTestResultDTO {
  return { ok: false, message, serverTitle, projectName: null };
}

/** The settings of a project, ready to call Jira. */
export interface UsableJira {
  config: StoredJiraConfig;
  client: JiraClient;
}

/**
 * Per-project Jira settings (api.md § Jira, ADR-008). The token is sealed with the secret box,
 * bound to its project, and never returned, logged or sent to another Jira server.
 */
@Injectable()
export class JiraSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly box: SecretBox,
    private readonly jira: JiraClientFactory,
  ) {}

  async status(projectId: number): Promise<IntegrationsStatusDTO> {
    return toStatusDTO(await loadJiraRow(this.prisma.db, projectId));
  }

  /** Settings for leads, or null when Jira is not configured. */
  async get(projectId: number): Promise<JiraConfigDTO | null> {
    const row = await loadJiraRow(this.prisma.db, projectId);
    return row ? this.toDTO(row) : null;
  }

  /**
   * Saves the settings. An omitted/empty secret keeps the stored one, but only for the same Jira
   * server (scheme, host and port): a stored token must never be sent elsewhere.
   */
  async save(ctx: ProjectContext, me: AuthUser, body: JiraConfigInput): Promise<JiraConfigDTO> {
    if (hasUrlCredentials(body.baseUrl)) {
      throw new AppException(
        400,
        'VALIDATION_ERROR',
        'baseUrl: remove the user name and password',
        {
          issues: [{ path: 'baseUrl', message: 'Use the authentication fields, not the URL' }],
        },
      );
    }
    const db = this.prisma.db;
    const existing = await loadJiraRow(db, ctx.id);
    const newSecret = body.secret?.trim() || null;
    const sameServer =
      existing !== null && originOf(storedConfigOf(existing).baseUrl) === originOf(body.baseUrl);
    const keptSecret = sameServer ? (existing?.secretEnc ?? null) : null;
    if (!newSecret && !keptSecret) {
      throw unprocessable(
        'SECRET_REQUIRED',
        existing?.secretEnc
          ? 'Enter the token again — the Jira server changed'
          : 'Enter the personal access token (or API token for Jira Cloud)',
      );
    }
    const secretEnc = newSecret ? this.box.seal(newSecret, jiraSecretContext(ctx.id)) : keptSecret;
    const config: StoredJiraConfig = {
      baseUrl: body.baseUrl,
      projectKey: body.projectKey,
      issueType: body.issueType,
      authType: body.authType,
      username: body.username ?? null,
      verifyTls: body.verifyTls,
    };
    const row = await db.$transaction(async (tx) => {
      const values = { enabled: body.enabled, config, secretEnc, updatedById: me.id };
      const saved = await tx.projectIntegration.upsert({
        where: { projectId_kind: { projectId: ctx.id, kind: 'jira' } },
        create: { projectId: ctx.id, kind: 'jira', ...values },
        update: { ...values, updatedAt: new Date() },
      });
      await this.activity.log(tx, {
        projectId: ctx.id,
        userId: me.id,
        entityType: 'project',
        entityId: ctx.id,
        action: 'jira_configured',
        summary: `Saved the Jira integration (${config.projectKey} at ${config.baseUrl}${body.enabled ? '' : ', turned off'})`,
        data: { ...config, enabled: body.enabled, secretChanged: newSecret !== null },
      });
      return saved;
    });
    return this.toDTO(row);
  }

  /** Removes the settings (idempotent; logged only when something was removed). */
  async remove(ctx: ProjectContext, me: AuthUser): Promise<void> {
    await this.prisma.db.$transaction(async (tx) => {
      const { count } = await tx.projectIntegration.deleteMany({
        where: { projectId: ctx.id, kind: 'jira' },
      });
      if (count === 0) return;
      await this.activity.log(tx, {
        projectId: ctx.id,
        userId: me.id,
        entityType: 'project',
        entityId: ctx.id,
        action: 'jira_removed',
        summary: 'Removed the Jira integration',
      });
    });
  }

  /**
   * Tests unsaved settings (`body`) or, without a body, the stored ones — also while turned off.
   * Never throws for Jira problems: `ok: false` with a message instead.
   */
  async test(ctx: ProjectContext, body: JiraConfigInput | undefined): Promise<JiraTestResultDTO> {
    const stored = await loadJiraRow(this.prisma.db, ctx.id);
    let conn: JiraConnection;
    let projectKey: string;
    if (!body) {
      if (!stored) return failed('Jira is not set up for this project yet');
      try {
        conn = this.connectionOf(stored);
      } catch (e) {
        if (e instanceof AppException) return failed(e.message);
        throw e;
      }
      projectKey = storedConfigOf(stored).projectKey;
    } else {
      if (hasUrlCredentials(body.baseUrl)) {
        return failed('Remove the user name and password from the URL');
      }
      let secret = body.secret?.trim() || null;
      if (!secret && stored?.secretEnc) {
        if (originOf(storedConfigOf(stored).baseUrl) !== originOf(body.baseUrl)) {
          return failed('Enter the token to test a different Jira server');
        }
        try {
          secret = this.box.open(stored.secretEnc, jiraSecretContext(ctx.id));
        } catch (e) {
          if (e instanceof SecretBoxError) return failed('Enter the token again');
          throw e;
        }
      }
      if (!secret) return failed('Enter the personal access token (or API token for Jira Cloud)');
      conn = {
        baseUrl: body.baseUrl,
        authType: body.authType,
        username: body.username ?? null,
        secret,
        verifyTls: body.verifyTls,
      };
      projectKey = body.projectKey;
    }
    return this.probe(conn, projectKey);
  }

  /** Enabled settings of a project with a client, or 422 JIRA_NOT_CONFIGURED. */
  async usable(projectId: number): Promise<UsableJira> {
    const row = await loadJiraRow(this.prisma.db, projectId);
    if (!row) throw notConfigured('Jira is not set up for this project — a lead can configure it');
    if (!row.enabled) throw notConfigured('The Jira integration is turned off for this project');
    return { config: storedConfigOf(row), client: this.jira.create(this.connectionOf(row)) };
  }

  /** Stored settings with the opened secret, or 422 JIRA_NOT_CONFIGURED. */
  private connectionOf(row: ProjectIntegration): JiraConnection {
    if (!row.secretEnc) throw notConfigured('The Jira token is missing — a lead must enter it');
    try {
      return {
        ...storedConfigOf(row),
        secret: this.box.open(row.secretEnc, jiraSecretContext(row.projectId)),
      };
    } catch (e) {
      if (e instanceof SecretBoxError) {
        throw notConfigured(
          'The stored Jira token cannot be decrypted (the server secret changed) — a lead must enter it again',
        );
      }
      throw e;
    }
  }

  /** Server info, then the project: the first failure becomes the message. */
  private async probe(conn: JiraConnection, projectKey: string): Promise<JiraTestResultDTO> {
    const client = this.jira.create(conn);
    let serverTitle: string;
    try {
      const info = await client.serverInfo();
      const flavour = [info.deploymentType, info.version].filter(Boolean).join(' ');
      serverTitle = `${info.serverTitle ?? 'Jira'}${flavour ? ` (${flavour})` : ''}`;
    } catch (e) {
      if (e instanceof JiraError) return failed(e.messages[0] ?? e.message);
      throw e;
    }
    try {
      const project = await client.project(projectKey);
      return {
        ok: true,
        message: `Connected to ${serverTitle} — project ${project.key}${project.name ? ` (${project.name})` : ''}`,
        serverTitle,
        projectName: project.name,
      };
    } catch (e) {
      if (!(e instanceof JiraError)) throw e;
      const message =
        e.status === 404
          ? `Connected to ${serverTitle}, but project ${projectKey} was not found or is not visible to this account`
          : (e.messages[0] ?? e.message);
      return failed(message, serverTitle);
    }
  }

  private async toDTO(row: ProjectIntegration): Promise<JiraConfigDTO> {
    const users = await loadUserRefs(this.prisma.db, [row.updatedById]);
    return toJiraConfigDTO(row, refOf(users, row.updatedById));
  }
}

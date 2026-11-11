/** Jira settings stored in `project_integrations` (row → settings/DTOs, URL checks). */
import type { ProjectIntegration } from '@tmt/database';
import {
  JIRA_AUTH_TYPES,
  type IntegrationsStatusDTO,
  type JiraAuthType,
  type JiraConfigDTO,
  type UserRef,
} from '@tmt/shared';
import type { Db } from '../../prisma/prisma.service.js';

/** Non-secret Jira settings stored in `project_integrations.config` (JSON). */
export type StoredJiraConfig = {
  baseUrl: string;
  projectKey: string;
  issueType: string;
  authType: JiraAuthType;
  username: string | null;
  verifyTls: boolean;
};

/** Additional authenticated data binding a sealed Jira secret to its project. */
export function jiraSecretContext(projectId: number): string {
  return `jira:project:${projectId}`;
}

/** The Jira settings row of a project, or null. */
export async function loadJiraRow(db: Db, projectId: number): Promise<ProjectIntegration | null> {
  return db.projectIntegration.findUnique({
    where: { projectId_kind: { projectId, kind: 'jira' } },
  });
}

const textOf = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Settings of a row; tolerant of missing or malformed JSON values (defaults as on save). */
export function storedConfigOf(row: Pick<ProjectIntegration, 'config'>): StoredJiraConfig {
  const c = (
    typeof row.config === 'object' && row.config !== null && !Array.isArray(row.config)
      ? row.config
      : {}
  ) as Record<string, unknown>;
  const authType = (JIRA_AUTH_TYPES as readonly string[]).includes(textOf(c.authType))
    ? (c.authType as JiraAuthType)
    : 'pat';
  return {
    baseUrl: textOf(c.baseUrl),
    projectKey: textOf(c.projectKey),
    issueType: textOf(c.issueType) || 'Bug',
    authType,
    username: textOf(c.username) || null,
    verifyTls: c.verifyTls !== false,
  };
}

/** Settings for leads; only whether a secret is stored, never the secret. */
export function toJiraConfigDTO(row: ProjectIntegration, updatedBy: UserRef | null): JiraConfigDTO {
  const c = storedConfigOf(row);
  return {
    enabled: row.enabled,
    baseUrl: c.baseUrl,
    projectKey: c.projectKey,
    issueType: c.issueType,
    authType: c.authType,
    username: c.username,
    hasSecret: row.secretEnc !== null,
    verifyTls: c.verifyTls,
    updatedBy,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** What every member may know: enabled, server and project key. */
export function toStatusDTO(row: ProjectIntegration | null): IntegrationsStatusDTO {
  if (!row) return { jira: null };
  const c = storedConfigOf(row);
  return { jira: { enabled: row.enabled, baseUrl: c.baseUrl, projectKey: c.projectKey } };
}

/** `scheme://host:port` of a URL (null when unparsable). */
export function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** True when the URL embeds a user name or password (`https://user:pw@host`). */
export function hasUrlCredentials(url: string): boolean {
  try {
    const u = new URL(url);
    return u.username !== '' || u.password !== '';
  } catch {
    return false;
  }
}

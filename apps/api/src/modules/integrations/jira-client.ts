/**
 * Jira REST API v2 client (ADR-008): Server/Data Center with a personal access token
 * (`Authorization: Bearer`) or Cloud with e-mail + API token (basic auth).
 */
import { Injectable } from '@nestjs/common';
import type { JiraAuthType } from '@tmt/shared';
import { API_VERSION } from '../health/health.controller.js';
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_TIMEOUT_MS,
  HttpClient,
  HttpClientError,
} from './http-client.js';

/** Limits of every Jira call (api.md: 15 s, 5 MB). */
export interface JiraLimits {
  timeoutMs: number;
  maxBytes: number;
}

export interface JiraConnection {
  baseUrl: string;
  authType: JiraAuthType;
  username: string | null;
  secret: string;
  verifyTls: boolean;
}

/** Jira answered with an error status (or could not be reached: `status` null). */
export class JiraError extends Error {
  constructor(
    readonly status: number | null,
    readonly messages: string[],
    message: string,
  ) {
    super(message);
    this.name = 'JiraError';
  }
}

export interface JiraIssue {
  key: string;
  summary: string | null;
  statusName: string | null;
}

/** An issue as read for a requirement: summary, wiki-markup description and status. */
export interface JiraIssueDetail extends JiraIssue {
  description: string | null;
}

/** Most issues one search returns (one page; JQL imports stop here). */
export const JIRA_SEARCH_MAX = 200;

export interface JiraServerInfo {
  serverTitle: string | null;
  version: string | null;
  deploymentType: string | null;
}

interface JiraErrorBody {
  errorMessages?: unknown;
  errors?: unknown;
}

/** `errorMessages` + `errors` of a Jira error body as plain strings (at most 20 × 500 chars). */
export function errorMessagesOf(data: unknown): string[] {
  if (typeof data !== 'object' || data === null) return [];
  const body = data as JiraErrorBody;
  const out: string[] = [];
  if (Array.isArray(body.errorMessages)) {
    for (const m of body.errorMessages) if (typeof m === 'string' && m) out.push(m);
  }
  if (typeof body.errors === 'object' && body.errors !== null) {
    for (const [field, m] of Object.entries(body.errors as Record<string, unknown>)) {
      if (typeof m === 'string' && m) out.push(`${field}: ${m}`);
    }
  }
  return out.slice(0, 20).map((m) => m.slice(0, 500));
}

function describeStatus(status: number): string {
  if (status === 401) return 'Jira rejected the credentials (HTTP 401) — check the token';
  if (status === 403) return 'Jira refused the request (HTTP 403) — check the account permissions';
  if (status === 404) return 'Not found in Jira (HTTP 404)';
  return `Jira answered HTTP ${status}`;
}

function statusError(status: number, data: unknown): JiraError {
  const messages = errorMessagesOf(data);
  return new JiraError(
    status,
    messages.length ? messages : [describeStatus(status)],
    describeStatus(status),
  );
}

/** Message for a network-level failure (timeouts, TLS, refused connections). */
export function describeHttpError(e: HttpClientError, limits: JiraLimits): string {
  switch (e.kind) {
    case 'timeout':
      return `Jira did not answer within ${Math.round(limits.timeoutMs / 1000)} s`;
    case 'too_large':
      return 'The Jira response was too large';
    case 'tls':
      return `${e.message} — add the company CA with NODE_EXTRA_CA_CERTS or turn off certificate checks for this Jira server`;
    case 'bad_url':
      return 'The Jira URL is not valid';
    default:
      return `Cannot reach the Jira server: ${e.message}`;
  }
}

/** `Authorization` header: Bearer PAT, or basic auth with the username and API token. */
export function authorizationHeader(
  c: Pick<JiraConnection, 'authType' | 'username' | 'secret'>,
): string {
  if (c.authType === 'basic') {
    return `Basic ${Buffer.from(`${c.username ?? ''}:${c.secret}`, 'utf8').toString('base64')}`;
  }
  return `Bearer ${c.secret}`;
}

const nonEmpty = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

/** Browse URL of an issue. */
export function browseUrl(baseUrl: string, key: string): string {
  return `${baseUrl}/browse/${encodeURIComponent(key)}`;
}

/** The Jira calls TMT needs, for one connection. */
export class JiraClient {
  constructor(
    private readonly conn: JiraConnection,
    private readonly http: HttpClient,
    private readonly limits: JiraLimits,
  ) {}

  private async call<T>(
    method: 'GET' | 'POST',
    path: string,
    json?: unknown,
  ): Promise<{ status: number; data: T | null }> {
    try {
      const res = await this.http.requestJson<T>({
        method,
        url: `${this.conn.baseUrl}${path}`,
        headers: {
          Authorization: authorizationHeader(this.conn),
          'User-Agent': `TMT/${API_VERSION}`,
        },
        json,
        timeoutMs: this.limits.timeoutMs,
        maxBytes: this.limits.maxBytes,
        verifyTls: this.conn.verifyTls,
      });
      return { status: res.status, data: res.data };
    } catch (e) {
      if (e instanceof HttpClientError) {
        const message = describeHttpError(e, this.limits);
        throw new JiraError(null, [message], message);
      }
      throw e;
    }
  }

  private async ok<T>(method: 'GET' | 'POST', path: string, json?: unknown): Promise<T> {
    const res = await this.call<T>(method, path, json);
    if (res.status >= 200 && res.status < 300) return (res.data ?? {}) as T;
    throw statusError(res.status, res.data);
  }

  async serverInfo(): Promise<JiraServerInfo> {
    const data = await this.ok<Record<string, unknown>>('GET', '/rest/api/2/serverInfo');
    return {
      serverTitle: nonEmpty(data.serverTitle),
      version: nonEmpty(data.version),
      deploymentType: nonEmpty(data.deploymentType),
    };
  }

  async project(key: string): Promise<{ key: string; name: string | null }> {
    const data = await this.ok<Record<string, unknown>>(
      'GET',
      `/rest/api/2/project/${encodeURIComponent(key)}`,
    );
    return {
      key: typeof data.key === 'string' ? data.key : key,
      name: typeof data.name === 'string' ? data.name : null,
    };
  }

  /**
   * Creates an issue; when Jira refuses the `labels` field (not on the create screen), retries once
   * without labels.
   */
  async createIssue(fields: Record<string, unknown>): Promise<{ key: string }> {
    try {
      return await this.createOnce(fields);
    } catch (e) {
      const refusedLabels =
        e instanceof JiraError &&
        e.status === 400 &&
        e.messages.some((m) => m.startsWith('labels:'));
      if (!refusedLabels || !('labels' in fields)) throw e;
      const { labels: _labels, ...rest } = fields;
      return this.createOnce(rest);
    }
  }

  private async createOnce(fields: Record<string, unknown>): Promise<{ key: string }> {
    const data = await this.ok<Record<string, unknown>>('POST', '/rest/api/2/issue', { fields });
    if (typeof data.key !== 'string') {
      throw new JiraError(null, ['Jira did not return the new issue key'], 'Unexpected answer');
    }
    return { key: data.key };
  }

  /** The issue (moved issues answer with their new key); null when Jira answers 404. */
  async getIssue(key: string): Promise<JiraIssue | null> {
    const res = await this.call<Record<string, unknown>>(
      'GET',
      `/rest/api/2/issue/${encodeURIComponent(key)}?fields=status,summary`,
    );
    if (res.status === 404) return null;
    if (res.status < 200 || res.status >= 300) throw statusError(res.status, res.data);
    const data = res.data ?? {};
    const fields = (typeof data.fields === 'object' && data.fields !== null ? data.fields : {}) as {
      status?: { name?: unknown };
      summary?: unknown;
    };
    return {
      key: typeof data.key === 'string' ? data.key : key,
      summary: typeof fields.summary === 'string' ? fields.summary : null,
      statusName: typeof fields.status?.name === 'string' ? fields.status.name : null,
    };
  }

  /**
   * Read-only JQL search (summary, status, description of up to `max` issues). Jira Cloud serves
   * `/search/jql`; Server/Data Center only has the older `/search`, used when the first answers
   * 404/405/410.
   */
  async searchIssues(jql: string, max = JIRA_SEARCH_MAX): Promise<JiraIssueDetail[]> {
    const query = `jql=${encodeURIComponent(jql)}&fields=summary,status,description&maxResults=${max}`;
    let res = await this.call<Record<string, unknown>>('GET', `/rest/api/2/search/jql?${query}`);
    if ([404, 405, 410].includes(res.status)) {
      res = await this.call<Record<string, unknown>>('GET', `/rest/api/2/search?${query}`);
    }
    if (res.status < 200 || res.status >= 300) throw statusError(res.status, res.data);
    const issues = Array.isArray(res.data?.issues) ? (res.data.issues as unknown[]) : [];
    const out: JiraIssueDetail[] = [];
    for (const raw of issues) {
      if (typeof raw !== 'object' || raw === null) continue;
      const issue = raw as {
        key?: unknown;
        fields?: { summary?: unknown; description?: unknown; status?: { name?: unknown } };
      };
      if (typeof issue.key !== 'string') continue;
      out.push({
        key: issue.key,
        summary: typeof issue.fields?.summary === 'string' ? issue.fields.summary : null,
        statusName:
          typeof issue.fields?.status?.name === 'string' ? issue.fields.status.name : null,
        description:
          typeof issue.fields?.description === 'string' ? issue.fields.description : null,
      });
    }
    return out;
  }
}

/** Creates Jira clients on the injected HTTP client with the shared call limits. */
@Injectable()
export class JiraClientFactory {
  /** Limits of every Jira call; mutable so tests can shorten the timeout. */
  readonly limits: JiraLimits = { timeoutMs: DEFAULT_TIMEOUT_MS, maxBytes: DEFAULT_MAX_BYTES };

  constructor(private readonly http: HttpClient) {}

  create(conn: JiraConnection): JiraClient {
    return new JiraClient(conn, this.http, this.limits);
  }
}

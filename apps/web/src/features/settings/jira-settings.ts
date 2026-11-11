import { jiraConfigSchema, type JiraAuthType, type JiraConfigDTO } from '@tmt/shared';
import type { JiraConfigBody } from '@/lib/api/integrations';
import { schemaErrors, type FlatErrors } from '@/lib/form-errors';

/** Values of the Jira settings form (the secret is never loaded, only typed). */
export interface JiraFormValues {
  enabled: boolean;
  baseUrl: string;
  projectKey: string;
  issueType: string;
  authType: JiraAuthType;
  username: string;
  secret: string;
  verifyTls: boolean;
}

export function toJiraValues(config: JiraConfigDTO | null): JiraFormValues {
  return {
    enabled: config?.enabled ?? true,
    baseUrl: config?.baseUrl ?? '',
    projectKey: config?.projectKey ?? '',
    issueType: config?.issueType ?? 'Bug',
    authType: config?.authType ?? 'pat',
    username: config?.username ?? '',
    secret: '',
    verifyTls: config?.verifyTls ?? true,
  };
}

/** Request body; a blank secret is omitted so the server keeps the stored one. */
export function toJiraBody(v: JiraFormValues): JiraConfigBody {
  const secret = v.secret.trim();
  return {
    enabled: v.enabled,
    baseUrl: v.baseUrl,
    projectKey: v.projectKey,
    issueType: v.issueType,
    authType: v.authType,
    username: v.authType === 'basic' ? v.username : null,
    verifyTls: v.verifyTls,
    ...(secret ? { secret } : {}),
  };
}

/** `https://jira.example.com/x` → `https://jira.example.com`; null for an invalid URL. */
export function originOf(url: string): string | null {
  try {
    return new URL(url.trim()).origin;
  } catch {
    return null;
  }
}

/** The stored token may only be sent to the server it was saved for (same rule as the server). */
export function storedSecretUsable(stored: JiraConfigDTO | null, baseUrl: string): boolean {
  return Boolean(stored?.hasSecret) && originOf(stored!.baseUrl) === originOf(baseUrl);
}

/** Field errors: the shared schema plus "a token is needed unless the stored one applies". */
export function jiraFormErrors(v: JiraFormValues, stored: JiraConfigDTO | null): FlatErrors {
  const errors = schemaErrors(jiraConfigSchema, toJiraBody(v));
  if (!v.secret.trim() && !errors.secret) {
    if (!stored?.hasSecret) errors.secret = 'Enter the token';
    else if (!storedSecretUsable(stored, v.baseUrl))
      errors.secret = 'Enter the token again — the Jira server changed';
  }
  return errors;
}

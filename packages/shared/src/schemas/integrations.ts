import { z } from 'zod';
import { JIRA_AUTH_TYPES } from '../enums';
import { optionalLine, requiredLine } from './common';

/** http(s) URL without trailing slash, e.g. `https://jira.example.local` or `https://x.atlassian.net`. */
export const jiraBaseUrlSchema = z
  .string()
  .trim()
  .max(500)
  .regex(
    /^https?:\/\/[^\s/?#]+(?::\d+)?(?:\/[^\s?#]*)?$/i,
    'Use a full http(s) URL, e.g. https://jira.example.com',
  )
  .transform((v) => v.replace(/\/+$/, ''));

export const jiraProjectKeySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z][A-Z0-9_]{0,19}$/, 'Jira project key, e.g. TEAM');

export const jiraIssueKeySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z][A-Z0-9_]{0,19}-\d{1,9}$/, 'Jira issue key, e.g. TEAM-123');

/**
 * Per-project Jira settings. `secret` is the PAT (authType `pat`) or the API token/password
 * (authType `basic`); omitted or '' keeps the stored secret. The secret is never returned.
 */
export const jiraConfigSchema = z
  .object({
    enabled: z.boolean().default(true),
    baseUrl: jiraBaseUrlSchema,
    projectKey: jiraProjectKeySchema,
    issueType: requiredLine(60).default('Bug'),
    authType: z.enum(JIRA_AUTH_TYPES).default('pat'),
    username: optionalLine(200),
    secret: z.string().max(4000).optional(),
    verifyTls: z.boolean().default(true),
  })
  .refine((c) => c.authType !== 'basic' || !!c.username, {
    message: 'Username (e-mail for Jira Cloud) is required for basic auth',
    path: ['username'],
  });
export type JiraConfigInput = z.infer<typeof jiraConfigSchema>;

export const jiraLinkSchema = z.object({ key: jiraIssueKeySchema });
export type JiraLinkInput = z.infer<typeof jiraLinkSchema>;

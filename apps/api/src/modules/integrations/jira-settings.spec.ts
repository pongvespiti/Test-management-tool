import { describe, expect, it } from '@jest/globals';
import { projectIntegrationRow as row } from '../../../test/unit/fixtures.js';
import { createPrismaMock } from '../../../test/unit/prisma-mock.js';
import {
  hasUrlCredentials,
  jiraSecretContext,
  loadJiraRow,
  originOf,
  storedConfigOf,
  toJiraConfigDTO,
  toStatusDTO,
} from './jira-settings.js';

const T0 = new Date('2026-01-15T08:00:00.000Z');

describe('Jira settings', () => {
  it('reads the stored settings and falls back to safe defaults', () => {
    expect(storedConfigOf(row())).toEqual({
      baseUrl: 'https://jira.example',
      projectKey: 'TEAM',
      issueType: 'Defect',
      authType: 'basic',
      username: 'qa@x',
      verifyTls: false,
    });
    for (const config of [{}, null, [], 'x', { authType: 'oauth', issueType: '', username: '' }]) {
      expect(storedConfigOf({ config })).toEqual({
        baseUrl: '',
        projectKey: '',
        issueType: 'Bug',
        authType: 'pat',
        username: null,
        verifyTls: true,
      });
    }
  });

  it('maps settings for leads without the secret and the status for members', () => {
    const user = { id: 1, username: 'lead', displayName: 'Lead' };
    expect(toJiraConfigDTO(row(), user)).toEqual({
      enabled: true,
      baseUrl: 'https://jira.example',
      projectKey: 'TEAM',
      issueType: 'Defect',
      authType: 'basic',
      username: 'qa@x',
      hasSecret: true,
      verifyTls: false,
      updatedBy: user,
      updatedAt: T0.toISOString(),
    });
    expect(toJiraConfigDTO(row({ secretEnc: null }), null).hasSecret).toBe(false);
    expect(toStatusDTO(null)).toEqual({ jira: null });
    expect(toStatusDTO(row({ enabled: false }))).toEqual({
      jira: { enabled: false, baseUrl: 'https://jira.example', projectKey: 'TEAM' },
    });
  });

  it('compares servers by origin and detects credentials in URLs', () => {
    expect(originOf('https://jira.example/path')).toBe('https://jira.example');
    expect(originOf('https://jira.example:8443')).toBe('https://jira.example:8443');
    expect(originOf('nope')).toBeNull();
    expect(hasUrlCredentials('https://user:pw@jira.example')).toBe(true);
    expect(hasUrlCredentials('https://user@jira.example')).toBe(true);
    expect(hasUrlCredentials('https://jira.example')).toBe(false);
    expect(hasUrlCredentials('nope')).toBe(false);
    expect(jiraSecretContext(7)).toBe('jira:project:7');
  });

  it('loads the Jira row of a project', async () => {
    const { db } = createPrismaMock();
    db.projectIntegration.findUnique.mockResolvedValue(row());
    await expect(loadJiraRow(db, 10)).resolves.toMatchObject({ projectId: 10 });
    expect(db.projectIntegration.findUnique).toHaveBeenCalledWith({
      where: { projectId_kind: { projectId: 10, kind: 'jira' } },
    });
  });
});

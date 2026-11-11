import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { jiraConfigSchema, type JiraConfigInput } from '@tmt/shared';
import {
  authUser,
  projectCtx,
  projectIntegrationRow,
  unitConfig,
  userRow,
} from '../../../test/unit/fixtures.js';
import { createPrismaMock, type PrismaMock } from '../../../test/unit/prisma-mock.js';
import type { ActivityService } from '../activity/activity.service.js';
import { JiraError, type JiraClient, type JiraClientFactory } from './jira-client.js';
import { JiraSettingsService } from './jira-settings.service.js';
import { SecretBox } from './secret-box.js';

const PAT = 'pat-SuperSecret-0123456789';
const box = new SecretBox(unitConfig({ APP_SECRET: 'k'.repeat(40) }));
const sealedFor = (projectId: number, secret = PAT) =>
  box.seal(secret, `jira:project:${projectId}`);
const settings = (over: Record<string, unknown> = {}): JiraConfigInput =>
  jiraConfigSchema.parse({
    baseUrl: 'https://jira.example',
    projectKey: 'team',
    secret: PAT,
    ...over,
  });

describe('JiraSettingsService', () => {
  const me = authUser({ id: 1 });
  const ctx = projectCtx({ id: 10 });
  let mock: PrismaMock;
  let activity: { log: jest.Mock<ActivityService['log']> };
  let client: {
    serverInfo: jest.Mock<JiraClient['serverInfo']>;
    project: jest.Mock<JiraClient['project']>;
  };
  let factory: { create: jest.Mock<JiraClientFactory['create']> };
  let service: JiraSettingsService;

  beforeEach(() => {
    mock = createPrismaMock();
    activity = { log: jest.fn<ActivityService['log']>().mockResolvedValue(undefined) };
    client = {
      serverInfo: jest.fn<JiraClient['serverInfo']>().mockResolvedValue({
        serverTitle: 'Example Jira',
        version: '9.12.2',
        deploymentType: 'Server',
      }),
      project: jest
        .fn<JiraClient['project']>()
        .mockResolvedValue({ key: 'TEAM', name: 'Example Edge Devices' }),
    };
    factory = {
      create: jest.fn<JiraClientFactory['create']>(() => client as unknown as JiraClient),
    };
    service = new JiraSettingsService(
      mock.prisma,
      activity as unknown as ActivityService,
      box,
      factory as unknown as JiraClientFactory,
    );
    mock.db.user.findMany.mockResolvedValue([userRow({ id: 1, username: 'lead' })]);
    mock.db.projectIntegration.findUnique.mockResolvedValue(null);
  });

  it('reports the status and the settings (null when not configured)', async () => {
    await expect(service.status(10)).resolves.toEqual({ jira: null });
    await expect(service.get(10)).resolves.toBeNull();
    mock.db.projectIntegration.findUnique.mockResolvedValue(projectIntegrationRow());
    expect((await service.get(10))?.updatedBy?.username).toBe('lead');
    expect((await service.status(10)).jira?.projectKey).toBe('TEAM');
  });

  describe('save', () => {
    it('refuses credentials in the URL like a validation error', async () => {
      await expect(
        service.save(ctx, me, settings({ baseUrl: 'https://user:pw@jira.example' })),
      ).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        message: 'baseUrl: remove the user name and password',
        details: {
          issues: [{ path: 'baseUrl', message: 'Use the authentication fields, not the URL' }],
        },
      });
    });

    it('needs a secret on first save', async () => {
      await expect(service.save(ctx, me, settings({ secret: undefined }))).rejects.toMatchObject({
        code: 'SECRET_REQUIRED',
        message: 'Enter the personal access token (or API token for Jira Cloud)',
      });
      expect(mock.db.projectIntegration.upsert).not.toHaveBeenCalled();
    });

    it('seals a new secret for the project and never logs it', async () => {
      mock.db.projectIntegration.upsert.mockResolvedValue(projectIntegrationRow());
      await service.save(ctx, me, settings({ enabled: false }));
      const call = mock.db.projectIntegration.upsert.mock.calls[0]![0];
      expect(call.where).toEqual({ projectId_kind: { projectId: 10, kind: 'jira' } });
      expect(call.create).toMatchObject({
        projectId: 10,
        kind: 'jira',
        enabled: false,
        updatedById: 1,
        config: {
          baseUrl: 'https://jira.example',
          projectKey: 'TEAM',
          issueType: 'Bug',
          authType: 'pat',
          username: null,
          verifyTls: true,
        },
      });
      const sealed = call.create.secretEnc as string;
      expect(sealed).toMatch(/^v1:/);
      expect(box.open(sealed, 'jira:project:10')).toBe(PAT);
      expect(call.update.updatedAt).toBeInstanceOf(Date);
      const entry = activity.log.mock.calls[0]![1];
      expect(entry).toMatchObject({
        entityType: 'project',
        entityId: 10,
        action: 'jira_configured',
        summary: 'Saved the Jira integration (TEAM at https://jira.example, turned off)',
        data: { secretChanged: true, enabled: false },
      });
      expect(JSON.stringify(activity.log.mock.calls)).not.toContain(PAT);
    });

    it('keeps the stored secret for the same server only', async () => {
      const stored = projectIntegrationRow({ secretEnc: sealedFor(10) });
      mock.db.projectIntegration.findUnique.mockResolvedValue(stored);
      mock.db.projectIntegration.upsert.mockResolvedValue(stored);
      await service.save(ctx, me, settings({ secret: '  ', baseUrl: 'https://jira.example/x' }));
      expect(mock.db.projectIntegration.upsert.mock.calls[0]![0].update.secretEnc).toBe(
        stored.secretEnc,
      );
      expect(activity.log.mock.calls[0]![1].data).toMatchObject({ secretChanged: false });

      await expect(
        service.save(ctx, me, settings({ secret: undefined, baseUrl: 'https://evil.example' })),
      ).rejects.toMatchObject({
        code: 'SECRET_REQUIRED',
        message: 'Enter the token again — the Jira server changed',
      });
    });
  });

  it('removes the settings and logs only real removals', async () => {
    mock.db.projectIntegration.deleteMany.mockResolvedValue({ count: 0 });
    await service.remove(ctx, me);
    expect(activity.log).not.toHaveBeenCalled();
    mock.db.projectIntegration.deleteMany.mockResolvedValue({ count: 1 });
    await service.remove(ctx, me);
    expect(mock.db.projectIntegration.deleteMany).toHaveBeenCalledWith({
      where: { projectId: 10, kind: 'jira' },
    });
    expect(activity.log.mock.calls[0]![1]).toMatchObject({
      action: 'jira_removed',
      summary: 'Removed the Jira integration',
    });
  });

  describe('test', () => {
    it('tests the stored settings, also when turned off', async () => {
      await expect(service.test(ctx, undefined)).resolves.toEqual({
        ok: false,
        message: 'Jira is not set up for this project yet',
        serverTitle: null,
        projectName: null,
      });
      mock.db.projectIntegration.findUnique.mockResolvedValue(
        projectIntegrationRow({ secretEnc: null }),
      );
      expect((await service.test(ctx, undefined)).message).toBe(
        'The Jira token is missing — a lead must enter it',
      );
      mock.db.projectIntegration.findUnique.mockResolvedValue(
        projectIntegrationRow({ enabled: false, secretEnc: sealedFor(10) }),
      );
      await expect(service.test(ctx, undefined)).resolves.toEqual({
        ok: true,
        message: 'Connected to Example Jira (Server 9.12.2) — project TEAM (Example Edge Devices)',
        serverTitle: 'Example Jira (Server 9.12.2)',
        projectName: 'Example Edge Devices',
      });
      expect(factory.create.mock.calls[0]![0]).toMatchObject({
        baseUrl: 'https://jira.example',
        authType: 'basic',
        username: 'qa@x',
        secret: PAT,
        verifyTls: false,
      });
      expect(client.project).toHaveBeenCalledWith('TEAM');
    });

    it('reports a secret that cannot be opened', async () => {
      mock.db.projectIntegration.findUnique.mockResolvedValue(
        projectIntegrationRow({ secretEnc: sealedFor(11) }),
      );
      expect((await service.test(ctx, undefined)).message).toMatch(/cannot be decrypted/);
      expect((await service.test(ctx, settings({ secret: undefined }))).message).toBe(
        'Enter the token again',
      );
    });

    it('tests unsaved settings, reusing the stored secret only for the same server', async () => {
      mock.db.projectIntegration.findUnique.mockResolvedValue(
        projectIntegrationRow({ secretEnc: sealedFor(10) }),
      );
      expect((await service.test(ctx, settings({ secret: undefined }))).ok).toBe(true);
      expect(factory.create.mock.calls[0]![0]).toMatchObject({ secret: PAT, authType: 'pat' });
      expect(
        (await service.test(ctx, settings({ secret: '', baseUrl: 'https://other.example' })))
          .message,
      ).toBe('Enter the token to test a different Jira server');
      expect(
        (await service.test(ctx, settings({ baseUrl: 'https://u:p@jira.example' }))).message,
      ).toBe('Remove the user name and password from the URL');
      mock.db.projectIntegration.findUnique.mockResolvedValue(null);
      expect((await service.test(ctx, settings({ secret: undefined }))).message).toBe(
        'Enter the personal access token (or API token for Jira Cloud)',
      );
    });

    it('answers ok:false with the first Jira message', async () => {
      client.serverInfo.mockRejectedValueOnce(
        new JiraError(401, ['You are not authenticated.'], 'Jira rejected the credentials'),
      );
      expect(await service.test(ctx, settings())).toEqual({
        ok: false,
        message: 'You are not authenticated.',
        serverTitle: null,
        projectName: null,
      });
      client.project.mockRejectedValueOnce(new JiraError(404, ['No project'], 'Not found'));
      expect(await service.test(ctx, settings({ projectKey: 'NOPE' }))).toEqual({
        ok: false,
        message:
          'Connected to Example Jira (Server 9.12.2), but project NOPE was not found or is not visible to this account',
        serverTitle: 'Example Jira (Server 9.12.2)',
        projectName: null,
      });
      client.project.mockRejectedValueOnce(new JiraError(403, [], 'Refused'));
      expect((await service.test(ctx, settings())).message).toBe('Refused');
      client.serverInfo.mockResolvedValueOnce({
        serverTitle: null,
        version: null,
        deploymentType: null,
      });
      client.project.mockResolvedValueOnce({ key: 'TEAM', name: null });
      expect((await service.test(ctx, settings())).message).toBe(
        'Connected to Jira — project TEAM',
      );
      client.serverInfo.mockRejectedValueOnce(new Error('bug'));
      await expect(service.test(ctx, settings())).rejects.toThrow('bug');
    });
  });

  it('hands out a client only for enabled settings with a readable secret', async () => {
    const notConfigured = async (message: RegExp) =>
      expect(service.usable(10)).rejects.toMatchObject({
        code: 'JIRA_NOT_CONFIGURED',
        message: expect.stringMatching(message),
      });
    await notConfigured(/not set up for this project/);
    mock.db.projectIntegration.findUnique.mockResolvedValue(
      projectIntegrationRow({ enabled: false, secretEnc: sealedFor(10) }),
    );
    await notConfigured(/turned off/);
    mock.db.projectIntegration.findUnique.mockResolvedValue(
      projectIntegrationRow({ secretEnc: null }),
    );
    await notConfigured(/token is missing/);
    mock.db.projectIntegration.findUnique.mockResolvedValue(
      projectIntegrationRow({ secretEnc: sealedFor(11) }),
    );
    await notConfigured(/cannot be decrypted/);
    mock.db.projectIntegration.findUnique.mockResolvedValue(
      projectIntegrationRow({ secretEnc: sealedFor(10) }),
    );
    const usable = await service.usable(10);
    expect(usable.config.projectKey).toBe('TEAM');
    expect(usable.client).toBe(client);
  });
});

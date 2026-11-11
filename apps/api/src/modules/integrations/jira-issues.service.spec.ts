import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Defect } from '@tmt/database';
import { authUser, defectRow, projectCtx, unitConfig } from '../../../test/unit/fixtures.js';
import { createPrismaMock, type PrismaMock } from '../../../test/unit/prisma-mock.js';
import type { ActivityService } from '../activity/activity.service.js';
import { JiraError, type JiraClient } from './jira-client.js';
import { jiraFailure, JiraIssuesService } from './jira-issues.service.js';
import type { JiraSettingsService } from './jira-settings.service.js';

const config = {
  baseUrl: 'https://jira.example',
  projectKey: 'TEAM',
  issueType: 'Bug',
  authType: 'pat' as const,
  username: null,
  verifyTls: true,
};

describe('JiraIssuesService', () => {
  const me = authUser({ id: 1 });
  const ctx = projectCtx({ id: 10, key: 'JIR', name: 'Jira project' });
  let mock: PrismaMock;
  let activity: { log: jest.Mock<ActivityService['log']> };
  let client: {
    createIssue: jest.Mock<JiraClient['createIssue']>;
    getIssue: jest.Mock<JiraClient['getIssue']>;
  };
  let settings: { usable: jest.Mock<JiraSettingsService['usable']> };
  let service: JiraIssuesService;
  /** The defect as stored; `updateMany`/`update` mocks write the Jira fields back. */
  let stored: Defect;

  const logged = () => activity.log.mock.calls.map((c) => c[1]);

  beforeEach(() => {
    mock = createPrismaMock();
    activity = { log: jest.fn<ActivityService['log']>().mockResolvedValue(undefined) };
    client = {
      createIssue: jest.fn<JiraClient['createIssue']>().mockResolvedValue({ key: 'TEAM-100' }),
      getIssue: jest
        .fn<JiraClient['getIssue']>()
        .mockResolvedValue({ key: 'TEAM-100', summary: 's', statusName: 'To Do' }),
    };
    settings = {
      usable: jest
        .fn<JiraSettingsService['usable']>()
        .mockResolvedValue({ config, client: client as unknown as JiraClient }),
    };
    service = new JiraIssuesService(
      mock.prisma,
      unitConfig({ PUBLIC_URL: 'http://tmt.example.local:3000/' }),
      activity as unknown as ActivityService,
      settings as unknown as JiraSettingsService,
    );
    stored = defectRow();
    mock.db.defect.findFirst.mockImplementation((() => Promise.resolve({ ...stored })) as never);
    mock.db.defect.updateMany.mockImplementation(((args: { data: Partial<Defect> }) => {
      if (stored.externalKey) return Promise.resolve({ count: 0 });
      stored = { ...stored, ...args.data };
      return Promise.resolve({ count: 1 });
    }) as never);
    mock.db.defectLink.findMany.mockResolvedValue([]);
    mock.db.attachment.findMany.mockResolvedValue([]);
    mock.db.user.findMany.mockResolvedValue([]);
    mock.db.release.findMany.mockResolvedValue([]);
  });

  it('maps Jira errors to 502 JIRA_ERROR with status and messages', () => {
    const e = jiraFailure(new JiraError(400, ['issuetype: required'], 'Jira answered HTTP 400'));
    expect(e.getStatus()).toBe(502);
    expect(e.code).toBe('JIRA_ERROR');
    expect(e.message).toBe('Jira answered HTTP 400: issuetype: required');
    expect(e.details).toEqual({ status: 400, messages: ['issuetype: required'] });
    expect(jiraFailure(new JiraError(null, ['Timeout'], 'Timeout')).message).toBe('Timeout');
  });

  describe('create', () => {
    it('creates the issue from the defect and links it', async () => {
      const dto = await service.create(ctx, me, 30);
      expect(dto.externalKey).toBe('TEAM-100');
      const fields = client.createIssue.mock.calls[0]![0];
      expect(fields).toMatchObject({
        project: { key: 'TEAM' },
        issuetype: { name: 'Bug' },
        summary: '[BUG-12] App shows wrong temperature',
        labels: ['tmt'],
      });
      expect(String(fields.description)).toContain(
        'Created from TMT defect [BUG-12|http://tmt.example.local:3000/projects/10/defects/30].',
      );
      expect(String(fields.description)).toContain('|TMT defect|BUG\\-12 (JIR · Jira project)|');
      const update = mock.db.defect.updateMany.mock.calls[0]![0]!;
      expect(update.where).toEqual({ id: 30, externalKey: null });
      expect(update.data).toMatchObject({
        externalKey: 'TEAM-100',
        externalUrl: 'https://jira.example/browse/TEAM-100',
        externalStatus: 'To Do',
      });
      expect(logged()).toEqual([
        expect.objectContaining({
          action: 'jira_created',
          summary: 'Created Jira issue TEAM-100 for BUG-12',
          data: { key: 'TEAM-100', baseUrl: 'https://jira.example' },
        }),
      ]);
    });

    it('keeps the link when the status lookup fails', async () => {
      client.getIssue.mockRejectedValue(new JiraError(500, ['x'], 'x'));
      await service.create(ctx, me, 30);
      expect(mock.db.defect.updateMany.mock.calls[0]![0]!.data).toMatchObject({
        externalKey: 'TEAM-100',
        externalStatus: null,
      });
    });

    it('refuses linked defects before calling Jira', async () => {
      stored = defectRow({ externalKey: 'TEAM-7' });
      await expect(service.create(ctx, me, 30)).rejects.toMatchObject({
        code: 'ALREADY_LINKED',
        message: 'BUG-12 is already linked to TEAM-7',
        details: { externalKey: 'TEAM-7' },
      });
      expect(settings.usable).not.toHaveBeenCalled();
    });

    it('maps Jira failures and leaves the defect unlinked', async () => {
      client.createIssue.mockRejectedValue(
        new JiraError(400, ['issuetype: valid issue type is required'], 'Jira answered HTTP 400'),
      );
      await expect(service.create(ctx, me, 30)).rejects.toMatchObject({
        code: 'JIRA_ERROR',
        details: { status: 400, messages: ['issuetype: valid issue type is required'] },
      });
      expect(mock.db.defect.updateMany).not.toHaveBeenCalled();
    });

    it('creates one issue for concurrent requests on the same defect', async () => {
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      client.createIssue.mockImplementation(async () => {
        await gate;
        return { key: 'TEAM-100' };
      });
      const both = Promise.allSettled([service.create(ctx, me, 30), service.create(ctx, me, 30)]);
      await new Promise((r) => setTimeout(r, 10));
      release();
      const [a, b] = await both;
      expect([a.status, b.status].toSorted()).toEqual(['fulfilled', 'rejected']);
      const failed = (a.status === 'rejected' ? a : b) as PromiseRejectedResult;
      expect(failed.reason).toMatchObject({ code: 'ALREADY_LINKED' });
      expect(client.createIssue).toHaveBeenCalledTimes(1);
    });

    it('reports a link made meanwhile by another process with the created key', async () => {
      mock.db.defect.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.create(ctx, me, 30)).rejects.toMatchObject({
        code: 'ALREADY_LINKED',
        message: 'BUG-12 was linked meanwhile — TEAM-100 was created in Jira',
        details: { createdKey: 'TEAM-100' },
      });
    });
  });

  describe('link', () => {
    it('links an existing issue after checking it in Jira', async () => {
      client.getIssue.mockResolvedValue({ key: 'TEAM-7', summary: 'x', statusName: 'In Progress' });
      await service.link(ctx, me, 30, 'TEAM-7');
      expect(client.getIssue).toHaveBeenCalledWith('TEAM-7');
      expect(mock.db.defect.update.mock.calls[0]![0]).toMatchObject({
        where: { id: 30 },
        data: {
          externalKey: 'TEAM-7',
          externalUrl: 'https://jira.example/browse/TEAM-7',
          externalStatus: 'In Progress',
        },
      });
      expect(logged()[0]).toMatchObject({
        action: 'jira_linked',
        summary: 'Linked BUG-12 to Jira issue TEAM-7',
        data: { key: 'TEAM-7', status: 'In Progress' },
      });
    });

    it('accepts the linked key again but refuses others and unknown issues', async () => {
      stored = defectRow({ externalKey: 'team-7' });
      client.getIssue.mockResolvedValue({ key: 'TEAM-7', summary: null, statusName: null });
      await service.link(ctx, me, 30, 'TEAM-7');
      await expect(service.link(ctx, me, 30, 'TEAM-8')).rejects.toMatchObject({
        code: 'ALREADY_LINKED',
        message: 'BUG-12 is already linked to team-7 — unlink it first',
      });
      stored = defectRow();
      client.getIssue.mockResolvedValue(null);
      await expect(service.link(ctx, me, 30, 'TEAM-404')).rejects.toMatchObject({
        code: 'JIRA_ISSUE_NOT_FOUND',
        message: 'Jira issue TEAM-404 was not found (or is not visible to the integration account)',
      });
      client.getIssue.mockRejectedValue(new JiraError(401, ['no'], 'Jira rejected'));
      await expect(service.link(ctx, me, 30, 'TEAM-1')).rejects.toMatchObject({
        code: 'JIRA_ERROR',
      });
    });
  });

  describe('sync', () => {
    it('refuses unlinked defects and issues gone from Jira', async () => {
      await expect(service.sync(ctx, me, 30)).rejects.toMatchObject({
        code: 'NOT_LINKED',
        message: 'BUG-12 is not linked to a Jira issue',
      });
      stored = defectRow({ externalKey: 'TEAM-1' });
      client.getIssue.mockResolvedValue(null);
      await expect(service.sync(ctx, me, 30)).rejects.toMatchObject({
        code: 'JIRA_ISSUE_NOT_FOUND',
      });
    });

    it('refreshes key and status without touching updatedAt, logging only changes', async () => {
      stored = defectRow({ externalKey: 'TEAM-1', externalStatus: 'To Do' });
      client.getIssue.mockResolvedValue({ key: 'TEAM-1', summary: null, statusName: 'Done' });
      await service.sync(ctx, me, 30);
      expect(mock.db.defect.update.mock.calls[0]![0]!.data).toMatchObject({
        externalStatus: 'Done',
        updatedAt: stored.updatedAt,
      });
      expect(logged()[0]).toMatchObject({
        action: 'jira_synced',
        summary: 'BUG-12: Jira TEAM-1 status To Do → Done',
        data: { key: 'TEAM-1', from: 'To Do', to: 'Done' },
      });

      stored = defectRow({ externalKey: 'TEAM-1', externalStatus: 'Done' });
      client.getIssue.mockResolvedValue({ key: 'TEAM-1', summary: null, statusName: 'Done' });
      await service.sync(ctx, me, 30);
      expect(activity.log).toHaveBeenCalledTimes(1);

      client.getIssue.mockResolvedValue({ key: 'APP-55', summary: null, statusName: null });
      await service.sync(ctx, me, 30);
      expect(logged()[1]!.summary).toBe('BUG-12: Jira APP-55 status Done → —');
    });
  });

  it('unlinks without calling Jira, idempotently', async () => {
    await service.unlink(ctx, me, 30);
    expect(mock.db.defect.update).not.toHaveBeenCalled();
    stored = defectRow({ externalKey: 'TEAM-1', externalStatus: 'Done' });
    await service.unlink(ctx, me, 30);
    expect(mock.db.defect.update.mock.calls[0]![0]!.data).toMatchObject({
      externalKey: null,
      externalUrl: null,
      externalStatus: null,
      externalSyncedAt: null,
    });
    expect(logged()[0]).toMatchObject({
      action: 'jira_unlinked',
      summary: 'Unlinked BUG-12 from Jira issue TEAM-1',
      data: { key: 'TEAM-1' },
    });
    expect(settings.usable).not.toHaveBeenCalled();
  });
});

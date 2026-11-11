import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  HttpClientError,
  type HttpClient,
  type HttpRequestOptions,
  type JsonResponse,
} from './http-client.js';
import {
  authorizationHeader,
  browseUrl,
  describeHttpError,
  errorMessagesOf,
  JiraClient,
  JiraClientFactory,
  JiraError,
  type JiraConnection,
} from './jira-client.js';

const conn: JiraConnection = {
  baseUrl: 'https://jira.example.local',
  authType: 'pat',
  username: null,
  secret: 'pat-123',
  verifyTls: false,
};
const limits = { timeoutMs: 15_000, maxBytes: 1024 };

type RequestJson = (opts: HttpRequestOptions) => Promise<JsonResponse<unknown>>;

function answer(status: number, data: unknown): JsonResponse<unknown> {
  return { status, data, response: {} as JsonResponse<unknown>['response'] };
}

const transportError = (kind: HttpClientError['kind'], message = 'x') =>
  new HttpClientError(kind, message);

async function jiraError(p: Promise<unknown>): Promise<JiraError> {
  let error: unknown;
  try {
    await p;
  } catch (e) {
    error = e;
  }
  expect(error).toBeInstanceOf(JiraError);
  return error as JiraError;
}

describe('Jira client helpers', () => {
  it('collects error messages of Jira error bodies', () => {
    expect(
      errorMessagesOf({ errorMessages: ['Issue Does Not Exist', '', 3], errors: { summary: 'x' } }),
    ).toEqual(['Issue Does Not Exist', 'summary: x']);
    expect(errorMessagesOf({ errors: { a: '', b: 1 } })).toEqual([]);
    expect(errorMessagesOf('text')).toEqual([]);
    expect(errorMessagesOf(null)).toEqual([]);
    const many = errorMessagesOf({
      errorMessages: Array.from({ length: 30 }, () => 'm'.repeat(600)),
    });
    expect(many).toHaveLength(20);
    expect(many[0]).toHaveLength(500);
  });

  it('describes transport failures without URLs or headers', () => {
    expect(describeHttpError(transportError('timeout'), { timeoutMs: 15_000, maxBytes: 1 })).toBe(
      'Jira did not answer within 15 s',
    );
    expect(describeHttpError(transportError('too_large'), limits)).toBe(
      'The Jira response was too large',
    );
    expect(
      describeHttpError(transportError('tls', 'TLS certificate check failed (X)'), limits),
    ).toMatch(/^TLS certificate check failed \(X\) — add the company CA with NODE_EXTRA_CA_CERTS/);
    expect(describeHttpError(transportError('bad_url'), limits)).toBe('The Jira URL is not valid');
    expect(
      describeHttpError(transportError('network', 'Connection failed (ECONNREFUSED)'), limits),
    ).toBe('Cannot reach the Jira server: Connection failed (ECONNREFUSED)');
  });

  it('authenticates with a Bearer PAT or basic auth', () => {
    expect(authorizationHeader(conn)).toBe('Bearer pat-123');
    expect(authorizationHeader({ authType: 'basic', username: 'qa@x', secret: 'tok' })).toBe(
      `Basic ${Buffer.from('qa@x:tok').toString('base64')}`,
    );
    expect(authorizationHeader({ authType: 'basic', username: null, secret: 'tok' })).toBe(
      `Basic ${Buffer.from(':tok').toString('base64')}`,
    );
    expect(browseUrl('https://j', 'A B-1')).toBe('https://j/browse/A%20B-1');
  });
});

describe('JiraClient', () => {
  let requestJson: jest.Mock<RequestJson>;
  let client: JiraClient;

  beforeEach(() => {
    requestJson = jest.fn<RequestJson>();
    client = new JiraClient(conn, { requestJson } as unknown as HttpClient, limits);
  });

  it('calls Jira with the auth header, limits and TLS setting of the connection', async () => {
    requestJson.mockResolvedValue(
      answer(200, { serverTitle: 'Example Jira', version: '9.12.2', deploymentType: '' }),
    );
    await expect(client.serverInfo()).resolves.toEqual({
      serverTitle: 'Example Jira',
      version: '9.12.2',
      deploymentType: null,
    });
    const opts = requestJson.mock.calls[0]![0];
    expect(opts).toMatchObject({
      method: 'GET',
      url: 'https://jira.example.local/rest/api/2/serverInfo',
      timeoutMs: 15_000,
      maxBytes: 1024,
      verifyTls: false,
    });
    expect(opts.headers).toMatchObject({ Authorization: 'Bearer pat-123' });
    expect(opts.headers!['User-Agent']).toMatch(/^TMT\//);
  });

  it('reads projects and maps error statuses with Jira messages', async () => {
    requestJson.mockResolvedValueOnce(answer(200, { key: 'TEAM', name: 'Edge' }));
    await expect(client.project('de de')).resolves.toEqual({ key: 'TEAM', name: 'Edge' });
    expect(requestJson.mock.calls[0]![0].url).toMatch(/\/project\/de%20de$/);
    requestJson.mockResolvedValueOnce(answer(200, null));
    await expect(client.project('X')).resolves.toEqual({ key: 'X', name: null });

    const statuses: [number, string][] = [
      [401, 'Jira rejected the credentials (HTTP 401) — check the token'],
      [403, 'Jira refused the request (HTTP 403) — check the account permissions'],
      [404, 'Not found in Jira (HTTP 404)'],
      [500, 'Jira answered HTTP 500'],
    ];
    for (const [status, message] of statuses) {
      requestJson.mockResolvedValueOnce(answer(status, null));
      const e = await jiraError(client.project('X'));
      expect([e.status, e.message, e.messages]).toEqual([status, message, [message]]);
    }
    requestJson.mockResolvedValueOnce(answer(404, { errorMessages: ['No project'] }));
    expect((await jiraError(client.project('X'))).messages).toEqual(['No project']);
  });

  it('turns transport failures into JiraError without a status', async () => {
    requestJson.mockRejectedValue(new HttpClientError('timeout', 'No answer'));
    const e = await jiraError(client.serverInfo());
    expect(e.status).toBeNull();
    expect(e.messages).toEqual(['Jira did not answer within 15 s']);
    requestJson.mockRejectedValue(new Error('bug'));
    await expect(client.serverInfo()).rejects.toThrow('bug');
  });

  it('creates issues and retries once without labels when Jira refuses them', async () => {
    requestJson.mockResolvedValueOnce(answer(201, { key: 'TEAM-1' }));
    await expect(client.createIssue({ summary: 's', labels: ['tmt'] })).resolves.toEqual({
      key: 'TEAM-1',
    });
    expect(requestJson.mock.calls[0]![0]).toMatchObject({
      method: 'POST',
      json: { fields: { summary: 's', labels: ['tmt'] } },
    });

    requestJson.mockReset();
    requestJson
      .mockResolvedValueOnce(answer(400, { errors: { labels: 'not on the screen' } }))
      .mockResolvedValueOnce(answer(201, { key: 'TEAM-2' }));
    await expect(client.createIssue({ summary: 's', labels: ['tmt'] })).resolves.toEqual({
      key: 'TEAM-2',
    });
    expect(requestJson.mock.calls[1]![0].json).toEqual({ fields: { summary: 's' } });

    requestJson.mockReset();
    requestJson.mockResolvedValue(answer(400, { errors: { issuetype: 'valid issue type' } }));
    const e = await jiraError(client.createIssue({ summary: 's', labels: ['tmt'] }));
    expect(e.messages).toEqual(['issuetype: valid issue type']);
    expect(requestJson).toHaveBeenCalledTimes(1);

    requestJson.mockReset();
    requestJson.mockResolvedValue(answer(201, { id: '1' }));
    expect((await jiraError(client.createIssue({ summary: 's' }))).messages).toEqual([
      'Jira did not return the new issue key',
    ]);
  });

  it('reads issues with status and summary; 404 is null', async () => {
    requestJson.mockResolvedValueOnce(
      answer(200, { key: 'APP-55', fields: { summary: 'moved', status: { name: 'Open' } } }),
    );
    await expect(client.getIssue('TEAM-7')).resolves.toEqual({
      key: 'APP-55',
      summary: 'moved',
      statusName: 'Open',
    });
    expect(requestJson.mock.calls[0]![0].url).toBe(
      'https://jira.example.local/rest/api/2/issue/TEAM-7?fields=status,summary',
    );
    requestJson.mockResolvedValueOnce(answer(200, {}));
    await expect(client.getIssue('TEAM-7')).resolves.toEqual({
      key: 'TEAM-7',
      summary: null,
      statusName: null,
    });
    requestJson.mockResolvedValueOnce(answer(404, { errorMessages: ['Issue Does Not Exist'] }));
    await expect(client.getIssue('TEAM-7')).resolves.toBeNull();
    requestJson.mockResolvedValueOnce(answer(401, {}));
    expect((await jiraError(client.getIssue('TEAM-7'))).status).toBe(401);
  });

  it('searches issues read-only, falling back to the older endpoint of Server/Data Center', async () => {
    const issue = {
      key: 'IOT-1',
      fields: { summary: 'Pairing', description: 'h3. text', status: { name: 'Done' } },
    };
    requestJson.mockResolvedValueOnce(answer(200, { issues: [issue, 'junk', { fields: {} }] }));
    await expect(client.searchIssues('key in (IOT-1)', 50)).resolves.toEqual([
      { key: 'IOT-1', summary: 'Pairing', description: 'h3. text', statusName: 'Done' },
    ]);
    const first = requestJson.mock.calls[0]![0];
    expect(first.method).toBe('GET');
    expect(first.url).toBe(
      'https://jira.example.local/rest/api/2/search/jql?jql=key%20in%20(IOT-1)&fields=summary,status,description&maxResults=50',
    );

    requestJson.mockResolvedValueOnce(answer(404, {}));
    requestJson.mockResolvedValueOnce(answer(200, { issues: [issue] }));
    await expect(client.searchIssues('project = IOT')).resolves.toHaveLength(1);
    expect(requestJson.mock.calls[2]![0].url).toMatch(
      /\/rest\/api\/2\/search\?jql=project%20%3D%20IOT/,
    );

    requestJson.mockResolvedValueOnce(answer(400, { errorMessages: ['Error in the JQL Query'] }));
    expect((await jiraError(client.searchIssues('bad ('))).messages).toEqual([
      'Error in the JQL Query',
    ]);
    requestJson.mockResolvedValueOnce(answer(200, {}));
    await expect(client.searchIssues('project = IOT')).resolves.toEqual([]);
  });

  it('builds clients that share the (adjustable) limits of the factory', async () => {
    const factory = new JiraClientFactory({ requestJson } as unknown as HttpClient);
    expect(factory.limits).toEqual({ timeoutMs: 15_000, maxBytes: 5 * 1024 * 1024 });
    factory.limits.timeoutMs = 300;
    requestJson.mockResolvedValue(answer(200, {}));
    await factory.create(conn).serverInfo();
    expect(requestJson.mock.calls[0]![0].timeoutMs).toBe(300);
  });
});

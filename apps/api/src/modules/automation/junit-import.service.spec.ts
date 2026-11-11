import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  authUser,
  planRow,
  projectCtx,
  PYTEST_XML,
  runCaseRow,
  runRow,
} from '../../../test/unit/fixtures.js';
import { createPrismaMock, type PrismaMock } from '../../../test/unit/prisma-mock.js';
import type { ActivityService } from '../activity/activity.service.js';
import { JunitImportService, readXmlUpload } from './junit-import.service.js';
import { parseJunitXml } from './junit-parse.js';

const multipart = { is: () => 'multipart/form-data' as const };
const xmlFile = (name = 'results.xml', content = PYTEST_XML) => ({
  originalname: name,
  size: content.length,
  buffer: Buffer.from(content),
});
const options = { matchBy: 'auto', dryRun: false, createMissing: false, skippedAs: 'nt' } as const;

describe('JUnit upload', () => {
  it('requires a multipart .xml file', () => {
    expect(() => readXmlUpload({ is: () => false }, xmlFile())).toThrow(
      expect.objectContaining({ code: 'MULTIPART_REQUIRED' }),
    );
    expect(() => readXmlUpload(multipart, undefined)).toThrow(
      expect.objectContaining({ code: 'FILE_REQUIRED' }),
    );
    expect(() => readXmlUpload(multipart, xmlFile('results.txt'))).toThrow(
      expect.objectContaining({ code: 'UNSUPPORTED_FILE_TYPE', status: 415 }),
    );
    expect(readXmlUpload(multipart, xmlFile('../ci/TEST-a.xml')).fileName).toBe('TEST-a.xml');
  });
});

describe('JunitImportService', () => {
  let mock: PrismaMock;
  let activity: { log: jest.Mock<ActivityService['log']> };
  let service: JunitImportService;

  beforeEach(() => {
    mock = createPrismaMock();
    activity = { log: jest.fn<ActivityService['log']>().mockResolvedValue(undefined) };
    service = new JunitImportService(mock.prisma, activity as unknown as ActivityService);
    mock.db.testRun.findFirst.mockResolvedValue({
      ...runRow({ code: 'CI-1' }),
      plan: planRow(),
    } as never);
    mock.db.testPlan.findUnique.mockResolvedValue(planRow());
    mock.db.import.create.mockResolvedValue({ id: 77 } as never);
    mock.db.runCase.findMany.mockResolvedValue([
      runCaseRow({ id: 1, displayId: 'ADP-001', code: 'test_login', sortOrder: 1 }),
      runCaseRow({ id: 2, displayId: 'ADP-002', title: 'Read register 40001', sortOrder: 2 }),
      runCaseRow({ id: 6, displayId: 'ADP-006', title: 'Property', sortOrder: 6 }),
    ]);
  });

  it('refuses completed plans', async () => {
    mock.db.testRun.findFirst.mockResolvedValue({
      ...runRow(),
      plan: planRow({ status: 'completed' }),
    } as never);
    await expect(
      service.importUpload(projectCtx(), authUser(), 3, options, multipart, xmlFile()),
    ).rejects.toMatchObject({ code: 'PLAN_LOCKED' });
  });

  it('writes results, history, the import record and the activity entry', async () => {
    const res = await service.import({
      projectId: 10,
      runId: 3,
      userId: 1,
      role: 'tester',
      fileName: 'pytest.xml',
      tests: parseJunitXml(PYTEST_XML),
      options,
    });
    expect(res).toMatchObject({
      dryRun: false,
      importId: 77,
      totals: { tests: 6, matched: 3, unmatched: 3, updatedRunCases: 3, createdCases: 0 },
      counts: { ok: 1, ng: 2 },
    });
    expect(res.items.map((i) => [i.runCaseId, i.status])).toEqual([
      [1, 'ok'],
      [2, 'ng'],
      [6, 'ng'],
    ]);
    const [, ...values] = mock.db.$executeRaw.mock.calls[0]!;
    expect(values).toContain('JUnit: pytest.xml');
    expect(mock.db.runCaseResult.createMany.mock.calls[0]![0]!.data).toHaveLength(3);
    expect(mock.db.testPlan.updateMany).toHaveBeenCalled();
    expect(mock.db.import.create.mock.calls[0]![0].data).toMatchObject({
      kind: 'junit',
      runId: 3,
      layout: null,
      stats: { tests: 6, matched: 3, ambiguous: 0, ng: 2 },
    });
    expect(activity.log.mock.calls[0]![1]).toMatchObject({
      action: 'junit_imported',
      summary:
        'Imported JUnit results from pytest.xml into run CI-1: 3 run case(s) updated (1 OK, 2 NG), 0 case(s) created, 3 test(s) unmatched',
    });
  });

  it('returns the preview of a dry run and rolls everything back', async () => {
    let rolledBack = false;
    mock.db.$transaction.mockImplementation((async (fn: (tx: unknown) => Promise<unknown>) => {
      try {
        return await fn(mock.db);
      } catch (e) {
        rolledBack = true;
        throw e;
      }
    }) as never);
    const res = await service.import({
      projectId: 10,
      runId: 3,
      userId: 1,
      role: 'tester',
      fileName: 'p.xml',
      tests: parseJunitXml(PYTEST_XML),
      options: { ...options, dryRun: true },
    });
    expect(rolledBack).toBe(true);
    expect(res).toMatchObject({ dryRun: true, importId: null, totals: { updatedRunCases: 3 } });
  });
});

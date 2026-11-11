import { describe, expect, it } from '@jest/globals';
import type { RunCaseDTO } from '@tmt/shared';
import { groupByMock, planRow, runCaseRow, runRow } from '../../../test/unit/fixtures.js';
import { createPrismaMock } from '../../../test/unit/prisma-mock.js';
import { toRunCaseDTO } from './execution.mapper.js';
import {
  buildRunReport,
  groupRunDefects,
  summarizeRunCases,
  toReportCase,
  type RunDefectLink,
} from './run-report.js';

const tom = { id: 5, username: 'tom', displayName: 'Tom' };
const defect = (id: number, seq: number, extra: Partial<RunDefectLink['defect']> = {}) => ({
  id,
  seq,
  title: `Defect ${seq}`,
  status: 'open' as const,
  severity: 'major' as const,
  externalKey: null,
  externalStatus: null,
  ...extra,
});

describe('run report helpers', () => {
  it('groups defects per run case without duplicates and keeps the Jira status run-wide', () => {
    const { byRunCase, distinct } = groupRunDefects([
      { runCaseId: 50, defect: defect(1, 1, { externalKey: 'ACS-7', externalStatus: 'Done' }) },
      { runCaseId: 51, defect: defect(1, 1, { externalKey: 'ACS-7', externalStatus: 'Done' }) },
      { runCaseId: 50, defect: defect(1, 1) },
      { runCaseId: null, defect: defect(2, 2) },
    ]);
    expect(byRunCase.get(50)).toEqual([
      {
        id: 1,
        key: 'BUG-1',
        title: 'Defect 1',
        status: 'open',
        severity: 'major',
        externalKey: 'ACS-7',
      },
    ]);
    expect(byRunCase.get(51)).toHaveLength(1);
    expect(distinct.map((d) => [d.key, d.externalStatus])).toEqual([
      ['BUG-1', 'Done'],
      ['BUG-2', null],
    ]);
  });

  it('summarises counts, top-level sections and elapsed time', () => {
    const s = summarizeRunCases([
      { status: 'ok', sectionPath: ['A', 'A.1'], elapsedSec: 30 },
      { status: 'ng', sectionPath: ['A'], elapsedSec: null },
      { status: 'untested', sectionPath: [], elapsedSec: 15 },
    ]);
    expect(s.counts).toMatchObject({ ok: 1, ng: 1, untested: 1 });
    expect(s.actualDurationSec).toBe(45);
    expect(s.sections).toEqual([
      { path: ['A'], counts: expect.objectContaining({ ok: 1, ng: 1 }) },
      { path: [], counts: expect.objectContaining({ untested: 1 }) },
    ]);
  });

  it('builds report cases with the effective assignee, step results and local times', () => {
    const rc: RunCaseDTO = toRunCaseDTO(
      runCaseRow({
        template: 'steps',
        steps: [
          { action: 'a', expected: 'x', sharedStepName: 'Login' },
          { action: 'b', expected: 'y', sharedStepName: null },
        ],
        stepResults: [{ status: 'ng', actual: 'boom' }],
        executedAt: new Date('2026-10-27T03:00:00Z'),
      }),
      new Map(),
    );
    const line = toReportCase(rc, tom, [], 'Asia/Bangkok');
    expect(line.assignee).toEqual(tom);
    expect(line.executedAt).toBe('2026-10-27T10:00:00.000+07:00');
    expect(line.steps).toEqual([
      { action: 'a', expected: 'x', sharedStepName: 'Login', status: 'ng', actual: 'boom' },
      { action: 'b', expected: 'y', sharedStepName: null, status: 'untested', actual: '' },
    ]);
    const text = toReportCase(
      { ...rc, template: 'text', assignee: { ...tom, id: 6 } },
      tom,
      [],
      'UTC',
    );
    expect(text.steps).toEqual([]);
    expect(text.assignee?.id).toBe(6);
  });

  it('assembles the run report from the database', async () => {
    const { db } = createPrismaMock();
    db.testRun.findFirst.mockResolvedValue({
      ...runRow({ testerId: 5, sourceRunId: 2, testedDate: new Date('2026-10-20T00:00:00Z') }),
      plan: planRow({ releaseId: 5, status: 'in_progress' }),
    } as never);
    db.suite.findUniqueOrThrow.mockResolvedValue({ id: 2, name: 'Modbus', prefix: 'MBS' } as never);
    db.release.findUnique.mockResolvedValue({ id: 5, name: 'FW 2.4.0' } as never);
    db.runCase.findMany.mockResolvedValue([
      {
        ...runCaseRow({ id: 50, status: 'ok', elapsedSec: 90, sectionPath: ['A'] }),
        _count: { defectLinks: 1 },
      },
      { ...runCaseRow({ id: 51, sectionPath: ['B'] }), _count: { defectLinks: 0 } },
    ] as never);
    groupByMock(db.attachment.groupBy).mockResolvedValue([]);
    db.user.findMany.mockResolvedValue([tom] as never);
    db.testRun.findMany.mockResolvedValue([{ id: 2, code: 'SRC' }] as never);
    db.defectLink.findMany.mockResolvedValue([{ runCaseId: 50, defect: defect(9, 4) }] as never);
    db.runCaseResult.aggregate.mockResolvedValue({
      _min: { executedAt: new Date('2026-10-27T01:00:00Z') },
      _max: { executedAt: new Date('2026-10-27T02:00:00Z') },
    } as never);
    db.$queryRaw.mockResolvedValue([{ run_id: 3, total: 15, remaining: 5 }] as never);
    const r = await buildRunReport(db, {
      project: { id: 10, key: 'ACS', name: 'ACS project' },
      runId: 3,
      generatedBy: tom,
      timezone: 'Asia/Bangkok',
      now: new Date('2026-10-28T00:00:00Z'),
    });
    expect(r).toMatchObject({
      generatedAt: '2026-10-28T07:00:00.000+07:00',
      timezone: 'Asia/Bangkok',
      plan: { status: 'in_progress', release: { id: 5, name: 'FW 2.4.0' } },
      run: {
        suite: { prefix: 'MBS' },
        tester: tom,
        testedDate: '2026-10-20',
        sourceRun: { id: 2, code: 'SRC' },
        createdAt: '2026-01-15T15:00:00.000+07:00',
      },
      firstExecutedAt: '2026-10-27T08:00:00.000+07:00',
      lastExecutedAt: '2026-10-27T09:00:00.000+07:00',
      estimate: { totalMinutes: 15, remainingMinutes: 5 },
      actualDurationSec: 90,
      counts: { ok: 1, untested: 1 },
      passRate: 1,
      progress: 0.5,
    });
    expect(r.cases.map((c) => [c.runCaseId, c.assignee?.id, c.defects.length])).toEqual([
      [50, 5, 1],
      [51, 5, 0],
    ]);
    expect(r.defects.map((d) => d.key)).toEqual(['BUG-4']);
    expect(db.runCaseResult.aggregate.mock.calls[0]![0]!.where).toEqual({
      runCase: { runId: 3 },
      status: { not: 'untested' },
    });
  });
});

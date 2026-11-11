import { describe, expect, it } from '@jest/globals';
import { groupByMock, planRow, runCaseRow, runRow, suiteRow } from '../../../test/unit/fixtures.js';
import { createPrismaMock } from '../../../test/unit/prisma-mock.js';
import { buildPlanReportData, orderedEnv, reportCaseOf, templateContext } from './report-data.js';

describe('plan report data', () => {
  it('turns run cases into report rows (step texts, remarks, labels, custom fields)', () => {
    const text = reportCaseOf(
      runCaseRow({
        code: 'PW-1',
        sectionPath: ['Power', 'On'],
        status: 'ok_cond',
        priority: 'high',
        tags: ['Smoke', 'Nightly'],
        procedure: 'Tap',
        expected: 'On',
        caseRemark: 'Library note',
        resultRemark: 'Retest',
        estimateMinutes: 15,
        custom: { register: '2001' },
      }),
      1,
    );
    expect(text).toMatchObject({
      no: 1,
      code: 'PW-1',
      section: 'Power / On',
      result: 'OK with condition',
      priority: 'High',
      tags: 'Smoke, Nightly',
      procedure: 'Tap',
      remark: 'Library note\nRetest',
      estimate: 15,
      cf_register: '2001',
    });
    const steps = reportCaseOf(
      runCaseRow({
        template: 'steps',
        steps: [
          { action: 'Open', expected: 'Home', sharedStepName: 'Login' },
          { action: 'Tap', expected: '', sharedStepName: null },
        ],
        caseRemark: 'Same',
        resultRemark: 'Same',
      }),
      2,
    );
    expect(steps).toMatchObject({
      code: 'MBS-036',
      procedure: '1. Open\n2. Tap',
      expected: '1. Home',
      result: '',
      remark: 'Same',
    });
    expect(reportCaseOf(runCaseRow(), 3)).toMatchObject({ procedure: null, remark: null });
  });

  it('orders the environment like the suite template, unknown labels last', () => {
    expect(
      orderedEnv(
        [
          { label: 'Extra', value: '1' },
          { label: 'unit model', value: 'ACU18' },
          { label: 'Platform', value: 'Android' },
        ],
        ['Platform', 'Unit model'],
      ).map((e) => e.label),
    ).toEqual(['Platform', 'unit model', 'Extra']);
  });

  it('builds the report data of a plan', async () => {
    const { db } = createPrismaMock();
    db.release.findUnique.mockResolvedValue({ name: 'FW 2.4.0' } as never);
    db.testRun.findMany.mockResolvedValue([
      runRow({
        testerId: 5,
        judgement: 'not_pass',
        testedDate: new Date('2026-10-21T00:00:00Z'),
        environment: [
          { label: 'Unit model', value: 'ACU18' },
          { label: 'Platform', value: 'Android 16' },
        ],
      }),
    ]);
    db.suite.findMany.mockResolvedValue([suiteRow({ envTemplate: ['Platform', 'Unit model'] })]);
    db.user.findMany.mockResolvedValue([{ id: 5, username: 'tom', displayName: 'Tom' }] as never);
    groupByMock(db.runCase.groupBy).mockResolvedValue([
      { runId: 3, status: 'ng', _count: { _all: 1 } },
    ]);
    db.runCase.findMany
      .mockResolvedValueOnce([
        {
          runId: 3,
          summaryGroup: 'Power',
          sectionPath: [],
          caseType: 'Normal',
          status: 'ng',
          sortOrder: 1,
        },
      ] as never)
      .mockResolvedValueOnce([runCaseRow({ status: 'ng', summaryGroup: 'Power' })]);
    const data = await buildPlanReportData(db, {
      project: { name: 'ACS project', key: 'ACS' },
      plan: planRow({
        releaseId: 5,
        overallJudgement: 'pass_with_condition',
        status: 'in_progress',
      }),
      timezone: 'Asia/Bangkok',
      now: new Date('2026-10-27T20:00:00Z'),
    });
    expect(data).toMatchObject({
      today: '2026-10-28',
      release: { name: 'FW 2.4.0' },
      plan: { overallJudgement: 'PASS WITH CONDITION', status: 'In progress' },
      groups: ['Power'],
    });
    expect(data.runs[0]).toMatchObject({
      code: 'KR_01',
      tester: 'Tom',
      testedDate: '2026-10-21',
      judgement: 'NOT PASS',
      env: { platform: 'Android 16', unit_model: 'ACU18' },
      groups: { g_power: 'NG' },
      counts: { ng: 1 },
    });
    expect(data.runs[0]!.envList.map((e) => e.label)).toEqual(['Platform', 'Unit model']);
    expect(data.runs[0]!.cases).toHaveLength(1);
  });

  it('collects fields, environment labels and groups of one suite or all live suites', async () => {
    const { db } = createPrismaMock();
    db.suite.findMany.mockResolvedValue([
      suiteRow({
        id: 1,
        fieldDefs: [{ key: 'reg', label: 'Register', type: 'text' }],
        envTemplate: ['Unit model', 'OS'],
      }),
      suiteRow({
        id: 2,
        fieldDefs: [{ key: 'reg', label: 'Register 2', type: 'text' }],
        envTemplate: ['unit  model', 'Phone'],
      }),
    ]);
    db.testCase.findMany.mockResolvedValue([{ summaryGroup: 'A' }, { summaryGroup: 'B' }] as never);
    const ctx = await templateContext(db, 10, null);
    expect(ctx.fieldDefs.map((d) => d.label)).toEqual(['Register']);
    expect(ctx.envLabels).toEqual(['Unit model', 'OS', 'Phone']);
    expect(ctx.groups).toEqual(['A', 'B']);
    expect(db.suite.findMany.mock.calls[0]![0]!.where).toEqual({
      projectId: 10,
      isArchived: false,
    });
    await templateContext(db, 10, 2);
    expect(db.suite.findMany.mock.calls[1]![0]!.where).toEqual({ projectId: 10, id: 2 });
    db.suite.findMany.mockResolvedValue([]);
    expect((await templateContext(db, 10, 9)).groups).toEqual([]);
  });
});

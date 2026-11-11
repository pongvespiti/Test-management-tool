import type { StatusCounts } from '@tmt/shared';
import type { ReportCase, ReportData, ReportRun } from '../../src/export';

const counts = (c: Partial<StatusCounts>): StatusCounts => ({
  untested: 0,
  ok: 0,
  ng: 0,
  ok_cond: 0,
  blocked: 0,
  nt: 0,
  na: 0,
  ...c,
});

function kase(
  no: number,
  sectionPath: string[],
  title: string,
  result: string,
  extra: Partial<ReportCase> = {},
): ReportCase {
  return {
    no,
    code: `TC-${String(no).padStart(3, '0')}`,
    section: sectionPath.join(' / '),
    sectionPath,
    title,
    type: 'Normal',
    precondition: 'Unit power = OFF',
    procedure: '1. Open the app\n2. Tap the power button',
    expected: 'Unit power = ON',
    result,
    actual: result === 'NG' ? 'Unit did not respond' : null,
    remark: null,
    priority: 'Medium',
    tags: '',
    references: null,
    estimate: null,
    cf_register: '2001',
    ...extra,
  };
}

export function sampleRun(code: string, platform: string): ReportRun {
  const cases = [
    kase(1, ['Login'], 'Login with account', 'OK'),
    kase(2, ['Login'], 'Logout', 'OK'),
    kase(3, ['Mode', 'Cool'], 'Cool mode', 'NG', {
      expected: 'Mode = Cool & fan = Auto <checked>\n'.repeat(12).trim(),
    }),
    kase(4, ['Mode', 'Cool'], 'Cool mode set temperature', 'OK with condition'),
    kase(5, ['Mode', 'Heat'], 'Heat mode', 'N/A', { type: 'Abnormal' }),
  ];
  return {
    code,
    scenario: `Unit operation (${platform})`,
    build: '1.1.7(2.0.0)',
    tester: 'Tester One',
    testedDate: '2026-10-21',
    judgement: 'NOT PASS',
    judgementNote: 'One NG in cool mode',
    remark: null,
    envList: [
      { label: 'Platform', value: platform },
      { label: 'Unit model', value: 'MODEL-01' },
      { label: 'FW version', value: '1.2.3' },
    ],
    env: { platform, unit_model: 'MODEL-01', fw_version: '1.2.3' },
    groups: { g_power: 'Pass', g_mode: 'NG' },
    counts: counts({ ok: 2, ng: 1, ok_cond: 1, na: 1 }),
    cases,
  };
}

export function sampleReport(): ReportData {
  return {
    today: '2026-10-23',
    project: { name: 'IoT App', key: 'IOT' },
    release: { name: 'R1 & hotfix' },
    plan: {
      docNo: 'QA-0001',
      title: 'Unit operation test',
      purpose: 'Confirm that the unit can be operated from the app',
      testMethod: 'Operate the unit with the smartphone application',
      judgementCriteria: 'All functions work as specified',
      rawDataPath: '\\\\server\\share\\raw',
      overallJudgement: 'NOT PASS',
      judgementNote: null,
      status: 'Completed',
    },
    groups: ['Power', 'Mode'],
    runs: [sampleRun('KR-01', 'Android'), sampleRun('KR-02 iOS: [beta]', 'iOS')],
  };
}

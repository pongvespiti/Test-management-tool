/**
 * Fictional demo content for `pnpm db:seed`: a smart air-conditioner controller project. Nothing
 * here comes from a real product or test report.
 */
import type {
  CasePriority,
  CaseType,
  DefectSeverity,
  ProjectRole,
  ResultStatus,
} from '@tmt/shared';

export const DEMO_PROJECT = {
  key: 'DEMO',
  name: 'Smart AC controller (demo)',
  description: 'Demo data: firmware and app tests of a fictional smart air-conditioner controller',
  docNoPattern: '{YY}TR-DEMO-{MM}-{SEQ}',
} as const;

export interface DemoUser {
  username: string;
  displayName: string;
  role: ProjectRole;
}

/** Accounts created for the demo, one per project role. */
export const DEMO_USERS: readonly DemoUser[] = [
  { username: 'demo.lead', displayName: 'Demo Lead', role: 'lead' },
  { username: 'demo.manager', displayName: 'Demo Manager', role: 'manager' },
  { username: 'demo.tester', displayName: 'Demo Tester', role: 'tester' },
  { username: 'demo.viewer', displayName: 'Demo Viewer', role: 'viewer' },
];

/** The active release started a week ago and ends in `endInDays` days (dates are relative to the seed day). */
export interface DemoRelease {
  name: string;
  status: 'planned' | 'active' | 'completed';
  startInDays?: number;
  endInDays?: number;
}

export const DEMO_RELEASES: readonly DemoRelease[] = [
  { name: 'v1.0', status: 'active', startInDays: -7, endInDays: 14 },
  { name: 'v1.1', status: 'planned' },
];

/** Application builds per release (index into DEMO_RELEASES); runs and defects refer to them by name. */
export const DEMO_BUILDS = [
  {
    release: 0,
    name: '1.0.0(1.0.0)',
    notes: 'First build handed to test',
    builtDate: '2026-11-02',
  },
  {
    release: 0,
    name: '1.0.0(2.0.0)',
    notes: 'Bug fixes found in 1.0.0(1.0.0)',
    builtDate: '2026-11-09',
  },
  { release: 1, name: '1.1.0(1.0.0)', notes: 'First build of the next step', builtDate: null },
] as const;

export const DEMO_SHARED_STEP = {
  name: 'Sign in to the app',
  description: 'Used by every case that starts from the home screen',
  steps: [
    { action: 'Open the app', expected: 'The sign-in page is shown' },
    { action: 'Sign in with the test account', expected: 'The home screen lists the units' },
  ],
} as const;

export type DemoCase = readonly [title: string, type: CaseType, priority: CasePriority];

export interface DemoSuite {
  name: string;
  /** Big topic the suite belongs to (empty = the suite name). */
  topic?: string;
  prefix: string;
  /** Environment labels a run of this suite fills in. */
  envTemplate: readonly string[];
  sections: Record<string, readonly DemoCase[]>;
}

const ADAPTER_SECTIONS: DemoSuite['sections'] = {
  Pairing: [
    ['Pair with 2.4 GHz router', 'Normal', 'critical'],
    ['Pair with wrong password', 'Abnormal', 'high'],
    ['Pair while router reboots', 'Abnormal', 'medium'],
  ],
  'Cloud sync': [
    ['Status reaches app within 3 s', 'Normal', 'high'],
    ['Command queued while offline', 'Abnormal', 'medium'],
    ['Firmware update over the air', 'Normal', 'critical'],
  ],
};

export const DEMO_SUITES: readonly DemoSuite[] = [
  {
    name: 'Unit operation test',
    topic: 'Unit operation test',
    prefix: 'UO',
    envTemplate: ['Unit model', 'FW version'],
    sections: {
      Power: [
        ['Power on from standby', 'Normal', 'critical'],
        ['Power off during compressor start', 'Abnormal', 'high'],
      ],
      Mode: [
        ['Switch Cool → Heat → Dry → Fan', 'Normal', 'high'],
        ['Mode change while defrosting', 'Abnormal', 'medium'],
      ],
      Temperature: [
        ['Set 16 °C – lower limit', 'Normal', 'high'],
        ['Set 32 °C – upper limit', 'Normal', 'high'],
        ['0.5 °C step in Auto mode', 'Normal', 'low'],
      ],
      Timer: [
        ['On-timer 1 h', 'Normal', 'medium'],
        ['Off-timer across midnight', 'Normal', 'medium'],
        ['Cancel timer after power failure', 'Abnormal', 'high'],
      ],
    },
  },
  {
    name: 'Modbus system test',
    topic: 'Modbus system test',
    prefix: 'MB',
    envTemplate: ['Unit model', 'FW version', 'Modbus master'],
    sections: {
      'Read registers': [
        ['Read operating mode register', 'Normal', 'critical'],
        ['Read room temperature register', 'Normal', 'high'],
      ],
      'Write setpoint': [
        ['Write setpoint 25 °C', 'Normal', 'high'],
        ['Write setpoint out of range', 'Abnormal', 'medium'],
      ],
      'Error handling': [['Timeout when the unit is off', 'Abnormal', 'high']],
    },
  },
  {
    name: 'Adapter operation test – Model A',
    topic: 'Adapter operation test',
    prefix: 'AO',
    envTemplate: [
      'Platform',
      'OS ver',
      'Mobile model',
      'App version',
      'Unit model',
      'FW version',
      'Router',
    ],
    sections: ADAPTER_SECTIONS,
  },
  {
    name: 'Adapter operation test – Model B',
    topic: 'Adapter operation test',
    prefix: 'AP',
    envTemplate: [
      'Platform',
      'OS ver',
      'Mobile model',
      'App version',
      'Unit model',
      'FW version',
      'Router',
    ],
    sections: ADAPTER_SECTIONS,
  },
];

/** A step-by-step case (with the shared steps) added to the Adapter operation test – Model A suite. */
export const DEMO_STEPS_CASE = {
  title: 'Unit appears in the app after pairing',
  priority: 'high' as CasePriority,
  steps: [
    { action: 'Open the unit list', expected: 'The paired unit is listed as online' },
    { action: 'Tap the unit', expected: 'Mode and temperature match the remote control' },
  ],
} as const;

export const DEMO_PLAN = {
  docNo: '26TR-DEMO-01-001',
  title: 'v1.0 system test',
  purpose: 'Confirm unit operation, Modbus and Wi-Fi adapter functions before release v1.0',
  testMethod: 'Manual test on the bench unit',
  judgementCriteria: 'All critical and high priority cases are OK',
} as const;

/** Lists behind the environment labels (Platform → OS ver / Mobile model depend on each other). */
export const DEMO_ENV_LISTS = [
  {
    label: 'Platform',
    parent: null,
    values: [
      { value: 'Android', parent: null },
      { value: 'iOS', parent: null },
    ],
  },
  {
    label: 'OS ver',
    parent: 'Platform',
    values: [
      { value: '14', parent: 'Android' },
      { value: '15', parent: 'Android' },
      { value: '17', parent: 'iOS' },
      { value: '18', parent: 'iOS' },
    ],
  },
  {
    label: 'Mobile model',
    parent: 'Platform',
    values: [
      { value: 'Phone A', parent: 'Android' },
      { value: 'Phone B', parent: 'Android' },
      { value: 'Phone C', parent: 'iOS' },
    ],
  },
  { label: 'App version', parent: null, values: [] },
  { label: 'Unit model', parent: null, values: [] },
  { label: 'FW version', parent: null, values: [] },
  { label: 'ADP&FW', parent: null, values: [] },
  { label: 'Router', parent: null, values: [] },
] as const;

export interface DemoRun {
  /** Index in DEMO_SUITES. */
  suite: number;
  code: string;
  /** Environment of the run: label → value (new values join the lists when the run is saved). */
  environment: Record<string, string>;
  /** Build name in DEMO_BUILDS. */
  build: string;
  /**
   * Who holds the run: the tester, no one (still to hand out) or the lead. The lead's suites are
   * handed out through the topics API, like the Team page does it.
   */
  holder: 'tester' | 'none' | 'lead';
  /** Due date in days from the seed day. */
  dueInDays: number;
}

const APP = { 'App version': '1.0.0' };
const ADAPTER_UNIT_A = { 'Unit model': 'Model A', 'FW version': '1.0.0-rc1', Router: 'AX3000' };
const ADAPTER_UNIT_B = { 'Unit model': 'Model B', 'FW version': '1.0.0-rc2', Router: 'AX3000' };

/** Eight runs: several configurations of the same suite give the summary something to group by. */
export const DEMO_RUNS: readonly DemoRun[] = [
  {
    suite: 0,
    code: 'RUN-1',
    environment: { 'Unit model': 'Model A', 'FW version': '1.0.0-rc1' },
    build: '1.0.0(1.0.0)',
    holder: 'tester',
    dueInDays: 10,
  },
  {
    suite: 0,
    code: 'RUN-2',
    environment: { 'Unit model': 'Model B', 'FW version': '1.0.0-rc2' },
    build: '1.0.0(2.0.0)',
    holder: 'tester',
    dueInDays: 10,
  },
  {
    suite: 1,
    code: 'RUN-3',
    environment: {
      'Unit model': 'Model A',
      'FW version': '1.0.0-rc1',
      'Modbus master': 'PLC simulator',
    },
    build: '1.0.0(2.0.0)',
    holder: 'none',
    dueInDays: 12,
  },
  {
    suite: 2,
    code: 'RUN-4',
    environment: {
      Platform: 'Android',
      'OS ver': '15',
      'Mobile model': 'Phone A',
      ...APP,
      ...ADAPTER_UNIT_A,
    },
    build: '1.0.0(2.0.0)',
    holder: 'tester',
    dueInDays: 8,
  },
  {
    suite: 2,
    code: 'RUN-5',
    environment: {
      Platform: 'iOS',
      'OS ver': '18',
      'Mobile model': 'Phone C',
      ...APP,
      ...ADAPTER_UNIT_A,
    },
    build: '1.0.0(2.0.0)',
    holder: 'tester',
    dueInDays: 8,
  },
  {
    suite: 2,
    code: 'RUN-6',
    environment: {
      Platform: 'Android',
      'OS ver': '14',
      'Mobile model': 'Phone B',
      ...APP,
      ...ADAPTER_UNIT_A,
    },
    build: '1.0.0(2.0.0)',
    holder: 'tester',
    dueInDays: 8,
  },
  {
    suite: 3,
    code: 'RUN-7',
    environment: {
      Platform: 'Android',
      'OS ver': '15',
      'Mobile model': 'Phone A',
      ...APP,
      ...ADAPTER_UNIT_B,
    },
    build: '1.0.0(2.0.0)',
    holder: 'lead',
    dueInDays: 14,
  },
  {
    suite: 3,
    code: 'RUN-8',
    environment: {
      Platform: 'iOS',
      'OS ver': '17',
      'Mobile model': 'Phone C',
      ...APP,
      ...ADAPTER_UNIT_B,
    },
    build: '1.0.0(2.0.0)',
    holder: 'lead',
    dueInDays: 14,
  },
];

/** Repeating result pattern applied to the run cases (`untested` ones are left alone). */
export const DEMO_RESULT_PATTERN: readonly ResultStatus[] = [
  'ok',
  'ok',
  'ok',
  'ng',
  'ok',
  'ok_cond',
  'ok',
  'blocked',
  'ok',
  'untested',
  'ok',
];

export interface DemoDefect {
  title: string;
  severity: DefectSeverity;
  priority: 'high' | 'medium' | 'low';
  steps?: string;
  expected?: string;
  actual?: string;
  /** Names of builds in DEMO_BUILDS. */
  foundInBuild?: string;
  fixedInBuild?: string;
  /** Linked to the first NG result of the demo runs. */
  linkToFirstNg?: boolean;
  /** Moved to Resolved (needs `fixedInBuild`): its failed case waits for a retest on that build. */
  resolved?: boolean;
  comment?: string;
}

export const DEMO_DEFECTS: readonly DemoDefect[] = [
  {
    title: 'Mode switch to Dry ignored while defrost is running',
    severity: 'major',
    priority: 'high',
    steps: '1. Run Heat until defrost starts\n2. Press MODE to select Dry',
    expected: 'The unit changes to Dry after defrost',
    actual: 'The mode stays Heat while the display shows Dry',
    foundInBuild: '1.0.0(1.0.0)',
    fixedInBuild: '1.0.0(2.0.0)',
    linkToFirstNg: true,
    resolved: true,
    comment: 'Reproduced on bench unit A with firmware 1.0.0-rc1.',
  },
  {
    title: 'App shows offline for 10 s after a router reboot',
    severity: 'minor',
    priority: 'medium',
    foundInBuild: '1.0.0(2.0.0)',
  },
];

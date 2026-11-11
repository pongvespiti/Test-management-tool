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

/** Build each demo run was tested on (by run index). */
export const DEMO_RUN_BUILDS: readonly string[] = ['1.0.0(1.0.0)', '1.0.0(2.0.0)'];

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
  prefix: string;
  /** Environment labels a run of this suite fills in. */
  envTemplate: readonly string[];
  sections: Record<string, readonly DemoCase[]>;
}

export const DEMO_SUITES: readonly DemoSuite[] = [
  {
    name: 'Remote control',
    prefix: 'RC',
    envTemplate: ['Unit', 'Firmware'],
    sections: {
      'Power & modes': [
        ['Power on from standby', 'Normal', 'critical'],
        ['Switch Cool → Heat → Dry → Fan', 'Normal', 'high'],
        ['Mode change while defrosting', 'Abnormal', 'medium'],
        ['Power off during compressor start', 'Abnormal', 'high'],
      ],
      'Temperature setting': [
        ['Set 16 °C – lower limit', 'Normal', 'high'],
        ['Set 32 °C – upper limit', 'Normal', 'high'],
        ['Press + at upper limit', 'Abnormal', 'medium'],
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
    name: 'Wi-Fi adapter',
    prefix: 'WF',
    envTemplate: ['Unit', 'Firmware', 'Router'],
    sections: {
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
    },
  },
];

/** A step-by-step case (with the shared steps) added to the first section of the last suite. */
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
  purpose: 'Confirm remote control and Wi-Fi functions before release v1.0',
  testMethod: 'Manual test on the bench unit',
  judgementCriteria: 'All critical and high priority cases are OK',
} as const;

/** Environment values of the run of each suite, in suite order. */
export const DEMO_RUN_ENVIRONMENTS: readonly Record<string, string>[] = [
  { Unit: 'Bench unit A', Firmware: '1.0.0-rc1' },
  { Unit: 'Bench unit B', Firmware: '1.0.0-rc1', Router: 'AX3000' },
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
